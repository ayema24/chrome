import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import { getEngine, isCancelled, type PvLine } from '../lib/engine';
import { lineToEval, formatEval, moverWin, classify, CLASS_LABEL, type MoveClass } from '../lib/analysis';
import { uciLineToSan, formatLine } from '../lib/chess';

interface Props {
  fen: string;
  /** Called with the engine's best move as it updates (for drawing an arrow). */
  onBest?: (uci: string | null) => void;
  onPlay?: (uci: string) => void;
  title?: string;
}

/** Live engine recommendation for the side to move, with the top 3 lines. */
export default function EngineSuggest({ fen, onBest, onPlay, title }: Props) {
  const [lines, setLines] = useState<PvLine[]>([]);
  const [depth, setDepth] = useState(0);
  const over = (() => {
    try {
      return new Chess(fen).isGameOver();
    } catch {
      return true;
    }
  })();

  useEffect(() => {
    setLines([]);
    setDepth(0);
    onBest?.(null);
    if (over) return;
    const engine = getEngine();
    let alive = true;
    const t = setTimeout(() => {
      engine
        .search(fen, {
          depth: 18,
          multipv: 3,
          tag: 'suggest',
          onInfo: (ls) => {
            if (!alive) return;
            setLines(ls);
            setDepth(ls[0]?.depth ?? 0);
          },
        })
        .then((r) => alive && setLines(r.lines))
        .catch((e) => {
          if (!isCancelled(e)) console.warn(e);
        });
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
      engine.stop('suggest');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const best = lines[0]?.pv[0] ?? null;
  useEffect(() => {
    onBest?.(best);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best]);

  const side = fen.split(' ')[1] === 'w' ? 'White' : 'Black';
  if (over) return <div className="card muted small">Game over in this position.</div>;
  const bestSan = best ? uciLineToSan(fen, [best])[0] : null;
  return (
    <div className="card engine-suggest">
      <div className="row">
        <strong>{title ?? `Engine’s best move for ${side}`}</strong>
        <span className="spacer" />
        <span className="muted small">depth {depth}</span>
      </div>
      {bestSan ? (
        <div className="row" style={{ marginTop: 6 }}>
          <span className="best-move">{bestSan}</span>
          <span className="pill">{formatEval(lineToEval(lines[0], fen))}</span>
          <span className="spacer" />
          {onPlay && (
            <button className="btn small primary" onClick={() => onPlay(best!)}>
              Play {bestSan}
            </button>
          )}
        </div>
      ) : (
        <div className="muted small" style={{ marginTop: 6 }}>
          Thinking…
        </div>
      )}
      <div className="engine-lines" style={{ marginTop: 8 }}>
        {lines.map((l) => (
          <div key={l.multipv} className="engine-line" onClick={() => onPlay?.(l.pv[0])} title="Play this move">
            <span className="ev">{formatEval(lineToEval(l, fen))}</span>
            <span>{formatLine(fen, uciLineToSan(fen, l.pv, 8))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface Verdict {
  cls: MoveClass;
  before: string;
  after: string;
}

/** Rates a move (fenBefore → fenAfter) for the side that played it. */
export async function rateMove(fenBefore: string, fenAfter: string): Promise<Verdict | null> {
  const engine = getEngine();
  try {
    const mover = fenBefore.split(' ')[1] as 'w' | 'b';
    const a = await engine.search(fenBefore, { depth: 14, tag: 'verdict' });
    const b = await engine.search(fenAfter, { depth: 14, tag: 'verdict' });
    const evA = lineToEval(a.lines[0], fenBefore);
    const evB = new Chess(fenAfter).isCheckmate() ? { mate: mover === 'w' ? 1 : -1 } : lineToEval(b.lines[0], fenAfter);
    const drop = Math.max(0, moverWin(evA, mover) - moverWin(evB, mover));
    return { cls: classify(drop, false), before: formatEval(evA), after: formatEval(evB) };
  } catch (e) {
    if (!isCancelled(e)) console.warn(e);
    return null;
  }
}

export { CLASS_LABEL };
