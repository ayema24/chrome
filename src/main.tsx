import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app.css';
import { loadStore } from './lib/store';
import { registerSW } from 'virtual:pwa-register';
import { installAudioUnlock } from './lib/sound';
import { startAutoSync } from './lib/sync';
import { installPromptListener } from './lib/device';

registerSW({ immediate: true });
installAudioUnlock();
installPromptListener();

loadStore().then(() => {
  startAutoSync();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
