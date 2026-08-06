import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 엔트리 구성
//   /                        "예측의 스케일" (해커톤 출품 콘텐츠)
//   /legacy.html             기존 TERRA React 앱
//   /terra-orbital-sim.html  기존 standalone 궤도 시뮬레이터
//
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        legacy: 'legacy.html',
        terra: 'terra-orbital-sim.html',
      },
    },
  },
  server: {
    // 컨테이너에서 기본값 'localhost'는 IPv6 ::1 에만 바인딩돼
    // 호스트/VSCode 포트포워딩(127.0.0.1)이 붙지 못한다
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
})
