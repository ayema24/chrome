import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app.css';
import { loadStore } from './lib/store';
import { registerSW } from 'virtual:pwa-register';
import { installAudioUnlock } from './lib/sound';

registerSW({ immediate: true });
installAudioUnlock();

loadStore().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
