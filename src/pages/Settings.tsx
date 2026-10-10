import { useRef, useState } from 'react';
import Board from '../components/Board';
import { useCore, updateSettings, updateCore, exportData, importData, resetAll } from '../lib/store';
import { START_FEN } from '../lib/chess';
import { sound } from '../lib/sound';
import { useSync, connectSync, disconnectSync, syncNow, TOKEN_URL } from '../lib/sync';

export default function Settings() {
  const core = useCore();
  const s = core.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  function download() {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chess-coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restore(file: File) {
    try {
      importData(await file.text());
      setMsg('Backup restored.');
    } catch (e) {
      setMsg(`Could not restore: ${(e as Error).message}`);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        <h2>Accounts</h2>
        <div className="grid-2">
          <label className="field">
            Lichess username
            <input type="text" value={s.lichessUser} onChange={(e) => updateSettings({ lichessUser: e.target.value.trim() })} />
          </label>
          <label className="field">
            Chess.com username
            <input type="text" value={s.chesscomUser} onChange={(e) => updateSettings({ chesscomUser: e.target.value.trim() })} />
          </label>
        </div>
        <label className="field">
          Lichess API token (optional)
          <input type="password" value={s.lichessToken} onChange={(e) => updateSettings({ lichessToken: e.target.value.trim() })} placeholder="lip_…" />
          <span className="muted small">
            Only needed if the opening explorer or puzzle API asks for authentication. Create one at lichess.org → Preferences → API access tokens (no
            scopes needed). Stored only on this device.
          </span>
        </label>
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        <h2>Board</h2>
        <div className="grid-2">
          <div className="stack" style={{ gap: 10 }}>
            <div className="seg">
              {(['brown', 'blue', 'green', 'gray'] as const).map((t) => (
                <button key={t} className={s.boardTheme === t ? 'active' : ''} onClick={() => updateSettings({ boardTheme: t })}>
                  {t}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={s.showCoords} onChange={(e) => updateSettings({ showCoords: e.target.checked })} /> Show coordinates
            </label>
            <label className="check">
              <input type="checkbox" checked={s.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} /> Sound effects
            </label>
            <label className="field">
              Volume: {s.volume ?? 70}%
              <input type="range" min={0} max={100} value={s.volume ?? 70} disabled={!s.sound} onChange={(e) => updateSettings({ volume: +e.target.value })} />
            </label>
            <div className="row">
              <button className="btn small" disabled={!s.sound} onClick={() => sound.move()}>
                ▶ Move
              </button>
              <button className="btn small" disabled={!s.sound} onClick={() => sound.capture()}>
                ▶ Capture
              </button>
              <button className="btn small" disabled={!s.sound} onClick={() => sound.check()}>
                ▶ Check
              </button>
              <button className="btn small" disabled={!s.sound} onClick={() => sound.win()}>
                ▶ Win
              </button>
            </div>
            <label className="check">
              <input type="checkbox" checked={s.animations} onChange={(e) => updateSettings({ animations: e.target.checked })} /> Animations & confetti
            </label>
          </div>
          <div style={{ maxWidth: 220 }}>
            <Board fen={START_FEN} theme={s.boardTheme} showCoords={s.showCoords} />
          </div>
        </div>
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        <h2>Analysis</h2>
        <label className="field">
          Game analysis depth: {s.analysisDepth}
          <input type="range" min={10} max={20} value={s.analysisDepth} onChange={(e) => updateSettings({ analysisDepth: +e.target.value })} />
          <span className="muted small">Higher is more accurate but slower. 14 analyses a typical game in about half a minute on a laptop.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.autoAnalyse} onChange={(e) => updateSettings({ autoAnalyse: e.target.checked })} /> Auto-analyse games I play here
        </label>
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        <h2>Training plan</h2>
        <p className="muted small">
          Your 30-day plan started on {new Date(core.planStart).toLocaleDateString()}. Restart it to begin again from week 1 (your history is kept).
        </p>
        <div>
          <button
            className="btn"
            onClick={() =>
              updateCore((c) => {
                c.planStart = Date.now();
              })
            }
          >
            Restart 30-day plan
          </button>
        </div>
      </div>

      <SyncCard />

      <div className="card stack" style={{ gap: 12 }}>
        <h2>Your data</h2>
        <p className="muted small">
          Everything is stored privately in this browser. Export a backup regularly, or to move to another device.
        </p>
        <div className="row">
          <button className="btn" onClick={download}>
            ⬇ Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ⬆ Restore backup
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          <span className="spacer" />
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Delete ALL your data (games, ratings, progress)? This cannot be undone.')) resetAll();
            }}
          >
            Reset everything
          </button>
        </div>
        {msg && <div className="notice">{msg}</div>}
      </div>

      <div className="card small muted">
        Chess Coach uses Stockfish 18 (GPLv3) via stockfish.js, chess.js, the Lichess and Chess.com public APIs, and the Cburnett piece set.
      </div>
    </div>
  );
}

function SyncCard() {
  const sync = useSync();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const ago = sync.lastSync ? Math.round((Date.now() - sync.lastSync) / 60000) : null;
  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="row">
        <h2 style={{ margin: 0 }}>Sync between devices</h2>
        <span className="spacer" />
        {sync.configured && (
          <span className={`pill ${sync.state === 'error' ? '' : 'status-learned'}`}>
            {sync.state === 'syncing' ? 'Syncing…' : sync.state === 'error' ? '⚠ Sync problem' : '✓ On'}
          </span>
        )}
      </div>
      {!sync.configured ? (
        <>
          <p className="small">
            Keep your phone and laptop in step through a private Gist on your GitHub account. Your progress is merged, so training on both devices never
            loses anything. Set it up once on each device:
          </p>
          <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <a href={TOKEN_URL} target="_blank" rel="noreferrer">
                Create a GitHub token
              </a>{' '}
              – the “gist” box is already ticked. Choose an expiry (e.g. “No expiration” or 1 year), then “Generate token”.
            </li>
            <li>Copy the token (starts with ghp_) and paste it below.</li>
            <li>Do the same on your other device with the same token (or a second one).</li>
          </ol>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input type="password" placeholder="ghp_…" value={token} onChange={(e) => setToken(e.target.value)} />
            <button
              className="btn primary"
              disabled={!token.trim() || busy}
              onClick={async () => {
                setBusy(true);
                await connectSync(token);
                setBusy(false);
                setToken('');
              }}
            >
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          <p className="muted small">The token is stored only in this browser and is never included in the synced data.</p>
        </>
      ) : (
        <>
          <div className="small">
            {sync.state === 'error' ? (
              <span className="bad">{sync.error}</span>
            ) : (
              <>Last synced {ago === null ? 'never' : ago < 1 ? 'just now' : `${ago} min ago`}. Syncs automatically when you open the app and a few seconds after you train.</>
            )}
          </div>
          <div className="row">
            <button className="btn" onClick={() => void syncNow()} disabled={sync.state === 'syncing'}>
              ↻ Sync now
            </button>
            <button className="btn danger" onClick={disconnectSync}>
              Disconnect this device
            </button>
          </div>
          {sync.gistId && (
            <p className="muted small">
              Stored in a secret Gist ({sync.gistId.slice(0, 7)}…). Disconnecting keeps your data on this device and in the Gist.
            </p>
          )}
        </>
      )}
    </div>
  );
}
