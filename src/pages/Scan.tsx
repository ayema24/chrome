import { useEffect, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import Board from '../components/Board';
import { PIECE_IMG } from '../components/pieces';
import {
  buildDefaultTemplates,
  calibrateFromStart,
  cellsToFen,
  detectBoard,
  deserializeCalibration,
  guessFlipped,
  imageToCanvas,
  loadImageFile,
  recognize,
  serializeCalibration,
  type Calibration,
  type Rect,
  type Template,
} from '../lib/vision';
import { useCore } from '../lib/store';
import { navigate, setPending } from '../lib/router';

const CAL_KEY = 'cc-vision-calibration';
const EMPTY_CELLS: (string | null)[] = Array(64).fill(null);

export default function Scan() {
  const core = useCore();
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cells, setCells] = useState<(string | null)[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  const [tool, setTool] = useState<string>('wP');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [calib, setCalib] = useState<Calibration | null>(() => {
    try {
      const s = localStorage.getItem(CAL_KEY);
      return s ? deserializeCalibration(s) : null;
    } catch {
      return null;
    }
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buildDefaultTemplates(PIECE_IMG).then(setTemplates).catch(console.error);
  }, []);

  // Paste an image from the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) void handleFile(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  async function handleFile(f: File) {
    setError('');
    setMsg('');
    try {
      const img = await loadImageFile(f);
      const c = imageToCanvas(img);
      setSrc(c);
      const r = detectBoard(c);
      setRect(r);
      setCells(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function run() {
    if (!src || !rect || !templates) return;
    const data = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height);
    const res = recognize(data, rect, templates, calib);
    const codes = res.map((r) => r.code);
    const flip = guessFlipped(codes);
    setFlipped(flip);
    setCells(flip ? [...codes].reverse() : codes);
    const low = res.filter((r) => r.code && r.confidence < 0.55).length;
    setMsg(low ? `Recognised – ${low} square${low > 1 ? 's are' : ' is'} uncertain. Check the position and fix any mistakes below.` : 'Recognised! Check the position below.');
  }

  function calibrate() {
    if (!src || !rect) return;
    const data = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height);
    const c = calibrateFromStart(data, rect);
    setCalib(c);
    try {
      localStorage.setItem(CAL_KEY, serializeCalibration(c));
    } catch {
      /* ignore */
    }
    setMsg('Calibrated! Screenshots from this site/theme will now be recognised much more reliably.');
  }

  const boardCells = cells ?? EMPTY_CELLS;
  // cells are stored in a8..h1 order from White's point of view
  const fen = cellsToFen(boardCells, false, turn);
  let fenError = '';
  try {
    new Chess(fen);
  } catch (e) {
    fenError = (e as Error).message.replace(/^Invalid FEN: /, '');
  }

  function onSquare(sq: Square) {
    const i = (8 - parseInt(sq[1], 10)) * 8 + (sq.charCodeAt(0) - 97);
    const next = [...boardCells];
    next[i] = tool === 'erase' ? null : next[i] === tool ? null : tool;
    setCells(next);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Scan a board</h1>
          <div className="muted">
            Upload or paste a screenshot (or photo) of a chess position. The coach finds the board, reads the pieces, and lets you analyse it or play it
            out.
          </div>
        </div>
      </div>

      <div className="card row">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          🖼 Upload image
        </button>
        <button className="btn" onClick={() => camRef.current?.click()}>
          📷 Take photo
        </button>
        <span className="muted small">…or paste a screenshot with Ctrl/⌘+V</span>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <span className="spacer" />
        {calib ? (
          <span className="pill accent" title="Recognition is tuned to the piece style you calibrated with">
            Calibrated ✓{' '}
            <button
              className="btn small"
              style={{ padding: '0 6px' }}
              onClick={() => {
                setCalib(null);
                try {
                  localStorage.removeItem(CAL_KEY);
                } catch {
                  /* ignore */
                }
              }}
            >
              reset
            </button>
          </span>
        ) : (
          <span className="pill">Default piece templates</span>
        )}
      </div>
      {error && <div className="error">{error}</div>}

      {src && rect && (
        <div className="grid-2">
          <div className="card">
            <h3>1. Check the board outline</h3>
            <CropCanvas src={src} rect={rect} onChange={setRect} />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={run} disabled={!templates}>
                {templates ? 'Recognise position' : 'Preparing…'}
              </button>
              <button className="btn" onClick={() => setRect(detectBoard(src))}>
                Auto-detect again
              </button>
              <button className="btn" onClick={calibrate} title="Use when the screenshot shows the starting position, White at the bottom">
                This is the start position → calibrate
              </button>
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              Drag the box to move it, drag a corner to resize. Works best with clean screenshots from Lichess, Chess.com or similar. For other piece
              styles, calibrate once with a screenshot of the starting position from that site. Photos of real boards are harder – fix squares
              manually.
            </p>
          </div>

          <div className="card">
            <h3>2. Fix & use the position</h3>
            {msg && <div className="notice" style={{ marginBottom: 8 }}>{msg}</div>}
            <Board fen={fen} orientation={flipped ? 'b' : 'w'} onSquareClick={onSquare} theme={core.settings.boardTheme} showCoords />
            <div className="palette" style={{ marginTop: 8 }}>
              {['wK', 'wQ', 'wR', 'wB', 'wN', 'wP'].map((c) => (
                <button key={c} className={tool === c ? 'active' : ''} onClick={() => setTool(c)}>
                  <img src={PIECE_IMG[c]} alt={c} />
                </button>
              ))}
              <button className={tool === 'erase' ? 'active' : ''} onClick={() => setTool('erase')} title="Eraser">
                ✕
              </button>
              {['bK', 'bQ', 'bR', 'bB', 'bN', 'bP'].map((c) => (
                <button key={c} className={tool === c ? 'active' : ''} onClick={() => setTool(c)}>
                  <img src={PIECE_IMG[c]} alt={c} />
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="seg">
                <button className={turn === 'w' ? 'active' : ''} onClick={() => setTurn('w')}>
                  White to move
                </button>
                <button className={turn === 'b' ? 'active' : ''} onClick={() => setTurn('b')}>
                  Black to move
                </button>
              </div>
              <button className="btn small" onClick={() => setFlipped(!flipped)}>
                ⇅ Flip view
              </button>
              <button className="btn small" onClick={() => setCells([...boardCells].reverse())} title="Use if the board was read upside down">
                Rotate pieces 180°
              </button>
              <button className="btn small" onClick={() => setCells(EMPTY_CELLS)}>
                Clear
              </button>
            </div>
            <input type="text" readOnly value={fen} style={{ marginTop: 8 }} onFocus={(e) => e.target.select()} />
            {fenError && <div className="error small">Not a legal position yet: {fenError}</div>}
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="btn primary"
                disabled={!!fenError}
                onClick={() => {
                  setPending({ fen });
                  navigate('analysis', { fen });
                }}
              >
                🔍 Analyse
              </button>
              <button
                className="btn"
                disabled={!!fenError}
                onClick={() => {
                  setPending({ fen });
                  navigate('play');
                }}
              >
                ♟ Play from here
              </button>
            </div>
          </div>
        </div>
      )}

      {!src && (
        <div className="card">
          <h3>Or set up a position by hand</h3>
          <p className="muted small">Use the board editor to enter any position from a book or a real game.</p>
          <button
            className="btn"
            onClick={() => {
              const c = document.createElement('canvas');
              c.width = c.height = 8;
              setSrc(c);
              setRect({ x: 0, y: 0, w: 8, h: 8 });
              setCells(EMPTY_CELLS);
            }}
          >
            Open board editor
          </button>
        </div>
      )}
    </div>
  );
}

function CropCanvas({ src, rect, onChange }: { src: HTMLCanvasElement; rect: Rect; onChange: (r: Rect) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: 'move' | 'tl' | 'tr' | 'bl' | 'br'; sx: number; sy: number; r: Rect } | null>(null);

  useEffect(() => {
    const c = ref.current!;
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, c.width, rect.y);
    ctx.fillRect(0, rect.y + rect.h, c.width, c.height - rect.y - rect.h);
    ctx.fillRect(0, rect.y, rect.x, rect.h);
    ctx.fillRect(rect.x + rect.w, rect.y, c.width - rect.x - rect.w, rect.h);
    ctx.strokeStyle = '#3987e5';
    ctx.lineWidth = Math.max(2, c.width / 300);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 0.5;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(rect.x + (rect.w * i) / 8, rect.y);
      ctx.lineTo(rect.x + (rect.w * i) / 8, rect.y + rect.h);
      ctx.moveTo(rect.x, rect.y + (rect.h * i) / 8);
      ctx.lineTo(rect.x + rect.w, rect.y + (rect.h * i) / 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const hs = Math.max(8, c.width / 60);
    ctx.fillStyle = '#3987e5';
    for (const [x, y] of [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x, rect.y + rect.h],
      [rect.x + rect.w, rect.y + rect.h],
    ])
      ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
  }, [src, rect]);

  function toImg(e: React.PointerEvent) {
    const b = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * src.width, y: ((e.clientY - b.top) / b.height) * src.height };
  }

  function down(e: React.PointerEvent) {
    const p = toImg(e);
    const tol = src.width / 25;
    const near = (x: number, y: number) => Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol;
    let mode: 'move' | 'tl' | 'tr' | 'bl' | 'br' = 'move';
    if (near(rect.x, rect.y)) mode = 'tl';
    else if (near(rect.x + rect.w, rect.y)) mode = 'tr';
    else if (near(rect.x, rect.y + rect.h)) mode = 'bl';
    else if (near(rect.x + rect.w, rect.y + rect.h)) mode = 'br';
    drag.current = { mode, sx: p.x, sy: p.y, r: { ...rect } };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = toImg(e);
    const dx = p.x - d.sx;
    const dy = p.y - d.sy;
    const r = { ...d.r };
    if (d.mode === 'move') {
      r.x += dx;
      r.y += dy;
    } else {
      if (d.mode.includes('l')) {
        r.x += dx;
        r.w -= dx;
      } else r.w += dx;
      if (d.mode.includes('t')) {
        r.y += dy;
        r.h -= dy;
      } else r.h += dy;
    }
    if (r.w > 16 && r.h > 16) onChange(r);
  }

  return (
    <canvas
      ref={ref}
      className="scan-canvas"
      style={{ width: '100%' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
    />
  );
}
