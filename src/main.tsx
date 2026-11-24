import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { captureAlertsLinkToken } from './lib/alerts/link-token';
import { startAnalytics } from './lib/analytics/notice';
import { afterAppReady } from './lib/app-ready';
import './styles/app.css';

// First, before the app or Google Analytics reads the address: take an emailed
// preferences link's private key out of it (src/lib/alerts/link-token.ts).
captureAlertsLinkToken();

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Google Analytics and its notice: promptspend.com only, and nothing at all while it is paused (src/lib/analytics).
// The page view is queued now, with the address as it is on arrival; gtag.js
// itself is added once the estimator has drawn, so it no longer delays the
// headline on phones (src/lib/analytics/ga.ts, ScriptTiming).
startAnalytics(undefined, afterAppReady);
