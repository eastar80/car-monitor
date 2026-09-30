import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ensureSeeded } from './db'
import './index.css'

// 첫 실행이면 기본 그룹·카테고리·차량을 만든 뒤 화면을 띄운다.
ensureSeeded().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* GitHub Pages처럼 서버 라우팅이 없는 곳에서도 새로고침이 깨지지 않도록 해시 라우터를 쓴다. */}
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  )
})
