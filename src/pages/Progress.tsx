import { useMemo, useState } from 'react';
import LineChart from '../components/LineChart';
import { useCore, useGames } from '../lib/store';
import {
  puzzleRatingSeries,
  playRatingSeries,
  accuracySeries,
  blunderSeries,
  rolling,
  themeStats,
  gameStats,
  computeWeaknesses,
  activityByDay,
  dayKey,
  comparePeriods,
  DAY,
  type PeriodSummary,
} from '../lib/insights';
import { themeLabel, TRAINABLE_THEMES } from '../lib/motifs';
import { InsightRow, Stat } from './Home';
import { navigate } from '../lib/router';

export default function Progress() {
  const core = useCore();
  const games = useGames();
  const [range, setRange] = useState<7 | 30 | 3650>(30);
  const since = Date.now() - range * DAY;
  const clip = <T extends { t: number }>(pts: T[]) => pts.filter((p) => p.t >= since);

  const pr = useMemo(() => clip(puzzleRatingSeries(core)), [core, range]);
  const pl = useMemo(() => clip(playRatingSeries(core)), [core, range]);
  const acc = useMemo(() => clip(accuracySeries(games)), [games, range]);
  const bl = useMemo(() => clip(blunderSeries(games)), [games, range]);
  const ts = useMemo(() => themeStats(core, since).filter((t) => TRAINABLE_THEMES.includes(t.theme) && t.attempts >= 3), [core, range]);
  const gs = useMemo(() => gameStats(games.filter((g) => g.date >= since)), [games, range]);
  const weaknesses = useMemo(() => computeWeaknesses(core, games), [core, games]);
  const [prev, now] = useMemo(() => comparePeriods(core, games, range === 7 ? 7 : 14), [core, games, range]);
  const activity = useMemo(() => activityByDay(core, games), [core, games]);

  const days = Array.from({ length: 30 }, (_, i) => dayKey(Date.now() - (29 - i) * DAY));
  const maxAct = Math.max(1, ...days.map((d) => total(activity.get(d))));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Progress</h1>
          <div className="muted">Everything is measured. Here’s how you’re trending.</div>
        </div>
        <div className="seg">
          {([7, 30, 3650] as const).map((r) => (
            <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>
              {r === 7 ? '7 days' : r === 30 ? '30 days' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-row">
        <Stat label="Puzzle rating" value={core.puzzleRating} />
        <Stat label="Play rating" value={core.playRating} />
        <Stat label="Puzzles solved" value={core.puzzleAttempts.filter((a) => a.success && a.t >= since).length} />
        <Stat label="Games analysed" value={gs.analysed} />
        <Stat label="Score" value={gs.score !== null ? `${Math.round(gs.score * 100)}%` : '–'} />
      </div>

      <Comparison prev={prev} now={now} />

      <div className="grid-2">
        <div className="card">
          <h3>Puzzle rating</h3>
          <LineChart series={[{ name: 'Puzzle rating', points: pr, color: 'var(--series-1)' }]} emptyText="Solve puzzles to see your rating trend" />
        </div>
        <div className="card">
          <h3>Play rating (vs engine)</h3>
          <LineChart series={[{ name: 'Play rating', points: pl, color: 'var(--series-1)' }]} emptyText="Play rated games against the engine" />
        </div>
        <div className="card">
          <h3>Game accuracy</h3>
          <LineChart
            series={[
              { name: 'Per game', points: acc, color: 'var(--series-1)' },
              { name: '5-game average', points: rolling(acc, 5), color: 'var(--series-2)', dashed: true },
            ]}
            format={(v) => `${v.toFixed(0)}%`}
            emptyText="Analyse at least two of your games"
          />
        </div>
        <div className="card">
          <h3>Blunders per game (5-game average)</h3>
          <LineChart
            series={[{ name: 'Blunders', points: rolling(bl, 5), color: 'var(--series-1)' }]}
            format={(v) => v.toFixed(1)}
            yMin={0}
            emptyText="Analyse at least two of your games"
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Tactical themes</h3>
          {ts.length === 0 ? (
            <div className="chart-empty">Solve a few puzzles of each theme to see your profile</div>
          ) : (
            <div className="bars">
              {[...ts]
                .sort((a, b) => a.rate - b.rate)
                .map((t) => (
                  <div key={t.theme} className="bar-row" title={`${t.success}/${t.attempts}`}>
                    <button className="btn small" style={{ textAlign: 'left' }} onClick={() => navigate('puzzles', { theme: t.theme })}>
                      {themeLabel(t.theme)}
                    </button>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${t.rate * 100}%` }} />
                    </div>
                    <span className="small">
                      {Math.round(t.rate * 100)}% <span className="muted">({t.attempts})</span>
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Accuracy by game phase</h3>
          {Object.keys(gs.phaseAccuracy).length === 0 ? (
            <div className="chart-empty">Analyse your games to see phase accuracy</div>
          ) : (
            <div className="bars">
              {(['opening', 'middlegame', 'endgame'] as const).map((p) =>
                gs.phaseAccuracy[p] !== undefined ? (
                  <div key={p} className="bar-row">
                    <span style={{ textTransform: 'capitalize' }}>{p}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${gs.phaseAccuracy[p]}%` }} />
                    </div>
                    <span className="small">{gs.phaseAccuracy[p]!.toFixed(0)}%</span>
                  </div>
                ) : null,
              )}
            </div>
          )}
          {gs.openings.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Openings you play</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Opening</th>
                      <th>Games</th>
                      <th>Score</th>
                      <th>Opening accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gs.openings.slice(0, 8).map((o) => (
                      <tr key={o.name}>
                        <td>{o.name}</td>
                        <td>{o.n}</td>
                        <td className={o.score >= 0.55 ? 'good' : o.score < 0.4 ? 'bad' : ''}>{Math.round(o.score * 100)}%</td>
                        <td>{o.accuracy !== null ? `${o.accuracy.toFixed(0)}%` : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Last 30 days of training</h3>
          <div className="heatmap">
            {days.map((d) => {
              const t = total(activity.get(d));
              return (
                <div
                  key={d}
                  className="heat"
                  title={`${d}: ${t} activities`}
                  style={t ? { background: `color-mix(in srgb, var(--series-1) ${25 + (t / maxAct) * 75}%, transparent)` } : {}}
                />
              );
            })}
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            Each square is a day (oldest first). Consistency beats intensity: 20–30 minutes every day.
          </div>
        </div>
        <div className="card">
          <h3>All current weaknesses ({weaknesses.length})</h3>
          {weaknesses.length === 0 ? <p className="muted">Nothing flagged yet.</p> : weaknesses.map((w) => <InsightRow key={w.id} w={w} />)}
        </div>
      </div>
    </div>
  );
}

function total(a?: { puzzles: number; games: number; drills: number; mistakes: number; endgames: number }) {
  return a ? a.puzzles + a.games + a.drills + a.mistakes + a.endgames : 0;
}

function Comparison({ prev, now }: { prev: PeriodSummary; now: PeriodSummary }) {
  const rows: { label: string; a: number | null; b: number | null; fmt: (v: number) => string; higherBetter: boolean }[] = [
    { label: 'Puzzle rating', a: prev.puzzleRating, b: now.puzzleRating, fmt: (v) => v.toFixed(0), higherBetter: true },
    { label: 'Puzzle success', a: prev.puzzleSuccess, b: now.puzzleSuccess, fmt: (v) => `${Math.round(v * 100)}%`, higherBetter: true },
    { label: 'Game accuracy', a: prev.accuracy, b: now.accuracy, fmt: (v) => `${v.toFixed(1)}%`, higherBetter: true },
    { label: 'Blunders per game', a: prev.blunders, b: now.blunders, fmt: (v) => v.toFixed(2), higherBetter: false },
    { label: 'Play rating', a: prev.playRating, b: now.playRating, fmt: (v) => v.toFixed(0), higherBetter: true },
  ];
  return (
    <div className="card table-wrap">
      <h3>Before vs now</h3>
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>{prev.label}</th>
            <th>{now.label}</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.a !== null && r.b !== null ? r.b - r.a : null;
            const good = d !== null && d !== 0 && (d > 0) === r.higherBetter;
            return (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.a !== null ? r.fmt(r.a) : '–'}</td>
                <td>{r.b !== null ? r.fmt(r.b) : '–'}</td>
                <td className={d === null || d === 0 ? 'muted' : good ? 'good' : 'bad'}>
                  {d === null || Math.abs(d) < 1e-9 ? '–' : `${d > 0 ? '▲' : '▼'} ${r.fmt(Math.abs(d))}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
