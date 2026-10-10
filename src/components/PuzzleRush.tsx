import { useEffect, useRef, useState } from 'react';
import PuzzleSolver from './PuzzleSolver';
import { LOCAL_PUZZLES } from '../lib/puzzles';
import { useCore, updateCore } from '../lib/store';
import { sound } from '../lib/sound';
import { fireConfetti } from '../lib/confetti';
import type { Puzzle } from '../lib/puzzleTypes';

const MODES = [
  { id: '3min', label: '3 minutes', seconds: 180, lives: 3 },
  { id: '5min', label: '5 minutes', seconds: 300, lives: 3 },
  { id: 'survival', label: 'Survival', seconds: 0, lives: 3 },
] as const;
type ModeId = (typeof MODES)[number]['id'];

/** Puzzles get harder as you go: the target rating climbs with every solve. */
function pickRushPuzzle(solved: number, used: Set<string>): Puzzle | null {
  const target = 550 + solved * 45;
  const pool = LOCAL_PUZZLES.filter((p) => !used.has(p.id));
  if (!pool.length) return null;
  const sorted = [...pool].sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
  const top = sorted.slice(0, 5);
  return top[Math.floor(Math.random() * top.length)];
}

export default function PuzzleRush() {
  const core = useCore();
  const [mode, setMode] = useState<ModeId | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [over, setOver] = useState<null | { newBest: boolean }>(null);
  const [missed, setMissed] = useState<Puzzle[]>([]);
  const used = useRef(new Set<string>());
  const cfg = MODES.find((m) => m.id === mode);
  const best = core.rushBest ?? {};

  useEffect(() => {
    if (!mode || over || !cfg?.seconds) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [mode, over, cfg?.seconds]);

  const timeLeft = cfg?.seconds ? Math.max(0, endsAt - now) : null;
  useEffect(() => {
    if (timeLeft === 0 && !over && mode) finish(score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  function start(m: ModeId) {
    used.current = new Set();
    setMode(m);
    setScore(0);
    setStrikes(0);
    setMissed([]);
    setOver(null);
    const c = MODES.find((x) => x.id === m)!;
    setEndsAt(Date.now() + c.seconds * 1000);
    setNow(Date.now());
    sound.start();
    next(0);
  }

  function next(solved: number) {
    const p = pickRushPuzzle(solved, used.current);
    if (!p) {
      finish(solved);
      return;
    }
    used.current.add(p.id);
    setPuzzle(p);
  }

  function finish(final: number) {
    if (!mode) return;
    const prev = best[mode] ?? 0;
    const newBest = final > prev;
    if (newBest)
      updateCore((c) => {
        c.rushBest = { ...(c.rushBest ?? {}), [mode]: final };
      });
    setOver({ newBest });
    if (newBest && final > 0) {
      sound.win();
      fireConfetti();
    } else sound.end();
  }

  function onResult(ok: boolean) {
    if (over || !puzzle) return;
    if (ok) {
      const s = score + 1;
      setScore(s);
      setTimeout(() => !over && next(s), 450);
    } else {
      const k = strikes + 1;
      setStrikes(k);
      setMissed((m) => [...m, puzzle]);
      if (k >= (cfg?.lives ?? 3)) setTimeout(() => finish(score), 600);
      else setTimeout(() => next(score), 700);
    }
  }

  if (!mode || over) {
    return (
      <div className="stack">
        <div className="card">
          <h2>{over ? (over.newBest ? `🏆 New best: ${score}!` : `Score: ${score}`) : 'Puzzle Rush'}</h2>
          <p className="muted">
            Solve as many puzzles as you can. They start easy and get harder with every solve. Three mistakes and you’re out. Rush results don’t change
            your puzzle rating – it’s pure speed training.
          </p>
          <div className="row">
            {MODES.map((m) => (
              <button key={m.id} className="btn primary" onClick={() => start(m.id)}>
                {over && m.id === mode ? '↻ ' : ''}
                {m.label} <span style={{ opacity: 0.75 }}>· best {best[m.id] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        {over && missed.length > 0 && (
          <div className="card">
            <h3>Puzzles you missed</h3>
            <div className="muted small">
              {missed.map((p) => `${p.title ?? p.themes.find((t) => !['middlegame', 'endgame', 'short', 'oneMove', 'crushing', 'advantage', 'long'].includes(t)) ?? 'tactic'} (${p.rating})`).join(' · ')}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card row rush-bar">
        <span className="rush-score">{score}</span>
        <span className="muted small">solved</span>
        <span className="spacer" />
        <span className="rush-strikes">
          {Array.from({ length: cfg!.lives }, (_, i) => (
            <span key={i} className={i < strikes ? 'bad' : 'muted'}>
              ✗
            </span>
          ))}
        </span>
        {timeLeft !== null && (
          <span className={`clock active ${timeLeft < 20000 ? 'low' : ''}`}>
            {Math.floor(timeLeft / 60000)}:{String(Math.floor((timeLeft % 60000) / 1000)).padStart(2, '0')}
          </span>
        )}
        <button className="btn small" onClick={() => finish(score)}>
          End
        </button>
      </div>
      {puzzle && <PuzzleSolver key={puzzle.id} puzzle={puzzle} compact showRating onResult={(ok) => onResult(ok)} onNext={() => next(score)} />}
    </div>
  );
}
