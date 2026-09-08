import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
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
        // 프리캐시 = 앱 셸(js/css/html) + UI 아이콘·효과음만. 배경·스프라이트·BGM·폰트는 처음 쓸 때 런타임 캐시.
        // (30명 동시접속 교실에서 첫 방문에 20MB 를 미리 받지 않게)
        globPatterns: ['**/*.{js,css,html,json,ogg,webmanifest}', 'assets/ui/**/*.webp', 'icons/*.png'],
        globIgnores: ['**/assets/sprites/**', '**/assets/backgrounds/**', '**/assets/portraits/**', '**/assets/bgm/**', '**/fonts/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /\/fonts\//, handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 220 } } },
          { urlPattern: /\/assets\/bgm\//, handler: 'CacheFirst', options: { cacheName: 'bgm', expiration: { maxEntries: 12 } } },
          { urlPattern: /\/assets\/(sprites|backgrounds|portraits)\//, handler: 'CacheFirst', options: { cacheName: 'game-assets', expiration: { maxEntries: 300 } } },
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
