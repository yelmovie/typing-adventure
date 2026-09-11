import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';

const publicRoot = fileURLToPath(new URL('./public', import.meta.url));
const projectRoot = fileURLToPath(new URL('.', import.meta.url));
let deliveredDirectory: string | undefined;
const classroomCache = `typing-classroom-${Date.now().toString(36)}`;
const excludedPublic = (path: string) => path.startsWith('assets/og/') || path === 'assets/video/finale-poster-v1.png';
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
        const dist = resolve(options.dir ?? join(projectRoot, 'dist'));
        const withinProject = relative(projectRoot, dist);
        if (!withinProject || withinProject.startsWith('..') || isAbsolute(withinProject)) throw new Error('Build output must be a directory inside this project.');
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
        const dist = deliveredDirectory;
        rmSync(join(dist, 'assets/og'), { recursive: true, force: true });
        rmSync(join(dist, 'assets/video/finale-poster-v1.png'), { force: true });
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
        orientation: 'landscape',
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
        // App shell only. Bulk media is downloaded only by explicit classroom preparation.
        globPatterns: ['**/*.{js,css,html,webmanifest}', 'classroom-manifest.json', 'icons/*.png'],
        globIgnores: ['**/assets/og/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
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
