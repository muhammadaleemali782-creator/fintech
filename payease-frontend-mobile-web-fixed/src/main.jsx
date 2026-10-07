import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { API } from './config.js'

// Pre-warm backend immediately on load (silent background ping)
try {
  fetch(`${API}/health`).catch(() => {});
} catch {}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
