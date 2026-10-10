import { useMemo, useRef, useState } from 'react';
import type { Point } from '../lib/insights';

export interface Series {
  name: string;
  points: Point[];
  /** CSS variable / color for the line. */
  color: string;
  dashed?: boolean;
}

interface Props {
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  yMin?: number;
  yMax?: number;
  emptyText?: string;
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Minimal time-series line chart with a crosshair tooltip. */
export default function LineChart({ series, height = 180, format = (v) => v.toFixed(0), yMin, yMax, emptyText = 'No data yet' }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = { l: 40, r: 12, t: 12, b: 22 };
  const all = series.flatMap((s) => s.points);

  const { x, y, ticks, tMin, tMax } = useMemo(() => {
    const ts = all.map((p) => p.t);
    const vs = all.map((p) => p.v);
    let tMin = Math.min(...ts);
    let tMax = Math.max(...ts);
    if (tMin === tMax) {
      tMin -= 86400000;
      tMax += 86400000;
    }
    let lo = yMin ?? Math.min(...vs);
    let hi = yMax ?? Math.max(...vs);
    if (lo === hi) {
      lo -= 10;
      hi += 10;
    }
    const span = hi - lo;
    if (yMin === undefined) lo -= span * 0.08;
    if (yMax === undefined) hi += span * 0.08;
    const x = (t: number) => pad.l + ((t - tMin) / (tMax - tMin)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const step = niceStep((hi - lo) / 4);
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    return { x, y, ticks, tMin, tMax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(all), H, yMin, yMax]);

  if (all.length < 2) return <div className="chart-empty">{emptyText}</div>;

  // Hover: nearest time across the first series
  const base = series[0].points;
  const hoverPoint = hover !== null ? base[hover] : null;

  function onMove(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    base.forEach((p, i) => {
      const d = Math.abs(x(p.t) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  }

  return (
    <div className="chart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 4} className="axis">
          {fmtDate(tMin)}
        </text>
        <text x={W - pad.r} y={H - 4} className="axis" textAnchor="end">
          {fmtDate(tMax)}
        </text>
        {series.map((s) => (
          <path
            key={s.name}
            d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hoverPoint && (
          <g>
            <line x1={x(hoverPoint.t)} x2={x(hoverPoint.t)} y1={pad.t} y2={H - pad.b} className="crosshair" />
            {series.map((s) => {
              const p = nearest(s.points, hoverPoint.t);
              return p ? <circle key={s.name} cx={x(p.t)} cy={y(p.v)} r={4.5} fill={s.color} className="dot" /> : null;
            })}
          </g>
        )}
      </svg>
      {hoverPoint && (
        <div className="tooltip" style={{ left: `${(x(hoverPoint.t) / W) * 100}%` }}>
          <div className="muted">{fmtDate(hoverPoint.t)}</div>
          {series.map((s) => {
            const p = nearest(s.points, hoverPoint.t);
            return p ? (
              <div key={s.name}>
                <strong>{format(p.v)}</strong> <span className="muted">{s.name}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} className={s.dashed ? 'dashed' : ''} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function nearest(points: Point[], t: number): Point | null {
  let best: Point | null = null;
  let bd = Infinity;
  for (const p of points) {
    const d = Math.abs(p.t - t);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}
