import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { API } from './config.js'

// Pre-warm backend immediately on load (silent background ping)
try {
  const backendBase = API.replace(/\/api$/, "");
  fetch(`${backendBase}/health`, { mode: 'no-cors' }).catch(() => {});
} catch {}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
