import { whiteWin, formatEval, type Eval } from '../lib/analysis';

export default function EvalBar({ ev, orientation = 'w' }: { ev: Eval | null; orientation?: 'w' | 'b' }) {
  const w = ev ? whiteWin(ev) : 50;
  return (
    <div className={`evalbar ${orientation === 'b' ? 'flipped' : ''}`} title={ev ? formatEval(ev) : ''}>
      <div className="evalbar-white" style={{ height: `${w}%` }} />
      <span className={`evalbar-label ${w >= 50 ? 'bottom' : 'top'}`}>{ev ? formatEval(ev).replace('+', '') : ''}</span>
    </div>
  );
}
