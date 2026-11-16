import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The shared design system first (tokens for both themes, Inter, base and component
// styles), then PhotoMapper's own styles, which use the same tokens.
import '@hhh/ui/tokens.css';
import '@hhh/ui/base.css';
import '@hhh/ui/components.css';
import './styles/index.css';
import { App } from './App.tsx';
import { ShareApp } from './components/ShareApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ToastProvider } from './components/Toast.tsx';

// FEAT: lightweight path branch (no router dependency). /share/:token renders the
// public read-only view; everything else is the full authoring app.
const shareToken = /^\/share\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        {shareToken ? <ShareApp token={decodeURIComponent(shareToken)} /> : <App />}
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
);
