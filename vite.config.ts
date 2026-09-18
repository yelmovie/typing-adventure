import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import excludedPublicPaths from './scripts/delivery-exclusions.json';

const publicRoot = fileURLToPath(new URL('./public', import.meta.url));
const projectRoot = fileURLToPath(new URL('.', import.meta.url));
let deliveredDirectory: string | undefined;
const classroomCache = `typing-classroom-${Date.now().toString(36)}`;
// One list governs both the downloadable manifest and generated deployment copies.
const excludedPublic = (path: string) => excludedPublicPaths.some((entry) => entry.endsWith('/') ? path.startsWith(entry) : path === entry);
const isWithin = (root: string, path: string) => {
  const child = relative(root, path);
  return !!child && child !== '..' && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(child);
};
const assertNoLinkedPath = (path: string) => {
  let current = projectRoot;
  if (lstatSync(current).isSymbolicLink()) throw new Error('Build paths must not cross symbolic links or junctions.');
  for (const part of relative(projectRoot, path).split(/[\\/]/)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Build paths must not cross symbolic links or junctions.');
  }
};
const safeDeliveryDirectory = (directory: string) => {
  const dist = resolve(directory);
  if (!isWithin(projectRoot, dist)) throw new Error('Build output must be a directory inside this project.');
  for (const protectedName of ['public', 'assets', 'src', 'scripts', '.git']) {
    const source = join(projectRoot, protectedName);
    if (dist === source || isWithin(source, dist) || isWithin(dist, source)) throw new Error('Build output must not overlap source directories.');
  }
  assertNoLinkedPath(dist);
  return dist;
};
const publicAssets = (directory = publicRoot): { url: string; bytes: number; revision: string }[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const full = join(directory, entry.name);
  if (entry.isDirectory()) return publicAssets(full);
  const url = relative(publicRoot, full).replaceAll('\\', '/');
  if (excludedPublic(url)) return [];
  const content = readFileSync(full);
  return [{ url: `./${url}`, bytes: content.byteLength, revision: createHash('sha256').update(content).digest('hex') }];
});

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    {
      name: 'classroom-delivery-manifest',
      configResolved(config) {
        if (config.command === 'build') safeDeliveryDirectory(resolve(config.root, config.build.outDir));
      },
      generateBundle(_options, bundle) {
        const assets = publicAssets();
        for (const [name, entry] of Object.entries(bundle)) {
          if (!/\.(js|css|html)$/.test(name)) continue;
          const content = entry.type === 'chunk' ? Buffer.from(entry.code) : Buffer.from(entry.source);
          assets.push({ url: `./${name}`, bytes: content.byteLength, revision: createHash('sha256').update(content).digest('hex') });
        }
        assets.sort((a, b) => a.url.localeCompare(b.url));
        this.emitFile({ type: 'asset', fileName: 'classroom-manifest.json', source: JSON.stringify({ cacheName: classroomCache, version: createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16), assets }) });
      },
      writeBundle(options) {
        // Vite can finalize CSS after generateBundle. Hash actual delivered bytes.
        const dist = safeDeliveryDirectory(options.dir ?? join(projectRoot, 'dist'));
        deliveredDirectory = dist;
        const manifestPath = join(dist, 'classroom-manifest.json');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        for (const asset of manifest.assets) {
          const content = readFileSync(join(dist, asset.url));
          asset.bytes = content.byteLength;
          asset.revision = createHash('sha256').update(content).digest('hex');
        }
        manifest.version = createHash('sha256').update(JSON.stringify(manifest.assets)).digest('hex').slice(0, 16);
        writeFileSync(manifestPath, JSON.stringify(manifest));
      },
      closeBundle() {
        // Only generated deployment copies are removed. Authoring sources in public/ remain intact.
        if (!deliveredDirectory) return;
        const dist = safeDeliveryDirectory(deliveredDirectory);
        for (const entry of excludedPublicPaths) {
          const target = resolve(dist, entry);
          if (!isWithin(dist, target)) throw new Error('Excluded asset path must stay inside the generated build.');
          assertNoLinkedPath(target);
          rmSync(target, { recursive: entry.endsWith('/'), force: true });
        }
      },
    },
    VitePWA({
      // main.ts registers after the opening; a player applies waiting updates.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: '타이핑 어드벤처',
        short_name: '타이핑 어드벤처',
        lang: 'ko',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#141a3d',
        background_color: '#0c1030',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        // Keep the first screen and its short opening usable after the local preview
        // server is restarted. Later stages remain opt-in through classroom preparation.
        globPatterns: [
          '**/*.{js,css,html,webmanifest}',
          'classroom-manifest.json',
          'icons/*.png',
          'assets/ui/logo.webp',
          // Fonts and home icons are requested before the service worker controls the
          // page, so the first offline reload needs them precached rather than runtime-cached.
          'fonts/*.woff2',
          'assets/ui/icon_*.webp',
          'assets/portraits/char_*.webp',
          'assets/backgrounds/bg_main_gate.webp',
          'assets/backgrounds/bg_main_gate_blur.webp',
          'assets/video/intro-v1.mp4',
          'assets/video/intro-poster-v1.webp',
          'assets/sprites/*_home.{webp,json}',
          'assets/audio/sfx_*.ogg',
        ],
        globIgnores: ['**/assets/og/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: ({ url }) => /\/(assets|fonts|icons|licenses)\//.test(url.pathname) && !url.searchParams.has('classroom-download'), handler: 'CacheFirst', options: { cacheName: classroomCache, rangeRequests: true, cacheableResponse: { statuses: [200] } } },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    port: Number(process.env.PORT) || 5180,
    host: true,
  },
});
