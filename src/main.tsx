import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { App } from './ui/App';
import { startAutoSync } from './lib/syncClient';

// iPhone home-screen apps are usually resumed, not relaunched, so they rarely look for a new
// version on their own. Check whenever the app comes back to the screen, and hourly while open;
// with autoUpdate the page reloads into the new version as soon as it is installed.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => {
      if (navigator.onLine) void reg.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 60 * 60 * 1000);
  }
});
// Ask the browser not to evict our data under storage pressure.
void navigator.storage?.persist?.();
startAutoSync();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
