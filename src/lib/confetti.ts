// Lightweight confetti burst drawn on a temporary full-screen canvas.
import { getCore } from './store';

const COLORS = ['#3987e5', '#f0d9b5', '#3fae5a', '#e8b23a', '#e05a4f', '#b58863', '#ffffff'];

export function fireConfetti(amount = 140) {
  if (!getCore().settings.animations) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const parts = Array.from({ length: amount }, () => {
    const fromLeft = Math.random() < 0.5;
    return {
      x: fromLeft ? -10 : W + 10,
      y: H * (0.45 + Math.random() * 0.3),
      vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 9),
      vy: -(9 + Math.random() * 10),
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });
  const start = performance.now();
  const tick = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.38;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (t < 2600) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
