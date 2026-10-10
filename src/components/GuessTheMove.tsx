import { useMemo, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import Board, { type Arrow, type BoardMove } from './Board';
import { MASTER_GAMES, type MasterGame } from '../data/masterGames';
import { useCore, useGames, updateCore } from '../lib/store';
import { getEngine, isCancelled } from '../lib/engine';
import { lineToEval, moverWin, formatEval } from '../lib/analysis';
import { parsePgn, moveToUci, formatLine } from '../lib/chess';
import { moveSound, sound } from '../lib/sound';
import { fireConfetti } from '../lib/confetti';

interface Source {
  id: string;
  title: string;
  subtitle: string;
  moves: Move[];
  side: 'w' | 'b';
  players: { w: string; b: string };
}

function fromMaster(g: MasterGame): Source {
  const c = new Chess();
  for (const t of g.moves.split(/\s+/)) if (!/^\d+\.+$/.test(t)) c.move(t);
  return {
    id: g.id,
    title: `${g.white} – ${g.black}`,
    subtitle: `${g.event}, ${g.year} · ${g.theme}`,
    moves: c.history({ verbose: true }),
    side: g.side,
    players: { w: g.white, b: g.black },
  };
}

interface Feedback {
  guess: string;
  guessUci: string;
  master: string;
  masterUci: string;
  points: number;
  text: string;
  hint: boolean;
}

export default function GuessTheMove() {
  const core = useCore();
  const games = useGames();
  const [src, setSrc] = useState<Source | null>(null);
  const [side, setSide] = useState<'w' | 'b'>('w');
  const [skipOpening, setSkipOpening] = useState(true);

  const dbGames = useMemo(
    () =>
      games
        .filter((g) => !g.userColor)
        .slice(0, 30)
        .map((g) => {
          const p = parsePgn(g.pgn);
          return p && p.moves.length > 20 && p.startFen.startsWith('rnbqkbnr/pppppppp')
            ? ({ id: g.id, title: `${g.white} – ${g.black}`, subtitle: g.opening ?? 'From your database', moves: p.moves, side: g.result === '0-1' ? 'b' : 'w', players: { w: g.white, b: g.black } } as Source)
            : null;
        })
        .filter((x): x is Source => !!x),
    [games],
  );

  if (src) return <GuessSession key={src.id + side} src={src} side={side} skipOpening={skipOpening} onExit={() => setSrc(null)} />;

  const scores = core.guessScores ?? {};
  const list = [...MASTER_GAMES.map(fromMaster), ...dbGames];
  return (
    <div className="stack">
      <div className="card">
        <h2>Guess the move</h2>
        <p className="muted">
          Replay a master game from one side and predict every move. Matching the master scores 10; other moves are scored by the engine, so a good
          alternative still earns points. It trains the positional judgement puzzles can’t.
        </p>
        <label className="check small">
          <input type="checkbox" checked={skipOpening} onChange={(e) => setSkipOpening(e.target.checked)} /> Skip the first 6 moves (opening)
        </label>
      </div>
      <div className="opening-grid">
        {list.map((s) => (
          <div key={s.id} className="card stack" style={{ gap: 6 }}>
            <strong>{s.title}</strong>
            <div className="muted small">{s.subtitle}</div>
            <div className="small">{Math.ceil(s.moves.length / 2)} moves{scores[s.id] !== undefined ? ` · your best: ${scores[s.id]}%` : ''}</div>
            <div className="row">
              <button
                className="btn small primary"
                onClick={() => {
                  setSide(s.side);
                  setSrc(s);
                }}
              >
                Play as {s.side === 'w' ? s.players.w : s.players.b}
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setSide(s.side === 'w' ? 'b' : 'w');
                  setSrc(s);
                }}
              >
                as {s.side === 'w' ? 'Black' : 'White'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="muted small">
        Tip: open any master game from the opening explorer’s “Top games” and it appears here too.
      </p>
    </div>
  );
}

function GuessSession({ src, side, skipOpening, onExit }: { src: Source; side: 'w' | 'b'; skipOpening: boolean; onExit: () => void }) {
  const core = useCore();
  const firstGuess = (() => {
    const start = skipOpening ? 12 : 0;
    for (let i = start; i < src.moves.length; i++) if (src.moves[i].color === side) return i;
    for (let i = 0; i < src.moves.length; i++) if (src.moves[i].color === side) return i;
    return src.moves.length;
  })();
  const [idx, setIdx] = useState(firstGuess); // ply index of the move to guess
  const [shownPly, setShownPly] = useState(firstGuess); // position shown = before this ply
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [checking, setChecking] = useState(false);
  const [points, setPoints] = useState(0);
  const [max, setMax] = useState(0);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState<null | { pct: number; best: boolean }>(null);
  const [log, setLog] = useState<{ label: string; points: number }[]>([]);

  const fen = shownPly === 0 ? src.moves[0].before : src.moves[shownPly - 1].after;
  const target = src.moves[idx];

  async function onMove(m: BoardMove) {
    if (feedback || checking || done || !target) return;
    const c = new Chess(target.before);
    let mv: Move;
    try {
      mv = c.move(m);
    } catch {
      return;
    }
    moveSound(mv.san);
    const masterUci = moveToUci(target);
    const guessUci = moveToUci(mv);
    const cap = hint ? 5 : 10;
    let pts = 0;
    let text = '';
    if (guessUci === masterUci) {
      pts = cap;
      text = `✓ Exactly ${side === 'w' ? src.players.w : src.players.b}’s move!`;
    } else {
      setChecking(true);
      try {
        const e = getEngine();
        const ra = await e.search(mv.after, { depth: 12, tag: 'guess' });
        const rb = await e.search(target.after, { depth: 12, tag: 'guess' });
        const evYou = new Chess(mv.after).isCheckmate() ? { mate: side === 'w' ? 1 : -1 } : lineToEval(ra.lines[0], mv.after);
        const evMaster = new Chess(target.after).isCheckmate() ? { mate: side === 'w' ? 1 : -1 } : lineToEval(rb.lines[0], target.after);
        const diff = moverWin(evMaster, side) - moverWin(evYou, side);
        pts = diff <= 0 ? cap : diff <= 3 ? Math.min(cap, 8) : diff <= 7 ? Math.min(cap, 6) : diff <= 12 ? Math.min(cap, 4) : diff <= 20 ? Math.min(cap, 2) : 0;
        text =
          diff <= 0
            ? `Your ${mv.san} is at least as good as the master’s ${target.san} (${formatEval(evYou)} vs ${formatEval(evMaster)})!`
            : `The master played ${target.san} (${formatEval(evMaster)}). Your ${mv.san}: ${formatEval(evYou)}.`;
      } catch (err) {
        if (!isCancelled(err)) console.warn(err);
        text = `The master played ${target.san}.`;
      }
      setChecking(false);
    }
    if (pts >= 8) sound.good();
    else if (pts === 0) sound.bad();
    setPoints((p) => p + pts);
    setMax((x) => x + 10);
    setLog((l) => [...l, { label: formatLine(target.before, [target.san]), points: pts }]);
    setFeedback({ guess: mv.san, guessUci, master: target.san, masterUci, points: pts, text, hint });
  }

  function cont() {
    // Play the master's move, then the opponent's reply, then stop at our next move.
    setFeedback(null);
    setHint(false);
    let next = idx + 1;
    while (next < src.moves.length && src.moves[next].color !== side) next++;
    setShownPly(idx + 1);
    moveSound(src.moves[idx].san);
    if (next >= src.moves.length) {
      const pct = Math.round(((points) / Math.max(1, max)) * 100);
      const best = pct > (core.guessScores?.[src.id] ?? -1);
      if (best)
        updateCore((c) => {
          c.guessScores = { ...(c.guessScores ?? {}), [src.id]: pct };
        });
      setTimeout(() => {
        setShownPly(src.moves.length);
        setDone({ pct, best });
        if (pct >= 70) {
          sound.win();
          fireConfetti();
        } else sound.end();
      }, 500);
      return;
    }
    setTimeout(() => {
      setShownPly(next);
      setIdx(next);
      if (src.moves[next - 1]) moveSound(src.moves[next - 1].san);
    }, 550);
  }

  const arrows: Arrow[] = [];
  if (feedback) {
    arrows.push({ from: feedback.masterUci.slice(0, 2), to: feedback.masterUci.slice(2, 4), color: 'g' });
    if (feedback.guessUci !== feedback.masterUci) arrows.push({ from: feedback.guessUci.slice(0, 2), to: feedback.guessUci.slice(2, 4), color: 'r' });
  }
  const lastPly = feedback ? null : shownPly > 0 ? src.moves[shownPly - 1] : null;
  const pct = max ? Math.round((points / max) * 100) : 0;

  return (
    <div className="board-layout">
      <Board
        fen={feedback ? target.before : fen}
        orientation={side}
        movable={!feedback && !checking && !done && shownPly === idx ? side : null}
        onMove={onMove}
        lastMove={lastPly ? [lastPly.from, lastPly.to] : null}
        arrows={arrows}
        highlights={hint && !feedback && target ? { [target.from]: 'rgba(60,140,240,0.55)' } : {}}
        theme={core.settings.boardTheme}
        showCoords={core.settings.showCoords}
      />
      <div className="side-col">
        <div className="card">
          <strong>{src.title}</strong>
          <div className="muted small">{src.subtitle}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="rush-score">{pct}%</span>
            <span className="muted small">
              {points}/{max} points · you are {side === 'w' ? src.players.w : src.players.b}
            </span>
          </div>
        </div>
        {done ? (
          <div className="feedback ok">
            {done.best ? '🏆 New best! ' : ''}Final score {done.pct}% – {done.pct >= 80 ? 'master-level understanding!' : done.pct >= 60 ? 'strong play.' : 'keep studying these ideas.'}
          </div>
        ) : feedback ? (
          <div className={`feedback ${feedback.points >= 8 ? 'ok' : feedback.points === 0 ? 'fail' : ''}`}>
            <strong>+{feedback.points}</strong> {feedback.text}
          </div>
        ) : (
          <div className="feedback info">
            {checking ? 'Comparing with the engine…' : `What would ${side === 'w' ? src.players.w : src.players.b} play? Move ${Math.floor(idx / 2) + 1}.`}
          </div>
        )}
        <div className="row">
          {feedback && !done && (
            <button className="btn primary" onClick={cont}>
              Continue →
            </button>
          )}
          {!feedback && !done && (
            <button className="btn" onClick={() => setHint(true)} disabled={hint || checking}>
              💡 Hint (max 5 pts)
            </button>
          )}
          <button className="btn" onClick={onExit}>
            ← Games
          </button>
        </div>
        {log.length > 0 && (
          <div className="card small">
            {log.slice(-8).map((l, i) => (
              <span key={i} className="pill" style={{ marginRight: 4 }}>
                {l.label} +{l.points}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
