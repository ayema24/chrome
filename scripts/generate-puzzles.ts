// Generates a verified tactics puzzle set with Stockfish self-play.
//   npx tsx scripts/generate-puzzles.ts [count]
// Output: src/data/puzzles.json
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { createNodeEngine } from './node-engine';
import { allLines } from '../src/lib/openings';
import { detectThemes } from '../src/lib/motifs';
import { fenKey, materialBalance, moveToUci, parseUci } from '../src/lib/chess';
import type { Engine, PvLine } from '../src/lib/engine';
import type { Puzzle } from '../src/lib/puzzleTypes';
import { CLASSICS } from './classic-puzzles';

const TARGET = parseInt(process.argv[2] ?? '200', 10);
let seed = parseInt(process.argv[3] ?? '1234567', 10);
const OUT = process.argv[4] ?? '../src/data/puzzles.json';
const SKIP_CLASSICS = process.argv[5] === 'noclassics';
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

/** Score from the side-to-move POV in centipawns (mates mapped to ±(100000 - n)). */
function score(l: PvLine | undefined): number {
  if (!l) return -999999;
  if (l.mate !== undefined) return l.mate > 0 ? 100000 - l.mate : -100000 - l.mate;
  return l.cp ?? 0;
}

async function isUnique(engine: Engine, fen: string, depth = 18) {
  const r = await engine.search(fen, { depth, multipv: 2 });
  const [a, b] = r.lines;
  if (!a) return { ok: false, best: null as string | null, line: a };
  const sa = score(a);
  const sb = b ? score(b) : -999999;
  let ok: boolean;
  if (a.mate !== undefined && a.mate > 0) ok = !(b && b.mate !== undefined && b.mate > 0 && b.mate <= a.mate + 1);
  else ok = sa >= 250 && sa - sb >= 250 && sb < 200;
  return { ok, best: a.pv[0], line: a, second: b };
}

async function firstDepth(engine: Engine, fen: string, move: string) {
  for (const d of [1, 2, 3, 4, 6, 8, 10, 12, 14]) {
    const r = await engine.search(fen, { depth: d });
    if (r.bestMove === move) return d;
  }
  return 16;
}

async function buildSolution(engine: Engine, fen: string, firstMove?: string): Promise<string[] | null> {
  const chess = new Chess(fen);
  const me = chess.turn();
  const sign = me === 'w' ? 1 : -1;
  const startMat = materialBalance(chess) * sign;
  const first = await isUnique(engine, fen);
  if (!first.best || (firstMove && first.best !== firstMove)) return null;
  const isMate = first.line?.mate !== undefined && first.line.mate > 0;
  if (isMate && first.line!.mate! > 4) return null;
  if (!first.ok && !(isMate && first.line!.mate === 1)) return null;
  const moves: string[] = [first.best];
  chess.move(parseUci(first.best));
  for (let playerMoves = 1; playerMoves < 5; ) {
    if (chess.isGameOver()) break;
    if (!isMate) {
      const gained = materialBalance(chess) * sign - startMat;
      // Stop once material is won and the opponent can't immediately win it back.
      const r = await engine.search(chess.fen(), { depth: 16 });
      const reply = r.bestMove;
      if (!reply) break;
      const after = new Chess(chess.fen());
      after.move(parseUci(reply));
      const gainedAfterReply = materialBalance(after) * sign - startMat;
      if (gained >= 2 && gainedAfterReply >= 2) break;
      if (playerMoves >= 3) return null;
      moves.push(reply);
      chess.move(parseUci(reply));
    } else {
      const r = await engine.search(chess.fen(), { depth: 16 });
      if (!r.bestMove) break;
      moves.push(r.bestMove);
      chess.move(parseUci(r.bestMove));
    }
    const u = await isUnique(engine, chess.fen());
    if (!u.best) return null;
    const lastMateMove = u.line?.mate === 1;
    if (!u.ok && !lastMateMove) return null;
    moves.push(u.best);
    chess.move(parseUci(u.best));
    playerMoves++;
  }
  if (isMate && !chess.isCheckmate()) return null;
  if (!isMate) {
    const gained = materialBalance(chess) * sign - startMat;
    if (gained < 2 && !moves.some((m) => m.length === 5)) return null;
  }
  return moves;
}

async function main() {
  const engine = await createNodeEngine();
  const out: Puzzle[] = [];
  const seen = new Set<string>();
  const themeCount: Record<string, number> = {};

  // 1. Hand-picked classic patterns
  for (const c of SKIP_CLASSICS ? [] : CLASSICS) {
    const sol = await buildSolution(engine, c.fen, c.first);
    if (!sol) {
      console.warn('classic rejected:', c.title, c.fen);
      continue;
    }
    const fd = await firstDepth(engine, c.fen, sol[0]);
    const themes = [...new Set([...detectThemes(c.fen, sol), ...(c.themes ?? [])])];
    out.push({
      id: `c${out.length + 1}`,
      fen: c.fen,
      moves: sol,
      rating: Math.min(2300, 500 + fd * 100 + (Math.ceil(sol.length / 2) - 1) * 150),
      themes,
      source: 'classic',
      title: c.title,
    });
    seen.add(fenKey(c.fen));
    console.log('classic ok:', c.title, sol.join(' '));
  }

  // 2. Self-play generated puzzles
  const lines = allLines().filter((l) => !/trap/i.test(l.name));
  let games = 0;
  while (out.length < TARGET + (SKIP_CLASSICS ? 0 : CLASSICS.length) && games < 3000) {
    games++;
    const line = pick(lines);
    const startPly = Math.min(line.fens.length - 1, 4 + Math.floor(rand() * 10));
    const chess = new Chess(line.fens[startPly]);
    const skill = { w: Math.floor(rand() * 9), b: Math.floor(rand() * 9) };
    let prevScore: number | null = null; // previous position eval from its side-to-move POV
    for (let ply = 0; ply < 140 && !chess.isGameOver(); ply++) {
      const fen = chess.fen();
      const screen = await engine.search(fen, { depth: 10 });
      const s = score(screen.lines[0]);
      // prevScore is from opponent POV; negate to get ours before their move.
      const ourBefore = prevScore === null ? 0 : -prevScore;
      if (s >= 300 && ourBefore <= 120 && !seen.has(fenKey(fen))) {
        const sol = await buildSolution(engine, fen);
        if (sol) {
          const themes = detectThemes(fen, sol);
          const key = themes.find((t) => t.startsWith('mateIn')) ?? themes.find((t) => ['fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'promotion', 'sacrifice'].includes(t)) ?? 'other';
          const cap = key === 'hangingPiece' || key === 'mateIn1' ? 0.18 : 0.3;
          if ((themeCount[key] ?? 0) < TARGET * cap) {
            themeCount[key] = (themeCount[key] ?? 0) + 1;
            const fd = await firstDepth(engine, fen, sol[0]);
            const pm = Math.ceil(sol.length / 2);
            const lastMove = chess.history({ verbose: true }).slice(-1)[0];
            out.push({
              id: `g${out.length + 1}`,
              fen,
              moves: sol,
              rating: Math.max(500, Math.min(2400, 450 + fd * 105 + (pm - 1) * 160 + (themes.includes('quietMove') ? 150 : 0))),
              themes,
              source: 'generated',
              setupMove: lastMove ? moveToUci(lastMove) : undefined,
              fenBeforeSetup: lastMove?.before,
            });
            seen.add(fenKey(fen));
            console.log(`[${out.length}] game ${games} ply ${ply} ${key} ${sol.join(' ')}`);
          }
        }
      }
      // pick a move for self-play
      const side = chess.turn();
      let uci: string | null;
      if (rand() < 0.07) {
        uci = moveToUci(pick(chess.moves({ verbose: true })));
      } else {
        const r = await engine.search(fen, { depth: 3 + Math.floor(rand() * 6), skill: skill[side] });
        uci = r.bestMove;
      }
      if (!uci) break;
      chess.move(parseUci(uci));
      prevScore = s;
    }
    engine.newGame();
  }
  out.sort((a, b) => a.rating - b.rating);
  writeFileSync(new URL(OUT, import.meta.url), JSON.stringify(out));
  console.log('wrote', out.length, 'puzzles from', games, 'games', themeCount);
  process.exit(0);
}

main();
