import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 루트('/')로 들어오면 standalone 시뮬레이터를 띄운다.
// 기존 React 앱은 /index.html 로 그대로 접근 가능.
const serveSimAtRoot = () => ({
  name: 'serve-sim-at-root',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/' || req.url.startsWith('/?')) {
        req.url = '/terra-orbital-sim.html'
      }
      next()
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    serveSimAtRoot(),
    react(),
    tailwindcss(),
  ],
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
  }
})
