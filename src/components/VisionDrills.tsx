import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import Board from './Board';
import { useCore, updateCore } from '../lib/store';
import { LOCAL_PUZZLES } from '../lib/puzzles';
import { sound } from '../lib/sound';
import { fireConfetti } from '../lib/confetti';

const FILES = 'abcdefgh';
const randSq = () => (FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8))) as Square;
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

export default function VisionDrills() {
  const [drill, setDrill] = useState<'coords' | 'threats' | null>(null);
  const core = useCore();
  const best = core.visionBest ?? {};
  if (drill === 'coords') return <CoordDrill onBack={() => setDrill(null)} />;
  if (drill === 'threats') return <ThreatDrill onBack={() => setDrill(null)} />;
  return (
    <div className="opening-grid">
      <button className="card opening-card" onClick={() => setDrill('coords')}>
        <strong>🎯 Coordinates</strong>
        <div className="muted small">Tap the named square as fast as you can for 30 seconds. Knowing squares instantly makes calculation and notation effortless.</div>
        <div className="small">Best: {best['coords-w'] ?? 0} (White) · {best['coords-b'] ?? 0} (Black)</div>
      </button>
      <button className="card opening-card" onClick={() => setDrill('threats')}>
        <strong>👀 Spot the attacked pieces</strong>
        <div className="muted small">
          Tap every one of your pieces that the opponent attacks right now. This is the blunder-check habit that stops you hanging pieces.
        </div>
        <div className="small">Best streak: {best['threats'] ?? 0}</div>
      </button>
    </div>
  );
}

function CoordDrill({ onBack }: { onBack: () => void }) {
  const core = useCore();
  const [side, setSide] = useState<'w' | 'b'>('w');
  const [target, setTarget] = useState<Square>(randSq());
  const [running, setRunning] = useState(false);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const [done, setDone] = useState<null | { best: boolean }>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  const left = Math.max(0, endsAt - now);
  useEffect(() => {
    if (running && left === 0) {
      setRunning(false);
      const key = `coords-${side}`;
      const isBest = score > (core.visionBest?.[key] ?? 0);
      if (isBest)
        updateCore((c) => {
          c.visionBest = { ...(c.visionBest ?? {}), [key]: score };
        });
      setDone({ best: isBest });
      if (isBest && score > 0) {
        sound.win();
        fireConfetti(80);
      } else sound.end();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, running]);

  function start() {
    setScore(0);
    setMisses(0);
    setDone(null);
    setTarget(randSq());
    setEndsAt(Date.now() + 30000);
    setNow(Date.now());
    setRunning(true);
  }

  function click(sq: Square) {
    if (!running) return;
    if (sq === target) {
      setScore((s) => s + 1);
      sound.move();
      setFlash({ [sq]: 'rgba(63,174,90,0.7)' });
      let n = randSq();
      while (n === target) n = randSq();
      setTarget(n);
    } else {
      setMisses((m) => m + 1);
      sound.bad();
      setFlash({ [sq]: 'rgba(216,69,59,0.7)', [target]: 'rgba(63,174,90,0.5)' });
    }
    setTimeout(() => setFlash({}), 250);
  }

  return (
    <div className="board-layout">
      <div style={{ position: 'relative' }}>
        <Board fen={EMPTY_FEN} orientation={side} onSquareClick={click} highlights={flash} theme={core.settings.boardTheme} showCoords={false} />
        {running && <div className="coord-target">{target}</div>}
      </div>
      <div className="side-col">
        <div className="card">
          <h2>Coordinates</h2>
          <p className="muted small">The board has no labels. Tap the square shown on the board.</p>
          <div className="row">
            <div className="seg">
              <button className={side === 'w' ? 'active' : ''} onClick={() => !running && setSide('w')}>
                White side
              </button>
              <button className={side === 'b' ? 'active' : ''} onClick={() => !running && setSide('b')}>
                Black side
              </button>
            </div>
            {running ? <span className="clock active">{(left / 1000).toFixed(1)}</span> : null}
          </div>
          <div style={{ marginTop: 10 }}>
            <span className="rush-score">{score}</span> <span className="muted small">correct · {misses} missed</span>
          </div>
        </div>
        {done && <div className="feedback ok">{done.best ? `🏆 New best: ${score}!` : `Score: ${score}. Best: ${core.visionBest?.[`coords-${side}`] ?? 0}`}</div>}
        <div className="row">
          {!running && (
            <button className="btn primary" onClick={start}>
              {done ? '↻ Again' : 'Start (30s)'}
            </button>
          )}
          <button className="btn" onClick={onBack}>
            ← Drills
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pieces of the side to move that the opponent attacks (excluding the king). */
function attackedPieces(fen: string): Square[] {
  const c = new Chess(fen);
  const me = c.turn();
  const them = me === 'w' ? 'b' : 'w';
  const out: Square[] = [];
  for (const row of c.board())
    for (const p of row) if (p && p.color === me && p.type !== 'k' && c.isAttacked(p.square, them)) out.push(p.square);
  return out;
}

function ThreatDrill({ onBack }: { onBack: () => void }) {
  const core = useCore();
  const positions = useMemo(() => LOCAL_PUZZLES.map((p) => p.fen).filter((f) => attackedPieces(f).length > 0), []);
  const [fen, setFen] = useState(() => positions[Math.floor(Math.random() * positions.length)]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<null | { ok: boolean }>(null);
  const [streak, setStreak] = useState(0);
  const answer = useMemo(() => new Set<string>(attackedPieces(fen)), [fen]);
  const me = fen.split(' ')[1] as 'w' | 'b';

  function click(sq: Square) {
    if (checked) return;
    const c = new Chess(fen);
    const p = c.get(sq);
    if (!p || p.color !== me || p.type === 'k') return;
    const n = new Set(picked);
    if (n.has(sq)) n.delete(sq);
    else n.add(sq);
    setPicked(n);
    sound.move();
  }

  function check() {
    const ok = answer.size === picked.size && [...answer].every((s) => picked.has(s));
    setChecked({ ok });
    if (ok) {
      const s = streak + 1;
      setStreak(s);
      sound.good();
      if (s > (core.visionBest?.threats ?? 0))
        updateCore((c) => {
          c.visionBest = { ...(c.visionBest ?? {}), threats: s };
        });
    } else {
      setStreak(0);
      sound.bad();
    }
  }

  function nextPos() {
    setFen(positions[Math.floor(Math.random() * positions.length)]);
    setPicked(new Set());
    setChecked(null);
  }

  const highlights: Record<string, string> = {};
  for (const s of picked) highlights[s] = 'rgba(57,135,229,0.55)';
  if (checked)
    for (const s of answer) highlights[s] = picked.has(s) ? 'rgba(63,174,90,0.7)' : 'rgba(216,69,59,0.65)';
  if (checked) for (const s of picked) if (!answer.has(s)) highlights[s] = 'rgba(216,69,59,0.65)';

  const c = new Chess(fen);
  const hanging = [...answer].filter((s) => c.attackers(s as Square, me).length === 0);
  const pieceName = (s: string) => {
    const t = c.get(s as Square)!.type;
    return `${t === 'p' ? 'pawn' : { n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[t]} on ${s}`;
  };

  return (
    <div className="board-layout">
      <Board fen={fen} orientation={me} onSquareClick={click} highlights={highlights} theme={core.settings.boardTheme} showCoords={core.settings.showCoords} />
      <div className="side-col">
        <div className="card">
          <h2>Spot the attacked pieces</h2>
          <p className="small">
            You are <strong>{me === 'w' ? 'White' : 'Black'}</strong>. Tap every one of your pieces (not the king) that the opponent attacks, then press
            Check.
          </p>
          <div className="muted small">Streak: {streak} · best {core.visionBest?.threats ?? 0}</div>
        </div>
        {checked && (
          <div className={`feedback ${checked.ok ? 'ok' : 'fail'}`}>
            {checked.ok ? 'Correct! ' : `Not quite – ${answer.size} piece${answer.size > 1 ? 's are' : ' is'} attacked (shown in green/red). `}
            {hanging.length > 0 && `Attacked and undefended: ${hanging.map(pieceName).join(', ')} – these are the ones that hang!`}
          </div>
        )}
        <div className="row">
          {!checked ? (
            <button className="btn primary" onClick={check}>
              Check
            </button>
          ) : (
            <button className="btn primary" onClick={nextPos}>
              Next position →
            </button>
          )}
          <button className="btn" onClick={onBack}>
            ← Drills
          </button>
        </div>
      </div>
    </div>
  );
}
