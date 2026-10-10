// Opening report from the player's own games: where they leave the lines they
// study, and the opening positions where they repeatedly go wrong.
import { Chess } from 'chess.js';
import { getBook } from './openings';
import { fenKey, parsePgn, moveToUci, formatLine } from './chess';
import { OPENINGS } from '../data/openings';
import { scoreOf } from './insights';
import type { GameRecord } from './store';
import type { MoveClass } from './analysis';

export interface Deviation {
  key: string; // fenKey + played move
  fen: string;
  moveLabel: string; // e.g. "4...Nf6"
  played: string;
  bookMoves: string[];
  openingId: string;
  openingName: string;
  lineIndex: number;
  games: { id: string; score: number | null; cls?: MoveClass }[];
}

export interface OpeningMistake {
  key: string;
  fen: string;
  moveLabel: string;
  played: string;
  best: string | null;
  bestLine: string;
  cls: MoveClass;
  games: { id: string; score: number | null }[];
  avgDrop: number;
}

export interface OpeningReport {
  gamesScanned: number;
  deviations: Deviation[];
  opponentDeviations: number;
  mistakes: OpeningMistake[];
  avgBookExit: number | null; // average full-move number where the user leaves book
}

function label(fen: string, san: string): string {
  return formatLine(fen, [san]);
}

export function buildOpeningReport(games: GameRecord[]): OpeningReport {
  const book = getBook();
  const devs = new Map<string, Deviation>();
  const mistakes = new Map<string, OpeningMistake & { drops: number[] }>();
  let opponentDeviations = 0;
  const exits: number[] = [];
  let scanned = 0;

  for (const g of games) {
    if (!g.userColor) continue;
    const parsed = parsePgn(g.pgn);
    if (!parsed) continue;
    scanned++;
    const score = scoreOf(g);

    // 1. Book deviations (curriculum lines)
    let inBook = true;
    for (let i = 0; i < parsed.moves.length && inBook && i < 40; i++) {
      const m = parsed.moves[i];
      const entry = book.get(fenKey(m.before));
      if (!entry || entry.size === 0) break; // left known territory
      const uci = moveToUci(m);
      if (entry.has(uci)) continue;
      inBook = false;
      if (m.color !== g.userColor) {
        opponentDeviations++;
        break;
      }
      exits.push(Math.floor(i / 2) + 1);
      const bookMoves = [...entry.values()];
      const ref = bookMoves[0].lines[0];
      const op = OPENINGS.find((o) => o.id === ref.openingId)!;
      const key = `${fenKey(m.before)}|${uci}`;
      const d = devs.get(key) ?? {
        key,
        fen: m.before,
        moveLabel: label(m.before, m.san),
        played: m.san,
        bookMoves: bookMoves.map((b) => b.san),
        openingId: ref.openingId,
        openingName: op.name,
        lineIndex: ref.lineIndex,
        games: [],
      };
      d.games.push({ id: g.id, score, cls: g.analysis?.moves[i]?.cls });
      devs.set(key, d);
    }

    // 2. First real opening mistake (from engine analysis)
    const a = g.analysis;
    if (a) {
      const first = a.moves.find(
        (mv) => mv.color === g.userColor && mv.ply < 30 && (mv.cls === 'mistake' || mv.cls === 'blunder' || mv.cls === 'inaccuracy'),
      );
      if (first) {
        const key = `${fenKey(first.fenBefore)}|${first.uci}`;
        const e = mistakes.get(key) ?? {
          key,
          fen: first.fenBefore,
          moveLabel: label(first.fenBefore, first.san),
          played: first.san,
          best: first.bestSan,
          bestLine: first.bestLine,
          cls: first.cls,
          games: [],
          avgDrop: 0,
          drops: [],
        };
        e.games.push({ id: g.id, score });
        e.drops.push(first.drop);
        if (['blunder', 'mistake', 'inaccuracy'].indexOf(first.cls) < ['blunder', 'mistake', 'inaccuracy'].indexOf(e.cls)) e.cls = first.cls;
        mistakes.set(key, e);
      }
    }
  }

  const mistakeList = [...mistakes.values()]
    .map(({ drops, ...m }) => ({ ...m, avgDrop: drops.reduce((x, y) => x + y, 0) / drops.length }))
    .sort((a, b) => b.games.length - a.games.length || b.avgDrop - a.avgDrop);

  return {
    gamesScanned: scanned,
    deviations: [...devs.values()].sort((a, b) => b.games.length - a.games.length),
    opponentDeviations,
    mistakes: mistakeList,
    avgBookExit: exits.length ? exits.reduce((x, y) => x + y, 0) / exits.length : null,
  };
}

/** Is a position from the report reachable in a drill line? */
export function isLegalFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}
