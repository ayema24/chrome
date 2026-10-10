import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Chess, type Square } from 'chess.js';
import { PIECE_IMG } from './pieces';
import { useCore } from '../lib/store';

export type BadgeKind = 'book' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'correct' | 'wrong';

const BADGE_SYMBOL: Record<BadgeKind, string> = {
  book: '📖',
  best: '★',
  excellent: '!',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  correct: '✓',
  wrong: '✗',
};

export interface Arrow {
  from: string;
  to: string;
  color?: string;
}

export interface BoardMove {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export interface BoardProps {
  fen: string;
  orientation?: 'w' | 'b';
  /** Which side the user may move. null = not interactive. */
  movable?: 'w' | 'b' | 'both' | null;
  onMove?: (m: BoardMove) => void;
  /** Overrides move handling (used by the board editor). */
  onSquareClick?: (sq: Square) => void;
  lastMove?: [string, string] | null;
  arrows?: Arrow[];
  highlights?: Record<string, string>;
  theme?: 'brown' | 'blue' | 'green' | 'gray';
  showCoords?: boolean;
  /** When true, any piece can be moved anywhere (no legality checks). */
  freeMove?: boolean;
  /** Small icon on a square, e.g. the quality of the last move. */
  badge?: { square: string; kind: BadgeKind } | null;
  /** Change this number to shake the board (wrong answer). */
  shake?: number;
  /** Briefly glow the board ('good' | 'bad'); change `glowKey` to replay. */
  glow?: 'good' | 'bad' | null;
  glowKey?: number;
  /** Content drawn over the board (e.g. a result banner). */
  overlay?: ReactNode;
}

interface PieceItem {
  key: string;
  sq: Square;
  code: string; // e.g. wK
  /** Captured / removed: fades out, then disappears. */
  dying?: boolean;
}

const FILES = 'abcdefgh';

function sqToXY(sq: string, orientation: 'w' | 'b'): [number, number] {
  const f = FILES.indexOf(sq[0]);
  const r = parseInt(sq[1], 10) - 1;
  return orientation === 'w' ? [f, 7 - r] : [7 - f, r];
}

function xyToSq(x: number, y: number, orientation: 'w' | 'b'): Square | null {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  const f = orientation === 'w' ? x : 7 - x;
  const r = orientation === 'w' ? 7 - y : y;
  return (FILES[f] + (r + 1)) as Square;
}

function piecesFromFen(fen: string): { sq: Square; code: string }[] {
  const out: { sq: Square; code: string }[] = [];
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, ri) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += parseInt(ch, 10);
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        out.push({ sq: (FILES[f] + (8 - ri)) as Square, code: color + ch.toUpperCase() });
        f++;
      }
    }
  });
  return out;
}

let keySeq = 0;

/** Keeps stable keys for pieces between positions so moves animate. */
function diffPieces(prev: PieceItem[], next: { sq: Square; code: string }[]): PieceItem[] {
  const result: PieceItem[] = [];
  const unmatchedPrev = [...prev];
  const unmatchedNext: { sq: Square; code: string }[] = [];
  for (const n of next) {
    const i = unmatchedPrev.findIndex((p) => p.sq === n.sq && p.code === n.code);
    if (i >= 0) {
      result.push(unmatchedPrev[i]);
      unmatchedPrev.splice(i, 1);
    } else unmatchedNext.push(n);
  }
  for (const n of unmatchedNext) {
    let best = -1;
    let bestD = 99;
    unmatchedPrev.forEach((p, i) => {
      if (p.code !== n.code) return;
      const d = Math.abs(FILES.indexOf(p.sq[0]) - FILES.indexOf(n.sq[0])) + Math.abs(+p.sq[1] - +n.sq[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      result.push({ ...unmatchedPrev[best], sq: n.sq });
      unmatchedPrev.splice(best, 1);
    } else result.push({ key: `p${keySeq++}`, sq: n.sq, code: n.code });
  }
  // Pieces that disappeared (captures) fade out instead of vanishing.
  for (const p of unmatchedPrev) result.push({ ...p, dying: true });
  return result;
}

export default function Board({
  fen,
  orientation = 'w',
  movable = null,
  onMove,
  onSquareClick,
  lastMove,
  arrows = [],
  highlights = {},
  theme = 'brown',
  showCoords = true,
  freeMove = false,
  badge = null,
  shake = 0,
  glow = null,
  glowKey = 0,
  overlay,
}: BoardProps) {
  const animations = useCore().settings.animations;
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [pieces, setPieces] = useState<PieceItem[]>(() => diffPieces([], piecesFromFen(fen)));
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number; code: string } | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square; color: 'w' | 'b' } | null>(null);
  const downRef = useRef<{ sq: Square; wasSelected: boolean; moved: boolean } | null>(null);

  useEffect(() => {
    setPieces((prev) => diffPieces(prev.filter((p) => !p.dying), piecesFromFen(fen)));
    setSelected(null);
    setPromo(null);
    const t = setTimeout(() => setPieces((ps) => (ps.some((p) => p.dying) ? ps.filter((p) => !p.dying) : ps)), 320);
    return () => clearTimeout(t);
  }, [fen]);

  // Shake / glow effects are toggled with classes so the board isn't remounted.
  useEffect(() => {
    if (!shake || !wrapRef.current) return;
    const el = wrapRef.current;
    el.classList.remove('shake');
    void el.offsetWidth; // restart the animation
    el.classList.add('shake');
    const t = setTimeout(() => el.classList.remove('shake'), 500);
    return () => clearTimeout(t);
  }, [shake]);
  useEffect(() => {
    if (!glow || !wrapRef.current) return;
    const el = wrapRef.current;
    const cls = glow === 'good' ? 'glow-good' : 'glow-bad';
    el.classList.remove('glow-good', 'glow-bad');
    void el.offsetWidth;
    el.classList.add(cls);
    const t = setTimeout(() => el.classList.remove(cls), 900);
    return () => clearTimeout(t);
  }, [glow, glowKey]);

  const chess = useMemo(() => {
    try {
      return new Chess(fen, { skipValidation: true });
    } catch {
      return null;
    }
  }, [fen]);

  const turn = fen.split(' ')[1] as 'w' | 'b';
  const canMoveColor = (c: string) => movable === 'both' || movable === c;

  const targets = useMemo(() => {
    if (!selected || !chess || freeMove) return new Map<string, boolean>();
    const m = new Map<string, boolean>();
    try {
      for (const mv of chess.moves({ square: selected, verbose: true })) m.set(mv.to, !!mv.captured);
    } catch {
      /* ignore */
    }
    return m;
  }, [selected, chess, freeMove]);

  const checkSq = useMemo(() => {
    if (!chess) return null;
    try {
      if (!chess.inCheck()) return null;
    } catch {
      return null;
    }
    const k = piecesFromFen(fen).find((p) => p.code === `${turn}K`);
    return k?.sq ?? null;
  }, [chess, fen, turn]);

  function pointToSq(clientX: number, clientY: number): Square | null {
    const el = boardRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * 8);
    const y = Math.floor(((clientY - r.top) / r.height) * 8);
    return xyToSq(x, y, orientation);
  }

  function pieceAt(sq: Square) {
    return pieces.find((p) => p.sq === sq && !p.dying);
  }

  function tryMove(from: Square, to: Square) {
    if (from === to) return false;
    if (freeMove) {
      onMove?.({ from, to });
      return true;
    }
    if (!chess) return false;
    let legal;
    try {
      legal = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    } catch {
      return false;
    }
    if (legal.length === 0) return false;
    if (legal.some((m) => m.promotion)) {
      setPromo({ from, to, color: legal[0].color });
      return true;
    }
    onMove?.({ from, to });
    return true;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const sq = pointToSq(e.clientX, e.clientY);
    if (!sq) return;
    if (onSquareClick) {
      onSquareClick(sq);
      return;
    }
    if (!movable || promo) return;
    const p = pieceAt(sq);
    if (selected && sq !== selected && targets.has(sq)) {
      tryMove(selected, sq);
      setSelected(null);
      return;
    }
    if (p && canMoveColor(p.code[0]) && (freeMove || p.code[0] === turn || movable === 'both')) {
      downRef.current = { sq, wasSelected: selected === sq, moved: false };
      setSelected(sq);
      const r = boardRef.current!.getBoundingClientRect();
      setDrag({ from: sq, x: e.clientX - r.left, y: e.clientY - r.top, code: p.code });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (selected && freeMove) {
      tryMove(selected, sq);
      setSelected(null);
    } else setSelected(null);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const r = boardRef.current!.getBoundingClientRect();
    if (downRef.current) downRef.current.moved = true;
    setDrag({ ...drag, x: e.clientX - r.left, y: e.clientY - r.top });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const sq = pointToSq(e.clientX, e.clientY);
    const from = drag.from;
    setDrag(null);
    if (sq && sq !== from) {
      const ok = tryMove(from, sq);
      setSelected(null);
      if (!ok) setSelected(null);
    } else if (downRef.current?.wasSelected && !downRef.current.moved) {
      setSelected(null);
    }
    downRef.current = null;
  }

  const style = { '--light': `var(--sq-light-${theme})`, '--dark': `var(--sq-dark-${theme})` } as CSSProperties;

  const squares = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const sq = xyToSq(x, y, orientation)!;
      const isLight = (FILES.indexOf(sq[0]) + parseInt(sq[1], 10)) % 2 === 1;
      const classes = ['sq', isLight ? 'light' : 'dark'];
      if (lastMove && (lastMove[0] === sq || lastMove[1] === sq)) classes.push('last');
      if (selected === sq) classes.push('selected');
      if (checkSq === sq) classes.push('check');
      squares.push(
        <div key={sq} className={classes.join(' ')} style={{ left: `${x * 12.5}%`, top: `${y * 12.5}%`, background: highlights[sq] }}>
          {showCoords && x === 0 && <span className={`coord rank ${isLight ? 'on-light' : 'on-dark'}`}>{sq[1]}</span>}
          {showCoords && y === 7 && <span className={`coord file ${isLight ? 'on-light' : 'on-dark'}`}>{sq[0]}</span>}
          {targets.has(sq) && <span className={targets.get(sq) ? 'hint capture' : 'hint'} />}
        </div>,
      );
    }

  return (
    <div ref={wrapRef} className={`board-wrap${animations ? '' : ' no-anim'}`} style={style}>
      <div
        ref={boardRef}
        className="board"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {squares}
        {pieces.map((p) => {
          const [x, y] = sqToXY(p.sq, orientation);
          const dragging = drag && drag.from === p.sq;
          return (
            <img
              key={p.key}
              src={PIECE_IMG[p.code]}
              alt={p.code}
              draggable={false}
              className={`piece${dragging && !p.dying ? ' ghost' : ''}${p.dying ? ' dying' : ''}`}
              style={{ transform: `translate(${x * 100}%, ${y * 100}%)` }}
            />
          );
        })}
        {drag && (
          <img
            src={PIECE_IMG[drag.code]}
            alt=""
            draggable={false}
            className="piece dragging"
            style={{ left: `calc(${drag.x}px - 6.25%)`, top: `calc(${drag.y}px - 6.25%)` }}
          />
        )}
        {badge &&
          (() => {
            const [bx, by] = sqToXY(badge.square, orientation);
            return (
              <span
                key={`${badge.square}-${badge.kind}`}
                className={`move-badge ${badge.kind}`}
                style={{ left: `${(bx + 1) * 12.5}%`, top: `${by * 12.5}%` }}
                aria-label={badge.kind}
              >
                {BADGE_SYMBOL[badge.kind]}
              </span>
            );
          })()}
        {overlay && <div className="board-overlay">{overlay}</div>}
        <svg className="arrows" viewBox="0 0 8 8">
          <defs>
            {['g', 'r', 'b', 'y'].map((c) => (
              <marker key={c} id={`ah-${c}`} markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto">
                <path d="M0,0 L4,2 L0,4 z" className={`arrowhead-${c}`} />
              </marker>
            ))}
          </defs>
          {arrows.map((a, i) => {
            const [x1, y1] = sqToXY(a.from, orientation);
            const [x2, y2] = sqToXY(a.to, orientation);
            const c = a.color ?? 'g';
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const shorten = 0.35;
            return (
              <line
                key={i}
                x1={x1 + 0.5}
                y1={y1 + 0.5}
                x2={x2 + 0.5 - (dx / len) * shorten}
                y2={y2 + 0.5 - (dy / len) * shorten}
                className={`arrow-${c}`}
                strokeWidth={0.16}
                markerEnd={`url(#ah-${c})`}
              />
            );
          })}
        </svg>
        {promo && (
          <div className="promo" onPointerDown={(e) => e.stopPropagation()}>
            {(['q', 'r', 'b', 'n'] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  onMove?.({ from: promo.from, to: promo.to, promotion: p });
                  setPromo(null);
                }}
              >
                <img src={PIECE_IMG[promo.color + p.toUpperCase()]} alt={p} />
              </button>
            ))}
            <button className="promo-cancel" onClick={() => setPromo(null)}>
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
