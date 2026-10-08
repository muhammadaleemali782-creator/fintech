import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { API } from './config.js'

// Pre-warm backend immediately on load (silent background ping)
try {
  fetch(`${API}/health`).catch(() => {});
} catch {}

// Automatically handle stale chunks after new deployments (prevents white screen)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const reloadKey = 'educa_preload_reloaded';
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, 'true');
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

