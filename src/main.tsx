import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startAnalytics } from './lib/analytics/notice';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Google Analytics and its notice, on promptspend.com only (src/lib/analytics).
startAnalytics();
