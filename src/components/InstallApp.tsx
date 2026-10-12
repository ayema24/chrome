import { useState } from 'react';
import { useInstall } from '../lib/device';

const DISMISS_KEY = 'cc-install-dismissed';

function IosSteps() {
  return (
    <span className="small">
      In Safari, tap <strong>Share</strong> <span aria-hidden>⎋</span> then <strong>Add to Home Screen</strong>.
    </span>
  );
}

/** Small dismissible strip on phones, offering to install the app. */
export function InstallBanner() {
  const { state, install } = useInstall();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || (state !== 'prompt' && state !== 'ios')) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="install-banner">
      <img src="./icon.svg" alt="" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>Get the Chess Coach app</div>
        {state === 'ios' ? <IosSteps /> : <span className="small muted">Free, full screen, works offline.</span>}
      </div>
      {state === 'prompt' && (
        <button className="btn primary small" onClick={install}>
          Install
        </button>
      )}
      <button className="install-close" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

/** Settings card explaining how to install on each platform. */
export function InstallCard() {
  const { state, install } = useInstall();
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <h2>Install as an app</h2>
      {state === 'installed' ? (
        <div className="small good">✓ You’re using the installed app.</div>
      ) : (
        <>
          <div className="small muted">
            Chess Coach installs straight from the browser, for free: it gets its own home-screen icon, opens full screen without the address bar and works
            offline.
          </div>
          {state === 'prompt' && (
            <div>
              <button className="btn primary" onClick={install}>
                Install app
              </button>
            </div>
          )}
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Android (Chrome):</strong> menu ⋮ → <em>Install app</em> (or <em>Add to Home screen</em>).
            </li>
            <li>
              <strong>iPhone / iPad (Safari):</strong> Share ⎋ → <em>Add to Home Screen</em>.
            </li>
            <li>
              <strong>Computer (Chrome / Edge):</strong> the install icon at the right of the address bar.
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
