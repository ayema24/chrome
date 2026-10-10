import { Chess, type Square, type Move, type PieceSymbol, type Color } from 'chess.js';

export type { Square, Move, PieceSymbol, Color };
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface UciMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export function parseUci(uci: string): UciMove {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] as PieceSymbol) || undefined,
  };
}

export function moveToUci(m: { from: string; to: string; promotion?: string }): string {
  return m.from + m.to + (m.promotion ?? '');
}

/** Plays a UCI move on a copy of `fen`; returns null if illegal. */
export function tryUci(fen: string, uci: string): { chess: Chess; move: Move } | null {
  const chess = new Chess(fen);
  try {
    const move = chess.move(parseUci(uci));
    return { chess, move };
  } catch {
    return null;
  }
}

export function uciToSan(fen: string, uci: string): string {
  return tryUci(fen, uci)?.move.san ?? uci;
}

/** Converts a UCI line to SAN, stopping at the first illegal move. */
export function uciLineToSan(fen: string, ucis: string[], max = 99): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const u of ucis.slice(0, max)) {
    try {
      out.push(chess.move(parseUci(u)).san);
    } catch {
      break;
    }
  }
  return out;
}

/** Formats a SAN line with move numbers starting from `fen`. */
export function formatLine(fen: string, sans: string[]): string {
  const parts = fen.split(' ');
  let moveNo = parseInt(parts[5] ?? '1', 10);
  let white = parts[1] === 'w';
  const out: string[] = [];
  sans.forEach((san, i) => {
    if (white) out.push(`${moveNo}.`);
    else if (i === 0) out.push(`${moveNo}...`);
    out.push(san);
    if (!white) moveNo++;
    white = !white;
  });
  return out.join(' ');
}

/** Material balance from White's perspective in pawns. */
export function materialBalance(chess: Chess): number {
  let sum = 0;
  for (const row of chess.board())
    for (const sq of row) if (sq) sum += (sq.color === 'w' ? 1 : -1) * PIECE_VALUE[sq.type];
  return sum;
}

/** Non-pawn, non-king material on the board (both sides). */
export function nonPawnMaterial(chess: Chess): number {
  let sum = 0;
  for (const row of chess.board())
    for (const sq of row) if (sq && sq.type !== 'p' && sq.type !== 'k') sum += PIECE_VALUE[sq.type];
  return sum;
}

export type Phase = 'opening' | 'middlegame' | 'endgame';

export function gamePhase(chess: Chess, ply: number): Phase {
  const npm = nonPawnMaterial(chess);
  if (npm <= 26) return 'endgame'; // e.g. each side has at most R+B+minor or Q+minor
  if (ply < 20 && npm >= 58) return 'opening';
  return 'middlegame';
}

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** Normalises a FEN to its position-identity part (board, side, castling, ep). */
export function fenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

export interface ParsedPgnGame {
  headers: Record<string, string>;
  moves: Move[];
  clocks: (number | null)[]; // seconds remaining after each move, if present
  startFen: string;
}

/** Parses one PGN game (handles comments, clocks, variations are dropped by chess.js). */
export function parsePgn(pgn: string): ParsedPgnGame | null {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch {
    return null;
  }
  const headers = chess.getHeaders() as Record<string, string>;
  const moves = chess.history({ verbose: true });
  const comments = chess.getComments();
  const clockByFen = new Map<string, number>();
  for (const c of comments) {
    const m = c.comment.match(/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/);
    if (m) clockByFen.set(c.fen, +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]));
  }
  const clocks = moves.map((mv) => clockByFen.get(mv.after) ?? null);
  const startFen = headers.FEN ?? START_FEN;
  return { headers, moves, clocks, startFen };
}

/** Splits a multi-game PGN file into individual game strings. */
export function splitPgn(text: string): string[] {
  const games: string[] = [];
  const normalised = text.replace(/\r\n/g, '\n').trim();
  if (!normalised) return games;
  const chunks = normalised.split(/\n\s*\n(?=\[Event )/);
  for (const c of chunks) if (c.trim()) games.push(c.trim());
  return games;
}

export function squareColor(sq: string): 'light' | 'dark' {
  const f = sq.charCodeAt(0) - 97;
  const r = parseInt(sq[1], 10) - 1;
  return (f + r) % 2 === 0 ? 'dark' : 'light';
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function kingSquare(chess: Chess, color: Color): Square | null {
  for (const row of chess.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === color) return sq.square;
  return null;
}
