import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode 제거: 개발 모드에서 컴포넌트를 2회 마운트하는 동작이
// WebGL 컨텍스트 및 shared shader uniform에 문제를 일으킴
createRoot(document.getElementById('root')).render(<App />)

