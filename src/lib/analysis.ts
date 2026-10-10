import { Chess } from 'chess.js';
import { Engine, type PvLine, type SearchResult } from './engine';
import {
  gamePhase,
  materialBalance,
  parseUci,
  uciLineToSan,
  formatLine,
  moveToUci,
  type Phase,
  type Color,
  type Move,
} from './chess';

/** Evaluation from White's point of view. */
export interface Eval {
  cp?: number;
  mate?: number;
}

export type MoveClass = 'book' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export type MistakeTag =
  | 'missed-mate'
  | 'allowed-mate'
  | 'hung-material'
  | 'missed-tactic'
  | 'missed-punish'
  | 'positional'
  | 'time-trouble'
  | 'endgame-technique'
  | 'opening-error';

export interface MoveAnalysis {
  ply: number;
  san: string;
  uci: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  best: string | null;
  bestSan: string | null;
  bestLine: string;
  evalBefore: Eval;
  evalAfter: Eval;
  winBefore: number; // mover's win % before
  winAfter: number; // mover's win % after
  drop: number;
  accuracy: number;
  cls: MoveClass;
  tags: MistakeTag[];
  phase: Phase;
  clock: number | null;
  explanation: string;
}

export interface GameAnalysis {
  depth: number;
  moves: MoveAnalysis[];
  evals: Eval[];
  accuracy: { w: number; b: number };
  counts: { w: ClassCounts; b: ClassCounts };
  analysedAt: number;
}

export type ClassCounts = Record<'inaccuracy' | 'mistake' | 'blunder', number>;

export interface ReviewContext {
  prev?: MoveAnalysis;
  bookPlies?: Set<string>;
  clock?: number | null;
  initialClock?: number | null;
}

/** Classifies and explains a single move given engine results before/after it. */
export function reviewMove(
  m: Move,
  ply: number,
  before: Eval,
  after: Eval,
  res: SearchResult | null | undefined,
  resAfter: SearchResult | null | undefined,
  ctx: ReviewContext = {},
): MoveAnalysis {
  const color = m.color as Color;
  const winBefore = moverWin(before, color);
  const winAfter = moverWin(after, color);
  const drop = Math.max(0, winBefore - winAfter);
  const best = res?.bestMove ?? null;
  const uci = moveToUci(m);
  const isBest = best === uci;
  let cls = classify(drop, isBest);
  const keyAfter = m.after.split(' ').slice(0, 4).join(' ');
  if (ctx.bookPlies?.has(keyAfter) && drop < 10) cls = 'book';
  const chessBefore = new Chess(m.before);
  const phase = gamePhase(chessBefore, ply);
  const bestPv = res?.lines[0]?.pv ?? [];
  const bestSanLine = uciLineToSan(m.before, bestPv, 8);
  const clock = ctx.clock ?? null;
  const afterPv = resAfter?.lines[0]?.pv ?? [];

  const tags: MistakeTag[] = [];
  if (cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder') {
    const sign = color === 'w' ? 1 : -1;
    const matBefore = materialBalance(chessBefore) * sign;
    const playedMat = materialAfter(m.after, afterPv, 4) * sign - matBefore;
    const bestMat = materialAfter(m.before, bestPv, 5) * sign - matBefore;
    const beforeMateForMe = before.mate !== undefined && before.mate * sign > 0;
    const afterMateForMe = after.mate !== undefined && after.mate * sign > 0;
    const afterMateAgainst = after.mate !== undefined && after.mate * sign < 0;
    if (beforeMateForMe && !afterMateForMe) tags.push('missed-mate');
    if (afterMateAgainst) tags.push('allowed-mate');
    if (!afterMateAgainst && playedMat <= -2 && cls !== 'inaccuracy') tags.push('hung-material');
    if (!beforeMateForMe && bestMat - playedMat >= 2 && bestMat >= 1) {
      tags.push('missed-tactic');
      const prev = ctx.prev;
      if (prev && (prev.cls === 'blunder' || prev.cls === 'mistake')) tags.push('missed-punish');
    }
    if (tags.length === 0) tags.push('positional');
    if (phase === 'endgame') tags.push('endgame-technique');
    if (phase === 'opening') tags.push('opening-error');
    const ic = ctx.initialClock;
    if (clock !== null && (clock < 30 || (ic && clock < ic * 0.1))) tags.push('time-trouble');
  }

  const ma: MoveAnalysis = {
    ply,
    san: m.san,
    uci,
    color,
    fenBefore: m.before,
    fenAfter: m.after,
    best,
    bestSan: bestSanLine[0] ?? null,
    bestLine: formatLine(m.before, bestSanLine),
    evalBefore: before,
    evalAfter: after,
    winBefore,
    winAfter,
    drop,
    accuracy: moveAccuracy(drop),
    cls,
    tags,
    phase,
    clock,
    explanation: '',
  };
  ma.explanation = explainMove(ma, afterPv);
  return ma;
}

export function winPercentFromCp(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** White's winning chances 0..100. */
export function whiteWin(ev: Eval): number {
  if (ev.mate !== undefined) return ev.mate > 0 ? 100 : ev.mate < 0 ? 0 : 50;
  return winPercentFromCp(ev.cp ?? 0);
}

export function moverWin(ev: Eval, color: Color): number {
  const w = whiteWin(ev);
  return color === 'w' ? w : 100 - w;
}

export function moveAccuracy(drop: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, drop)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export function classify(drop: number, isBest: boolean): MoveClass {
  if (isBest || drop < 1) return 'best';
  if (drop < 4) return 'excellent';
  if (drop < 10) return 'good';
  if (drop < 20) return 'inaccuracy';
  if (drop < 30) return 'mistake';
  return 'blunder';
}

/** Converts an engine line (side-to-move POV) to a White POV eval. */
export function lineToEval(line: PvLine | undefined, fen: string): Eval {
  if (!line) return { cp: 0 };
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  if (line.mate !== undefined) return { mate: line.mate * sign };
  return { cp: (line.cp ?? 0) * sign };
}

export function formatEval(ev: Eval): string {
  if (ev.mate !== undefined) return ev.mate === 0 ? '#' : `${ev.mate > 0 ? '' : '-'}M${Math.abs(ev.mate)}`;
  const p = (ev.cp ?? 0) / 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}`;
}

/** Eval of a terminal position (checkmate / draw), White POV. */
export function terminalEval(chess: Chess): Eval | null {
  if (chess.isCheckmate()) return { mate: 0, cp: chess.turn() === 'w' ? -100000 : 100000 };
  if (chess.isDraw() || chess.isStalemate()) return { cp: 0 };
  return null;
}

function normaliseTerminal(ev: Eval): Eval {
  // mate:0 means the side to move is mated; express as a big cp for maths.
  if (ev.mate === 0) return { mate: (ev.cp ?? 0) > 0 ? 1 : -1 };
  return ev;
}

function materialAfter(fen: string, pv: string[], plies: number): number {
  const c = new Chess(fen);
  for (const u of pv.slice(0, plies)) {
    try {
      c.move(parseUci(u));
    } catch {
      break;
    }
  }
  return materialBalance(c);
}

export interface AnalyseOptions {
  depth?: number;
  bookPlies?: Set<string>; // fen keys considered "book"
  clocks?: (number | null)[];
  initialClock?: number | null;
  onProgress?: (done: number, total: number) => void;
  shouldStop?: () => boolean;
}

export async function analyseMoves(
  engine: Engine,
  startFen: string,
  moves: Move[],
  opts: AnalyseOptions = {},
): Promise<GameAnalysis> {
  const depth = opts.depth ?? 14;
  const fens = [startFen, ...moves.map((m) => m.after)];
  const results: (SearchResult | null)[] = [];
  const evals: Eval[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (opts.shouldStop?.()) throw new Error('stopped');
    const chess = new Chess(fens[i]);
    const term = terminalEval(chess);
    if (term) {
      results.push(null);
      evals.push(normaliseTerminal(term));
    } else {
      const r = await engine.search(fens[i], { depth, multipv: 1 });
      results.push(r);
      evals.push(lineToEval(r.lines[0], fens[i]));
    }
    opts.onProgress?.(i + 1, fens.length);
  }

  const out: MoveAnalysis[] = [];
  const initialClock = opts.initialClock ?? (opts.clocks?.[0] ?? null);
  for (let i = 0; i < moves.length; i++) {
    out.push(
      reviewMove(moves[i], i, evals[i], evals[i + 1], results[i], results[i + 1], {
        prev: out[i - 1],
        bookPlies: opts.bookPlies,
        clock: opts.clocks?.[i] ?? null,
        initialClock,
      }),
    );
  }

  const acc = (c: Color) => gameAccuracy(out.filter((x) => x.color === c).map((x) => x.accuracy));
  const counts = (c: Color): ClassCounts => {
    const r: ClassCounts = { inaccuracy: 0, mistake: 0, blunder: 0 };
    for (const x of out) if (x.color === c && x.cls in r) r[x.cls as keyof ClassCounts]++;
    return r;
  };
  return {
    depth,
    moves: out,
    evals,
    accuracy: { w: acc('w'), b: acc('b') },
    counts: { w: counts('w'), b: counts('b') },
    analysedAt: Date.now(),
  };
}

/** Blend of arithmetic and harmonic mean, which punishes big errors like Lichess does. */
export function gameAccuracy(accs: number[]): number {
  if (accs.length === 0) return 0;
  const mean = accs.reduce((a, b) => a + b, 0) / accs.length;
  const harmonic = accs.length / accs.reduce((a, b) => a + 1 / Math.max(1, b), 0);
  return Math.round(((mean + harmonic) / 2) * 10) / 10;
}

export const CLASS_LABEL: Record<MoveClass, string> = {
  book: 'Book',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

export const CLASS_SYMBOL: Record<MoveClass, string> = {
  book: '📖',
  best: '★',
  excellent: '!',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

export const TAG_LABEL: Record<MistakeTag, string> = {
  'missed-mate': 'Missed checkmate',
  'allowed-mate': 'Allowed checkmate',
  'hung-material': 'Hung material',
  'missed-tactic': 'Missed tactic',
  'missed-punish': "Didn't punish opponent's mistake",
  positional: 'Positional / planning error',
  'time-trouble': 'Error in time trouble',
  'endgame-technique': 'Endgame technique',
  'opening-error': 'Opening error',
};

export function explainMove(m: MoveAnalysis, replyPv: string[]): string {
  const ev = formatEval(m.evalAfter);
  if (m.cls === 'book') return `${m.san} is a known opening move.`;
  if (m.cls === 'best') return `${m.san} is the engine's top choice (${ev}).`;
  if (m.cls === 'excellent' || m.cls === 'good')
    return `${m.san} is fine (${ev}).${m.bestSan && m.bestSan !== m.san ? ` ${m.bestSan} was slightly more precise.` : ''}`;
  const parts: string[] = [];
  const label = CLASS_LABEL[m.cls];
  parts.push(`${label}: ${m.san} drops your winning chances by ${Math.round(m.drop)}% (now ${ev}).`);
  const reply = uciLineToSan(m.fenAfter, replyPv, 4);
  if (m.tags.includes('allowed-mate')) parts.push(`It allows a forced mate: ${formatLine(m.fenAfter, reply)}.`);
  else if (m.tags.includes('hung-material') && reply.length)
    parts.push(`Your opponent can win material with ${formatLine(m.fenAfter, reply.slice(0, 3))}.`);
  if (m.tags.includes('missed-mate')) parts.push(`You had a forced mate starting with ${m.bestSan}.`);
  else if (m.tags.includes('missed-punish')) parts.push(`Your opponent had just erred — ${m.bestSan} would have punished it.`);
  else if (m.tags.includes('missed-tactic')) parts.push(`${m.bestSan} wins material.`);
  if (m.bestLine) parts.push(`Best was ${m.bestLine}.`);
  if (m.tags.includes('time-trouble')) parts.push('This happened with little time on the clock.');
  return parts.join(' ');
}
