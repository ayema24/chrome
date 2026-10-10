import { useEffect, useState } from 'react';
import { explore, exploreBook, fetchMastersGamePgn, type ExplorerResult } from '../lib/db';
import { useCore, upsertGame } from '../lib/store';
import { pgnToRecord } from '../lib/db';
import { navigate } from '../lib/router';

type Source = 'masters' | 'lichess' | 'book';

export default function Explorer({ fen, onMove }: { fen: string; onMove?: (uci: string) => void }) {
  const core = useCore();
  const [source, setSource] = useState<Source>(() => (localStorage.getItem('cc-explorer') as Source) || 'masters');
  const [data, setData] = useState<ExplorerResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setError('');
    if (source === 'book') {
      setData(exploreBook(fen));
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      explore(fen, source, core.settings.lichessToken || undefined)
        .then((d) => alive && setData(d))
        .catch((e) => {
          if (!alive) return;
          setError((e as Error).message || 'Explorer unavailable');
          setData(exploreBook(fen));
        })
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [fen, source, core.settings.lichessToken]);

  async function openGame(id: string) {
    try {
      const pgn = await fetchMastersGamePgn(id, core.settings.lichessToken || undefined);
      const rec = pgnToRecord(pgn, 'pgn', undefined, `master-${id}`);
      if (rec) {
        upsertGame(rec);
        navigate('analysis', { game: rec.id });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const total = data ? data.white + data.draws + data.black : 0;
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="seg">
          {(['masters', 'lichess', 'book'] as Source[]).map((s) => (
            <button
              key={s}
              className={source === s ? 'active' : ''}
              onClick={() => {
                setSource(s);
                try {
                  localStorage.setItem('cc-explorer', s);
                } catch {
                  /* ignore */
                }
              }}
            >
              {s === 'masters' ? 'Masters' : s === 'lichess' ? 'Lichess players' : 'Coach book'}
            </button>
          ))}
        </div>
        {loading && <span className="muted small">loading…</span>}
      </div>
      {data?.opening && (
        <div className="small" style={{ marginBottom: 6 }}>
          <strong>{data.opening.eco}</strong> {data.opening.name}
        </div>
      )}
      {error && (
        <div className="muted small" style={{ marginBottom: 6 }}>
          {error}. Showing the built-in book.
        </div>
      )}
      {data && data.moves.length === 0 && <div className="muted small">No games in this position.</div>}
      {data && data.moves.length > 0 && (
        <table className="table explorer-table">
          <thead>
            <tr>
              <th>Move</th>
              <th>{data.source === 'book' ? 'Lines' : 'Games'}</th>
              {data.source !== 'book' && <th>White / Draw / Black</th>}
            </tr>
          </thead>
          <tbody>
            {data.moves.map((m) => {
              const n = m.white + m.draws + m.black;
              return (
                <tr key={m.uci} className="clickable" onClick={() => onMove?.(m.uci)}>
                  <td>{m.san}</td>
                  <td>
                    {n.toLocaleString()}
                    {total > 0 && data.source !== 'book' && <span className="muted small"> ({Math.round((n / total) * 100)}%)</span>}
                  </td>
                  {data.source !== 'book' && (
                    <td>
                      <WDL w={m.white} d={m.draws} b={m.black} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data && data.topGames.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>Top games</h3>
          <div className="stack" style={{ gap: 4 }}>
            {data.topGames.map((g) => (
              <button key={g.id} className="btn small" style={{ textAlign: 'left' }} onClick={() => openGame(g.id)}>
                {g.white} {g.whiteRating ? `(${g.whiteRating})` : ''} – {g.black} {g.blackRating ? `(${g.blackRating})` : ''}{' '}
                <span className="muted">
                  {g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½'} {g.year ?? ''}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function WDL({ w, d, b }: { w: number; d: number; b: number }) {
  const t = w + d + b || 1;
  const pct = (x: number) => Math.round((x / t) * 100);
  return (
    <div className="wdl" title={`White ${pct(w)}% · Draw ${pct(d)}% · Black ${pct(b)}%`}>
      <span className="w" style={{ width: `${pct(w)}%` }}>
        {pct(w) >= 15 ? `${pct(w)}%` : ''}
      </span>
      <span className="d" style={{ width: `${pct(d)}%` }}>
        {pct(d) >= 15 ? `${pct(d)}%` : ''}
      </span>
      <span className="b" style={{ width: `${pct(b)}%` }}>
        {pct(b) >= 15 ? `${pct(b)}%` : ''}
      </span>
    </div>
  );
}
