import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 엔트리 구성
//   /                        "예측의 스케일" (해커톤 출품 콘텐츠)
//   /terra-orbital-sim.html  standalone 궤도 시뮬레이터 (같은 엔진, UI만 다름)
//
// legacy.html(구 TERRA React 앱)은 출품 범위에서 제외했다. 화면이 중복되는 데다,
// @react-three/drei 의 <Text> 가 런타임에 외부 CDN(jsdelivr)에서 폰트 데이터를
// 받고 three.js 예제 텍스처를 원격 참조해, 외부 리소스 출처·라이선스 표기 부담만
// 늘렸기 때문이다. 필요하면 커밋 cf12895 에서 되살릴 수 있다.
//
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
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
