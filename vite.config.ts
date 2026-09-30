import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages는 https://<사용자>.github.io/car-monitor/ 처럼 하위 경로로 서비스되므로
// base를 저장소 이름으로 맞춘다. 로컬 개발(dev)에서는 '/'를 쓴다.
const base = process.env.GITHUB_ACTIONS ? '/car-monitor/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '차량 지출 관리',
        short_name: '차계부',
        description: '주유·지출을 기록하고 통계를 보는 개인용 차계부',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2563EB',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 전체가 정적 파일이므로 빌드 결과를 모두 미리 캐시해 오프라인에서 동작하게 한다.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
