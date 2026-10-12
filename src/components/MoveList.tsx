import { useEffect, useRef } from 'react';
import { CLASS_SYMBOL, type MoveClass } from '../lib/analysis';

export interface MoveListItem {
  san: string;
  cls?: MoveClass;
}

interface Props {
  moves: MoveListItem[];
  /** Index of the current position (0 = start, i = after move i). */
  current: number;
  onSelect: (index: number) => void;
  startMoveNumber?: number;
  startsWithBlack?: boolean;
}

export default function MoveList({ moves, current, onSelect, startMoveNumber = 1, startsWithBlack = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the current move visible by scrolling the list itself only. (scrollIntoView
  // would also scroll the page, which on a phone yanks the board off-screen.)
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>('.mv.active');
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop += r.top - b.top - 4;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
    if (r.left < b.left) box.scrollLeft += r.left - b.left - 8;
    else if (r.right > b.right) box.scrollLeft += r.right - b.right + 8;
  }, [current, moves.length]);
  const rows: { no: number; w?: number; b?: number }[] = [];
  let no = startMoveNumber;
  let i = 0;
  if (startsWithBlack && moves.length) {
    rows.push({ no, b: 0 });
    no++;
    i = 1;
  }
  for (; i < moves.length; i += 2) {
    rows.push({ no, w: i, b: i + 1 < moves.length ? i + 1 : undefined });
    no++;
  }
  const cell = (idx?: number) => {
    if (idx === undefined) return <span className="mv empty" />;
    const m = moves[idx];
    return (
      <button className={`mv ${current === idx + 1 ? 'active' : ''} ${m.cls ?? ''}`} onClick={() => onSelect(idx + 1)}>
        {m.san}
        {m.cls && ['inaccuracy', 'mistake', 'blunder', 'book'].includes(m.cls) && <sup className={`sym ${m.cls}`}>{CLASS_SYMBOL[m.cls]}</sup>}
      </button>
    );
  };
  return (
    <div className="movelist" ref={ref}>
      {rows.length === 0 && <div className="muted small">No moves yet</div>}
      {rows.map((r) => (
        <div className="mvrow" key={r.no}>
          <span className="mvno">{r.no}.</span>
          {r.w === undefined && startsWithBlack ? <span className="mv empty">…</span> : cell(r.w)}
          {cell(r.b)}
        </div>
      ))}
    </div>
  );
}

export function NavButtons({ index, max, onChange }: { index: number; max: number; onChange: (i: number) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') onChange(Math.max(0, index - 1));
      else if (e.key === 'ArrowRight') onChange(Math.min(max, index + 1));
      else if (e.key === 'Home') onChange(0);
      else if (e.key === 'End') onChange(max);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, max, onChange]);
  return (
    <div className="nav-buttons">
      <button onClick={() => onChange(0)} disabled={index === 0} aria-label="Start">⏮</button>
      <button onClick={() => onChange(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous">◀</button>
      <button onClick={() => onChange(Math.min(max, index + 1))} disabled={index >= max} aria-label="Next">▶</button>
      <button onClick={() => onChange(max)} disabled={index >= max} aria-label="End">⏭</button>
    </div>
  );
}
