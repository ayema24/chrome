import { Chess } from 'chess.js';
import { OPENINGS, type OpeningDef } from '../data/openings';
import { START_FEN, fenKey, moveToUci } from './chess';

export interface ParsedLine {
  openingId: string;
  lineIndex: number;
  name: string;
  intro: string;
  sans: string[];
  ucis: string[];
  /** fens[i] = position before move i; fens[sans.length] = final position. */
  fens: string[];
  comments: string[];
}

/** Parses PGN movetext with {comments}; throws on illegal moves. */
export function parseLine(def: OpeningDef, lineIndex: number): ParsedLine {
  const line = def.lines[lineIndex];
  const chess = new Chess(START_FEN);
  const tokens = line.pgn.match(/\{[^}]*\}|[^\s{}]+/g) ?? [];
  const sans: string[] = [];
  const ucis: string[] = [];
  const fens: string[] = [chess.fen()];
  const comments: string[] = [];
  let intro = '';
  for (const t of tokens) {
    if (t.startsWith('{')) {
      const text = t.slice(1, -1).trim();
      if (sans.length === 0) intro = text;
      else comments[sans.length - 1] = comments[sans.length - 1] ? `${comments[sans.length - 1]} ${text}` : text;
      continue;
    }
    if (/^\d+\.+$/.test(t)) continue;
    const clean = t.replace(/^\d+\.+/, '').replace(/[!?]+$/, '');
    if (!clean) continue;
    let mv;
    try {
      mv = chess.move(clean);
    } catch {
      throw new Error(`Illegal move "${t}" in ${def.id} / ${line.name} after ${sans.join(' ')}`);
    }
    sans.push(t.replace(/^\d+\.+/, ''));
    ucis.push(moveToUci(mv));
    fens.push(chess.fen());
  }
  for (let i = 0; i < sans.length; i++) comments[i] = comments[i] ?? '';
  return { openingId: def.id, lineIndex, name: line.name, intro, sans, ucis, fens, comments };
}

let cache: ParsedLine[] | null = null;
export function allLines(): ParsedLine[] {
  if (!cache) cache = OPENINGS.flatMap((o) => o.lines.map((_, i) => parseLine(o, i)));
  return cache;
}

export function linesFor(openingId: string): ParsedLine[] {
  return allLines().filter((l) => l.openingId === openingId);
}

export interface BookMove {
  uci: string;
  san: string;
  count: number;
  /** Lines that continue with this move (excluding trap blunders). */
  lines: { openingId: string; lineIndex: number }[];
}

let book: Map<string, Map<string, BookMove>> | null = null;
let names: Map<string, string> | null = null;

/** A small offline opening book built from the curriculum. Trap lines only contribute sound moves. */
export function getBook(): Map<string, Map<string, BookMove>> {
  if (book) return book;
  book = new Map();
  for (const l of allLines()) {
    const isTrap = /trap/i.test(l.name);
    for (let i = 0; i < l.ucis.length; i++) {
      const san = l.sans[i];
      if (isTrap && /\?/.test(san)) break; // don't put dubious moves in the book
      const key = fenKey(l.fens[i]);
      let entry = book.get(key);
      if (!entry) book.set(key, (entry = new Map()));
      const clean = san.replace(/[!?]+$/, '');
      const bm = entry.get(l.ucis[i]) ?? { uci: l.ucis[i], san: clean, count: 0, lines: [] };
      bm.count++;
      bm.lines.push({ openingId: l.openingId, lineIndex: l.lineIndex });
      entry.set(l.ucis[i], bm);
    }
  }
  return book;
}

/** Set of position keys that occur in the book (for "book move" classification). */
export function bookPositions(): Set<string> {
  const s = new Set<string>();
  for (const l of allLines()) {
    const isTrap = /trap/i.test(l.name);
    for (let i = 0; i < l.fens.length; i++) {
      if (isTrap && i > 0 && /\?/.test(l.sans[i - 1])) break;
      s.add(fenKey(l.fens[i]));
    }
  }
  return s;
}

function positionNames(): Map<string, string> {
  if (names) return names;
  names = new Map();
  for (const l of allLines()) {
    const def = OPENINGS.find((o) => o.id === l.openingId)!;
    if (def.category === 'trap') continue;
    for (let i = 1; i < l.fens.length; i++) {
      const k = fenKey(l.fens[i]);
      if (!names.has(k)) names.set(k, i >= 6 ? `${def.name}: ${l.name}` : def.name);
    }
  }
  return names;
}

// Common first moves that our curriculum might not name.
const BASIC_NAMES: [string, string][] = [
  ['e4', "King's Pawn Opening"],
  ['d4', "Queen's Pawn Opening"],
  ['c4', 'English Opening'],
  ['Nf3', 'Réti Opening'],
  ['e4 e5', 'Open Game'],
  ['e4 c5', 'Sicilian Defence'],
  ['e4 e6', 'French Defence'],
  ['e4 c6', 'Caro-Kann Defence'],
  ['e4 d5', 'Scandinavian Defence'],
  ['e4 d6', 'Pirc Defence'],
  ['e4 g6', 'Modern Defence'],
  ['e4 Nf6', "Alekhine's Defence"],
  ['d4 d5', 'Closed Game'],
  ['d4 Nf6', 'Indian Defence'],
  ['d4 f5', 'Dutch Defence'],
  ['e4 e5 Nf3 Nc6 Bc4', 'Italian Game'],
  ['e4 e5 Nf3 Nc6 Bb5', 'Ruy Lopez'],
  ['e4 e5 Nf3 Nc6 d4', 'Scotch Game'],
  ['e4 e5 Nf3 Nf6', 'Petroff Defence'],
  ['e4 e5 Nf3 d6', 'Philidor Defence'],
  ['e4 e5 Nc3', 'Vienna Game'],
  ['e4 e5 f4', "King's Gambit"],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3', 'Sicilian Defence: Open'],
  ['d4 Nf6 c4 g6', "King's Indian / Grünfeld"],
  ['d4 Nf6 c4 e6 Nc3 Bb4', 'Nimzo-Indian Defence'],
  ['d4 d5 c4', "Queen's Gambit"],
  ['d4 d5 Bf4', 'London System'],
  ['d4 Nf6 Bf4', 'London System'],
];

const basicByKey = (() => {
  const m = new Map<string, string>();
  for (const [moves, name] of BASIC_NAMES) {
    const c = new Chess();
    try {
      for (const s of moves.split(' ')) c.move(s);
      m.set(fenKey(c.fen()), name);
    } catch {
      /* ignore */
    }
  }
  return m;
})();

/** Names the opening of a game by walking the moves and keeping the deepest match. */
export function nameOpening(fensAfterEachMove: string[]): string | null {
  const n = positionNames();
  let best: string | null = null;
  for (let i = 0; i < Math.min(fensAfterEachMove.length, 30); i++) {
    const k = fenKey(fensAfterEachMove[i]);
    const hit = n.get(k) ?? basicByKey.get(k);
    if (hit) best = hit;
  }
  return best;
}

/** Opening family name without the variation (for grouping stats). */
export function openingFamily(name: string | null | undefined): string {
  if (!name) return 'Unknown';
  return name.split(':')[0].split(',')[0].trim();
}
