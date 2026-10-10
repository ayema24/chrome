import { useMemo, useState } from 'react';
import { useCore, useGames, upsertGames, updateSettings, deleteGame, type GameRecord } from '../lib/store';
import { fetchLichessGames, fetchChesscomGames, importPgnText } from '../lib/db';
import { enqueueAnalysis, useAnalyzer, cancelQueue } from '../lib/analyzer';
import { navigate } from '../lib/router';
import { scoreOf } from '../lib/insights';

export default function Games({ params }: { params: Record<string, string> }) {
  const [tab, setTab] = useState<'list' | 'import'>(params.tab === 'import' ? 'import' : 'list');
  return (
    <div className="stack">
      <div className="more-links">
        <button className="btn" onClick={() => navigate('analysis')}>
          🔍 Analysis
        </button>
        <button className="btn" onClick={() => navigate('scan')}>
          📷 Scan
        </button>
        <button className="btn" onClick={() => navigate('progress')}>
          📈 Progress
        </button>
        <button className="btn" onClick={() => navigate('settings')}>
          ⚙️ Settings
        </button>
      </div>
      <div className="page-head">
        <div>
          <h1>Games database</h1>
          <div className="muted">Your games from here, Lichess and Chess.com. Analysed games feed your weakness profile.</div>
        </div>
        <div className="seg">
          <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
            My games
          </button>
          <button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>
            Import
          </button>
        </div>
      </div>
      {tab === 'list' ? <GameList onImport={() => setTab('import')} /> : <ImportPanel onDone={() => setTab('list')} />}
    </div>
  );
}

function GameList({ onImport }: { onImport: () => void }) {
  const games = useGames();
  const analyzer = useAnalyzer();
  const [filter, setFilter] = useState<'all' | 'mine' | 'unanalysed'>('all');
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      games.filter(
        (g) =>
          (filter === 'all' || (filter === 'mine' ? g.userColor : !g.analysis)) &&
          (!q || `${g.white} ${g.black} ${g.opening ?? ''}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [games, filter, q],
  );
  const unanalysedMine = games.filter((g) => g.userColor && !g.analysis);

  if (games.length === 0)
    return (
      <div className="card">
        <h2>No games yet</h2>
        <p className="muted">Import your recent online games – the coach will analyse them and find your recurring mistakes.</p>
        <button className="btn primary" onClick={onImport}>
          Import games
        </button>
      </div>
    );

  return (
    <div className="stack">
      <div className="row">
        <div className="seg">
          {(['all', 'mine', 'unanalysed'] as const).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? `All (${games.length})` : f === 'mine' ? 'My games' : 'Not analysed'}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Search players or openings" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        <span className="spacer" />
        {analyzer.running ? (
          <>
            <span className="small muted">
              Analysing… {Math.round(analyzer.progress * 100)}% {analyzer.queued ? `(+${analyzer.queued})` : ''}
            </span>
            <button className="btn small" onClick={cancelQueue}>
              Stop queue
            </button>
          </>
        ) : (
          unanalysedMine.length > 0 && (
            <button className="btn primary small" onClick={() => enqueueAnalysis(unanalysedMine.map((g) => g.id))}>
              Analyse {unanalysedMine.length} game{unanalysedMine.length > 1 ? 's' : ''}
            </button>
          )
        )}
      </div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Players</th>
              <th>Result</th>
              <th>Opening</th>
              <th>Accuracy</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 300).map((g) => (
              <GameRow key={g.id} g={g} analysing={analyzer.currentId === g.id} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GameRow({ g, analysing }: { g: GameRecord; analysing: boolean }) {
  const s = scoreOf(g);
  const acc = g.analysis && g.userColor ? g.analysis.accuracy[g.userColor] : null;
  return (
    <tr className="clickable" onClick={() => navigate('analysis', { game: g.id })}>
      <td className="small muted">{new Date(g.date).toLocaleDateString()}</td>
      <td>
        <span style={g.userColor === 'w' ? { fontWeight: 600 } : {}}>{g.white}</span> –{' '}
        <span style={g.userColor === 'b' ? { fontWeight: 600 } : {}}>{g.black}</span>
        <div className="muted small">
          {g.source}
          {g.timeControl ? ` · ${g.timeControl}` : ''}
        </div>
      </td>
      <td>
        {s === null ? g.result : <span className={s === 1 ? 'good' : s === 0 ? 'bad' : ''}>{s === 1 ? 'Won' : s === 0 ? 'Lost' : 'Draw'}</span>}
      </td>
      <td className="small">{g.opening ?? '–'}</td>
      <td>{analysing ? <span className="muted small">analysing…</span> : acc !== null ? `${acc.toFixed(0)}%` : g.analysis ? '✓' : <span className="muted">–</span>}</td>
      <td>
        <button
          className="btn small"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Delete this game?')) deleteGame(g.id);
          }}
          aria-label="Delete"
        >
          🗑
        </button>
      </td>
    </tr>
  );
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const core = useCore();
  const [lichess, setLichess] = useState(core.settings.lichessUser);
  const [chesscom, setChesscom] = useState(core.settings.chesscomUser);
  const [count, setCount] = useState(30);
  const [pgn, setPgn] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [analyse, setAnalyse] = useState(true);

  async function run(kind: 'lichess' | 'chesscom') {
    setError('');
    setMsg('');
    const user = (kind === 'lichess' ? lichess : chesscom).trim();
    if (!user) return;
    setBusy(kind);
    try {
      const games = kind === 'lichess' ? await fetchLichessGames(user, count, core.settings.lichessToken || undefined) : await fetchChesscomGames(user, count);
      updateSettings(kind === 'lichess' ? { lichessUser: user } : { chesscomUser: user });
      upsertGames(games);
      setMsg(`Imported ${games.length} games from ${kind === 'lichess' ? 'Lichess' : 'Chess.com'}.`);
      if (analyse) enqueueAnalysis(games.filter((g) => g.userColor && !g.analysis).map((g) => g.id));
    } catch (e) {
      setError((e as Error).message || 'Import failed – are you online?');
    }
    setBusy('');
  }

  function importPgn() {
    setError('');
    const recs = importPgnText(pgn, lichess || chesscom || undefined);
    if (!recs.length) {
      setError('No valid games found in that PGN.');
      return;
    }
    upsertGames(recs);
    setMsg(`Imported ${recs.length} game${recs.length > 1 ? 's' : ''}. ${recs.some((r) => !r.userColor) ? 'Open a game and tell the coach which side you played.' : ''}`);
    if (analyse) enqueueAnalysis(recs.filter((g) => g.userColor).map((g) => g.id));
    setPgn('');
  }

  return (
    <div className="stack">
      <div className="grid-2">
        <div className="card stack" style={{ gap: 10 }}>
          <h2>Lichess</h2>
          <label className="field">
            Username
            <input type="text" value={lichess} onChange={(e) => setLichess(e.target.value)} placeholder="e.g. DrNykterstein" />
          </label>
          <button className="btn primary" disabled={!!busy || !lichess} onClick={() => run('lichess')}>
            {busy === 'lichess' ? 'Importing…' : 'Import from Lichess'}
          </button>
        </div>
        <div className="card stack" style={{ gap: 10 }}>
          <h2>Chess.com</h2>
          <label className="field">
            Username
            <input type="text" value={chesscom} onChange={(e) => setChesscom(e.target.value)} placeholder="e.g. hikaru" />
          </label>
          <button className="btn primary" disabled={!!busy || !chesscom} onClick={() => run('chesscom')}>
            {busy === 'chesscom' ? 'Importing…' : 'Import from Chess.com'}
          </button>
        </div>
      </div>
      <div className="card row">
        <label className="field" style={{ maxWidth: 160 }}>
          Number of recent games
          <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Math.min(200, +e.target.value || 1)))} />
        </label>
        <label className="check" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={analyse} onChange={(e) => setAnalyse(e.target.checked)} /> Analyse imported games automatically (runs in the background)
        </label>
      </div>
      <div className="card stack" style={{ gap: 10 }}>
        <h2>Paste PGN</h2>
        <textarea rows={6} value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="Paste one or more games in PGN format" />
        <div>
          <button className="btn" onClick={importPgn} disabled={!pgn.trim()}>
            Import PGN
          </button>
        </div>
      </div>
      {msg && (
        <div className="feedback ok row">
          <span>{msg}</span>
          <button className="btn small" onClick={onDone}>
            View games
          </button>
        </div>
      )}
      {error && <div className="feedback fail">{error}</div>}
    </div>
  );
}
