import { useMemo } from 'react';
import { useCore, useGames } from '../lib/store';
import { navigate } from '../lib/router';
import {
  computeWeaknesses,
  computeStrengths,
  dailyPlan,
  currentWeek,
  planDay,
  streak,
  gameStats,
  userGames,
  comparePeriods,
  DAY,
  type Insight,
} from '../lib/insights';
import { levelById } from '../lib/levels';

export function severityColor(s: number) {
  return s >= 70 ? 'var(--bad)' : s >= 40 ? 'var(--warn)' : 'var(--accent)';
}

export function InsightRow({ w }: { w: Insight }) {
  return (
    <div className="insight">
      <div className="sev" style={{ background: severityColor(w.severity) }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{w.title}</div>
        <div className="muted small">{w.detail}</div>
      </div>
      {w.action && (
        <button className="btn small" onClick={() => navigate(w.action!.page, w.action!.params)}>
          {w.action.label}
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const core = useCore();
  const games = useGames();
  const weaknesses = useMemo(() => computeWeaknesses(core, games), [core, games]);
  const strengths = useMemo(() => computeStrengths(core, games), [core, games]);
  const tasks = useMemo(() => dailyPlan(core, games, weaknesses), [core, games, weaknesses]);
  const week = currentWeek(core);
  const day = planDay(core);
  const st = streak(core, games);
  const gs = useMemo(() => gameStats(userGames(games, Date.now() - 30 * DAY)), [games]);
  const [prev, now] = useMemo(() => comparePeriods(core, games, 7), [core, games]);
  const doneCount = tasks.filter((t) => t.done >= t.target).length;
  const isNew = core.puzzleAttempts.length === 0 && games.length === 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Your coach</h1>
          <div className="muted">
            Day {Math.min(day, 30)} of your 30-day plan · Week {week.week}: <strong>{week.title}</strong>
          </div>
        </div>
        <div className="row">
          <span className="pill accent">🔥 {st} day streak</span>
          <span className="pill">Level: {levelById(core.settings.level).name}</span>
        </div>
      </div>

      {isNew && (
        <div className="card">
          <h2>Welcome! Let’s find out where you stand.</h2>
          <p className="muted">
            Your coach learns from everything you do – puzzles, games against the engine, and your real online games. The more it sees, the sharper
            its advice gets. Three quick ways to start:
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => navigate('games', { tab: 'import' })}>
              Import my Lichess / Chess.com games
            </button>
            <button className="btn" onClick={() => navigate('puzzles')}>
              Solve 10 puzzles
            </button>
            <button className="btn" onClick={() => navigate('play')}>
              Play the engine
            </button>
          </div>
        </div>
      )}

      <div className="stats-row">
        <Stat label="Puzzle rating" value={core.puzzleRating} delta={deltaOf(prev.puzzleRating, now.puzzleRating)} />
        <Stat label="Play rating (vs engine)" value={core.playRating} delta={deltaOf(prev.playRating, now.playRating)} />
        <Stat label="Avg accuracy (30d)" value={gs.avgAccuracy !== null ? `${gs.avgAccuracy.toFixed(0)}%` : '–'} />
        <Stat label="Blunders / game (30d)" value={gs.blundersPerGame !== null ? gs.blundersPerGame.toFixed(1) : '–'} />
        <Stat label="Mistakes to review" value={core.mistakeDeck.filter((m) => m.due <= Date.now()).length} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>Today’s training</h2>
            <span className="spacer" />
            <span className="muted small">
              {doneCount}/{tasks.length} done
            </span>
          </div>
          <p className="muted small">{week.goal}</p>
          {tasks.map((t) => {
            const done = t.done >= t.target;
            return (
              <div key={t.id} className={`task ${done ? 'done' : ''}`}>
                <div className="tick">{done ? '✓' : ''}</div>
                <div>
                  <div className="task-title" style={{ fontWeight: 600 }}>
                    {t.title}{' '}
                    <span className="muted small">
                      {Math.min(t.done, t.target)}/{t.target}
                    </span>
                  </div>
                  <div className="muted small">{t.detail}</div>
                  <div className={`progressbar ${done ? 'done' : ''}`} style={{ marginTop: 6 }}>
                    <div style={{ width: `${Math.min(100, (t.done / t.target) * 100)}%` }} />
                  </div>
                </div>
                <button className="btn small" onClick={() => navigate(t.action.page, t.action.params)}>
                  {t.action.label}
                </button>
              </div>
            );
          })}
        </div>

        <div className="stack">
          <div className="card">
            <h2>What’s holding you back</h2>
            {weaknesses.length === 0 ? (
              <p className="muted">
                Not enough data yet. Play a game, solve puzzles or import your online games – your weaknesses will appear here and update live.
              </p>
            ) : (
              weaknesses.slice(0, 5).map((w) => <InsightRow key={w.id} w={w} />)
            )}
            {weaknesses.length > 5 && (
              <button className="btn small" onClick={() => navigate('progress')}>
                See all {weaknesses.length}
              </button>
            )}
          </div>
          {strengths.length > 0 && (
            <div className="card">
              <h2>Your strengths</h2>
              <div className="row">
                {strengths.map((s) => (
                  <span key={s.id} className="pill accent" title={s.detail}>
                    ✓ {s.title} <span className="muted">· {s.detail}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid-3">
        <QuickCard title="Play" icon="♟" text="Spar against Stockfish at your level with a live coach." onClick={() => navigate('play')} />
        <QuickCard title="Openings & gambits" icon="📖" text="Learn lines move-by-move, then drill them with spaced repetition." onClick={() => navigate('openings')} />
        <QuickCard title="Scan a board" icon="📷" text="Photo or screenshot → position → analyse it." onClick={() => navigate('scan')} />
      </div>
    </div>
  );
}

function deltaOf(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return b - a;
}

export function Stat({ label, value, delta }: { label: string; value: string | number; delta?: number | null }) {
  return (
    <div className="card stat">
      <span className="value">{value}</span>
      <span className="label">{label}</span>
      {delta !== undefined && delta !== null && delta !== 0 && (
        <span className={`delta ${delta > 0 ? 'good' : 'bad'}`}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))} this week
        </span>
      )}
    </div>
  );
}

function QuickCard({ title, icon, text, onClick }: { title: string; icon: string; text: string; onClick: () => void }) {
  return (
    <button className="card opening-card" onClick={onClick}>
      <div style={{ fontSize: '1.6rem' }}>{icon}</div>
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div className="muted small">{text}</div>
    </button>
  );
}
