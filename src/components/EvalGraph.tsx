import { useRef, useState } from 'react';
import { whiteWin, formatEval, type Eval, type MoveAnalysis } from '../lib/analysis';

interface Props {
  evals: Eval[];
  moves?: MoveAnalysis[];
  current: number; // position index
  onSelect: (index: number) => void;
}

/** Win-probability graph of a game; click to jump to a position. */
export default function EvalGraph({ evals, moves, current, onSelect }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 110;
  const n = evals.length;
  if (n < 2) return null;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (e: Eval) => H - (whiteWin(e) / 100) * H;
  const path = evals.map((e, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(e).toFixed(1)}`).join('');
  const area = `${path}L${W},${H}L0,${H}Z`;
  const idxAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1))));
  };
  const shown = hover ?? current;
  return (
    <div className="chart evalgraph">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerMove={(e) => setHover(idxAt(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onSelect(idxAt(e.clientX))}
        role="img"
        aria-label="Evaluation graph"
      >
        <rect width={W} height={H} className="eg-black" />
        <path d={area} className="eg-white" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="eg-mid" />
        {moves?.map((m, i) =>
          m.cls === 'blunder' || m.cls === 'mistake' ? (
            <circle key={i} cx={x(i + 1)} cy={y(evals[i + 1])} r={3.5} className={`eg-dot ${m.cls}`} vectorEffect="non-scaling-stroke" />
          ) : null,
        )}
        <line x1={x(shown)} x2={x(shown)} y1={0} y2={H} className="eg-cursor" vectorEffect="non-scaling-stroke" />
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{formatEval(evals[hover])}</strong>{' '}
          <span className="muted">{hover === 0 ? 'Start' : `${Math.ceil(hover / 2)}${hover % 2 ? '.' : '...'} ${moves?.[hover - 1]?.san ?? ''}`}</span>
        </div>
      )}
    </div>
  );
}
