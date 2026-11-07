import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { App } from './ui/App';
import { startAutoSync } from './lib/syncClient';

registerSW({ immediate: true });
// Ask the browser not to evict our data under storage pressure.
void navigator.storage?.persist?.();
startAutoSync();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
