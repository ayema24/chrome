// Board recognition from screenshots / photos, entirely in the browser.
//
// 1. detectBoard(): finds the most "checkerboard-like" square region.
// 2. Each of the 64 cells is reduced to a 32×32 foreground mask (pixels that
//    differ from the square's own background colour).
// 3. Empty / white / black is decided from the mask size and the brightness of
//    the foreground; the piece type from the best silhouette match against
//    templates. Templates are rendered at runtime from the app's piece set, or
//    learned from a screenshot of the starting position ("calibration"), which
//    makes recognition of any site's piece style much more reliable.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Template {
  code: string; // e.g. 'wN'
  mask: Uint8Array; // N*N
  brightRatio: number;
}

export interface CellResult {
  code: string | null;
  confidence: number;
}

const N = 32;

export function imageToCanvas(img: CanvasImageSource & { width: number; height: number }, maxSide = 900): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = url;
  });
}

function lum(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ------------------------------------------------------------------ board detection

/** Finds the board as the square region whose 64 cells best alternate in colour. */
export function detectBoard(src: HTMLCanvasElement): Rect {
  const maxSide = 260;
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const W = Math.max(8, Math.round(src.width * scale));
  const H = Math.max(8, Math.round(src.height * scale));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  const at = (x: number, y: number) => L[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))];

  const score = (x0: number, y0: number, s: number) => {
    const cs = s / 8;
    let sl = 0,
      sd = 0,
      ql = 0,
      qd = 0,
      nl = 0,
      nd = 0;
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const light = (r + f) % 2 === 0;
        // sample near the four corners of the cell – usually background even with a piece on it
        for (const [u, v] of [
          [0.15, 0.15],
          [0.85, 0.15],
          [0.15, 0.85],
          [0.85, 0.85],
        ]) {
          const val = at(x0 + (f + u) * cs, y0 + (r + v) * cs);
          if (light) {
            sl += val;
            ql += val * val;
            nl++;
          } else {
            sd += val;
            qd += val * val;
            nd++;
          }
        }
      }
    const ml = sl / nl;
    const md = sd / nd;
    const vl = Math.sqrt(Math.max(0, ql / nl - ml * ml));
    const vd = Math.sqrt(Math.max(0, qd / nd - md * md));
    // A board must actually alternate between two clearly different colours.
    if (Math.abs(ml - md) < 18) return -Infinity;
    return Math.abs(ml - md) - 1.2 * (vl + vd) + s * 0.02;
  };

  let best = { x: 0, y: 0, s: Math.min(W, H), v: -Infinity };
  const minS = Math.min(W, H) * 0.3;
  for (let s = Math.min(W, H); s >= minS; s *= 0.975) {
    const step = Math.max(1, s / 48);
    for (let y = 0; y + s <= H; y += step)
      for (let x = 0; x + s <= W; x += step) {
        const v = score(x, y, s);
        if (v > best.v) best = { x, y, s, v };
      }
  }
  // refine
  for (let it = 0; it < 2; it++) {
    const step = Math.max(0.5, best.s / 120);
    const cur = { ...best };
    for (let ds = -4; ds <= 4; ds++)
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const s = cur.s + ds * step;
          const x = cur.x + dx * step;
          const y = cur.y + dy * step;
          if (x < 0 || y < 0 || x + s > W + 0.5 || y + s > H + 0.5) continue;
          const v = score(x, y, s);
          if (v > best.v) best = { x, y, s, v };
        }
  }
  return refineBoard(src, { x: best.x / scale, y: best.y / scale, w: best.s / scale, h: best.s / scale });
}

/**
 * Snaps the detected square onto the real grid at full resolution by checking
 * that pixels just inside every cell edge share that cell's colour.
 */
export function refineBoard(src: HTMLCanvasElement, r: Rect): Rect {
  const W = src.width;
  const H = src.height;
  const d = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
  const at = (x: number, y: number) => {
    const xi = Math.min(W - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(H - 1, Math.max(0, Math.round(y)));
    const k = (yi * W + xi) * 4;
    return lum(d[k], d[k + 1], d[k + 2]);
  };
  const samples = [0.04, 0.5, 0.96];
  const score = (x0: number, y0: number, s: number) => {
    const cs = s / 8;
    let sl = 0, sd = 0, ql = 0, qd = 0, nl = 0, nd = 0;
    for (let rr = 0; rr < 8; rr++)
      for (let f = 0; f < 8; f++) {
        const light = (rr + f) % 2 === 0;
        for (const u of samples)
          for (const v of samples) {
            if (u === 0.5 && v === 0.5) continue; // centre is usually covered by a piece
            if (u !== 0.5 && v !== 0.5) continue; // use edge midpoints only
            const val = at(x0 + (f + u) * cs, y0 + (rr + v) * cs);
            if (light) { sl += val; ql += val * val; nl++; } else { sd += val; qd += val * val; nd++; }
          }
      }
    const ml = sl / nl, md = sd / nd;
    const vl = Math.sqrt(Math.max(0, ql / nl - ml * ml));
    const vd = Math.sqrt(Math.max(0, qd / nd - md * md));
    return Math.abs(ml - md) - (vl + vd);
  };
  let best = { x: r.x, y: r.y, s: (r.w + r.h) / 2, v: score(r.x, r.y, (r.w + r.h) / 2) };
  const range = Math.max(2, Math.round(best.s / 8 * 0.2));
  for (let pass = 0; pass < 3; pass++) {
    const cur = { ...best };
    const step = pass === 0 ? Math.max(1, Math.round(range / 4)) : 1;
    const span = pass === 0 ? range : 2;
    for (let ds = -span; ds <= span; ds += step)
      for (let dy = -span; dy <= span; dy += step)
        for (let dx = -span; dx <= span; dx += step) {
          const s = cur.s + ds;
          const v = score(cur.x + dx, cur.y + dy, s);
          if (v > best.v) best = { x: cur.x + dx, y: cur.y + dy, s, v };
        }
  }
  return { x: best.x, y: best.y, w: best.s, h: best.s };
}

// ------------------------------------------------------------------ features

interface CellFeature {
  mask: Uint8Array;
  fill: number; // fraction of foreground
  brightRatio: number;
  bgLum: number;
}

function cellFeature(data: ImageData, x0: number, y0: number, cw: number, ch: number): CellFeature {
  // Resample the cell (with a small inset) to N×N
  const inset = 0.08;
  const px = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const sx = Math.min(data.width - 1, Math.max(0, Math.floor(x0 + cw * (inset + ((1 - 2 * inset) * (i + 0.5)) / N))));
      const sy = Math.min(data.height - 1, Math.max(0, Math.floor(y0 + ch * (inset + ((1 - 2 * inset) * (j + 0.5)) / N))));
      const k = (sy * data.width + sx) * 4;
      px[(j * N + i) * 3] = data.data[k];
      px[(j * N + i) * 3 + 1] = data.data[k + 1];
      px[(j * N + i) * 3 + 2] = data.data[k + 2];
    }
  // Background = per-channel median of the border ring
  const ring: number[][] = [[], [], []];
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (i > 1 && i < N - 2 && j > 1 && j < N - 2) continue;
      for (let c = 0; c < 3; c++) ring[c].push(px[(j * N + i) * 3 + c]);
    }
  const bg = ring.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
  const mask = new Uint8Array(N * N);
  let fg = 0,
    bright = 0,
    dark = 0;
  for (let p = 0; p < N * N; p++) {
    const r = px[p * 3],
      g = px[p * 3 + 1],
      b = px[p * 3 + 2];
    const dist = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    if (dist > 38) {
      mask[p] = 1;
      fg++;
      const l = lum(r, g, b);
      if (l > 185) bright++;
      else if (l < 70) dark++;
    }
  }
  // Fraction of the piece that is clearly bright: high for white pieces, low for black.
  return { mask, fill: fg / (N * N), brightRatio: fg ? bright / fg : 0.5, bgLum: lum(bg[0], bg[1], bg[2]) };
}

function dice(a: Uint8Array, b: Uint8Array): number {
  let inter = 0,
    sa = 0,
    sb = 0;
  for (let i = 0; i < a.length; i++) {
    inter += a[i] & b[i];
    sa += a[i];
    sb += b[i];
  }
  return sa + sb ? (2 * inter) / (sa + sb) : 0;
}

/** Shift-tolerant similarity: best Dice over small translations. */
function shapeScore(a: Uint8Array, b: Uint8Array): number {
  let best = 0;
  const shifted = new Uint8Array(N * N);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      shifted.fill(0);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const sx = x + dx,
            sy = y + dy;
          if (sx >= 0 && sy >= 0 && sx < N && sy < N) shifted[y * N + x] = a[sy * N + sx];
        }
      best = Math.max(best, dice(shifted, b));
    }
  return best;
}

// ------------------------------------------------------------------ templates

/** Renders the app's own piece images to build default templates. */
export async function buildDefaultTemplates(pieceImg: Record<string, string>): Promise<Template[]> {
  const out: Template[] = [];
  const size = 96;
  const bgs = ['#f0d9b5', '#b58863', '#eeeed2', '#769656'];
  for (const [code, src] of Object.entries(pieceImg)) {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
    for (const bg of bgs) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const f = cellFeature(ctx.getImageData(0, 0, size, size), 0, 0, size, size);
      out.push({ code, mask: f.mask, brightRatio: f.brightRatio });
    }
  }
  return out;
}

const START_LAYOUT = ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR', ...Array(8).fill('bP'), ...Array(32).fill(null), ...Array(8).fill('wP'), 'wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'];

export interface Calibration {
  templates: Template[];
  emptyFillMax: number;
  colorSplit: number;
}

/** Learns templates and thresholds from a screenshot of the starting position (White at the bottom). */
export function calibrateFromStart(data: ImageData, rect: Rect): Calibration {
  const cw = rect.w / 8,
    ch = rect.h / 8;
  const templates: Template[] = [];
  const emptyFills: number[] = [];
  const occFills: number[] = [];
  const whiteBr: number[] = [];
  const blackBr: number[] = [];
  for (let i = 0; i < 64; i++) {
    const f = cellFeature(data, rect.x + (i % 8) * cw, rect.y + Math.floor(i / 8) * ch, cw, ch);
    const code = START_LAYOUT[i];
    if (!code) emptyFills.push(f.fill);
    else {
      occFills.push(f.fill);
      templates.push({ code, mask: f.mask, brightRatio: f.brightRatio });
      (code[0] === 'w' ? whiteBr : blackBr).push(f.brightRatio);
    }
  }
  const emptyFillMax = (Math.max(...emptyFills) + Math.min(...occFills)) / 2;
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return { templates, emptyFillMax, colorSplit: (avg(whiteBr) + avg(blackBr)) / 2 };
}

export function recognize(data: ImageData, rect: Rect, templates: Template[], calib?: Calibration | null): CellResult[] {
  const cw = rect.w / 8,
    ch = rect.h / 8;
  const tpl = calib?.templates.length ? calib.templates : templates;
  const emptyMax = calib?.emptyFillMax ?? 0.06;
  const split = calib?.colorSplit ?? 0.3;
  const out: CellResult[] = [];
  for (let i = 0; i < 64; i++) {
    const f = cellFeature(data, rect.x + (i % 8) * cw, rect.y + Math.floor(i / 8) * ch, cw, ch);
    if (f.fill < emptyMax) {
      out.push({ code: null, confidence: 1 - f.fill / emptyMax / 2 });
      continue;
    }
    const color = f.brightRatio > split ? 'w' : 'b';
    let best = { code: '', s: -1 };
    let second = -1;
    for (const t of tpl) {
      if (t.code[0] !== color) continue;
      const s = shapeScore(f.mask, t.mask);
      if (s > best.s) {
        if (t.code !== best.code) second = best.s;
        best = { code: t.code, s };
      } else if (s > second && t.code !== best.code) second = s;
    }
    out.push({ code: best.code || null, confidence: Math.max(0, Math.min(1, best.s - Math.max(0, second) + 0.5)) });
  }
  return out;
}

/** Converts 64 cell codes (a8..h1 order) to a FEN. */
export function cellsToFen(cells: (string | null)[], flipped: boolean, turn: 'w' | 'b'): string {
  const board = flipped ? [...cells].reverse() : cells;
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const c = board[r * 8 + f];
      if (!c) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += c[0] === 'w' ? c[1].toUpperCase() : c[1].toLowerCase();
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  // Castling rights inferred from kings/rooks on their home squares
  const at = (sq: string) => board[(8 - parseInt(sq[1], 10)) * 8 + (sq.charCodeAt(0) - 97)];
  let castle = '';
  if (at('e1') === 'wK') {
    if (at('h1') === 'wR') castle += 'K';
    if (at('a1') === 'wR') castle += 'Q';
  }
  if (at('e8') === 'bK') {
    if (at('h8') === 'bR') castle += 'k';
    if (at('a8') === 'bR') castle += 'q';
  }
  return `${rows.join('/')} ${turn} ${castle || '-'} - 0 1`;
}

/** Heuristic: if most white pieces are at the top, the image is from Black's side. */
export function guessFlipped(cells: (string | null)[]): boolean {
  let whiteTop = 0,
    whiteBottom = 0;
  cells.forEach((c, i) => {
    if (c?.[0] !== 'w') return;
    if (i < 32) whiteTop++;
    else whiteBottom++;
  });
  return whiteTop > whiteBottom;
}

export function serializeCalibration(c: Calibration): string {
  return JSON.stringify({
    emptyFillMax: c.emptyFillMax,
    colorSplit: c.colorSplit,
    templates: c.templates.map((t) => ({ code: t.code, b: t.brightRatio, m: btoa(String.fromCharCode(...packBits(t.mask))) })),
  });
}

export function deserializeCalibration(s: string): Calibration | null {
  try {
    const o = JSON.parse(s);
    return {
      emptyFillMax: o.emptyFillMax,
      colorSplit: o.colorSplit,
      templates: o.templates.map((t: { code: string; b: number; m: string }) => ({
        code: t.code,
        brightRatio: t.b,
        mask: unpackBits(Uint8Array.from(atob(t.m), (ch) => ch.charCodeAt(0))),
      })),
    };
  } catch {
    return null;
  }
}

function packBits(m: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(m.length / 8));
  for (let i = 0; i < m.length; i++) if (m[i]) out[i >> 3] |= 1 << (i & 7);
  return out;
}
function unpackBits(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(N * N);
  for (let i = 0; i < out.length; i++) out[i] = (b[i >> 3] >> (i & 7)) & 1;
  return out;
}
