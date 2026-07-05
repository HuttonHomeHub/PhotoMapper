import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App.jsx';
import { ShareApp } from './components/ShareApp.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ToastProvider } from './components/Toast.jsx';

// FEAT: lightweight path branch (no router dependency). /share/:token renders the
// public read-only view; everything else is the full authoring app.
const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)\/?$/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        {shareMatch ? <ShareApp token={decodeURIComponent(shareMatch[1])} /> : <App />}
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
);
