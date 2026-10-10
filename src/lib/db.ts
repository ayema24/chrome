// Online data sources: Lichess & Chess.com game imports, the Lichess opening
// explorer (masters + Lichess players) and the Lichess puzzle API. Every call
// fails gracefully – the app keeps working offline.
import { Chess } from 'chess.js';
import { getBook } from './openings';
import { fenKey, parsePgn, splitPgn, moveToUci } from './chess';
import type { GameRecord } from './store';
import type { Puzzle } from './puzzleTypes';
import { nameOpening } from './openings';

export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
}

export interface ExplorerGame {
  id: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  year?: number;
  winner?: 'white' | 'black' | null;
}

export interface ExplorerResult {
  source: 'masters' | 'lichess' | 'book';
  opening?: { eco: string; name: string } | null;
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  topGames: ExplorerGame[];
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const explorerCache = new Map<string, ExplorerResult>();

export async function explore(fen: string, source: 'masters' | 'lichess', token?: string): Promise<ExplorerResult> {
  const key = `${source}|${fen}`;
  const hit = explorerCache.get(key);
  if (hit) return hit;
  const params = new URLSearchParams({ fen, moves: '12', topGames: '8' });
  if (source === 'lichess') {
    params.set('variant', 'standard');
    params.set('speeds', 'blitz,rapid,classical');
    params.set('ratings', '1600,1800,2000,2200,2500');
    params.set('recentGames', '0');
  }
  const url = `https://explorer.lichess.ovh/${source}?${params}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Explorer returned ${res.status}${res.status === 401 ? ' – add a Lichess token in Settings' : ''}`);
  const data = await res.json();
  const out: ExplorerResult = {
    source,
    opening: data.opening ?? null,
    white: data.white ?? 0,
    draws: data.draws ?? 0,
    black: data.black ?? 0,
    moves: (data.moves ?? []).map((m: any) => ({
      uci: m.uci,
      san: m.san,
      white: m.white,
      draws: m.draws,
      black: m.black,
      averageRating: m.averageRating,
    })),
    topGames: (data.topGames ?? []).map((g: any) => ({
      id: g.id,
      white: g.white?.name ?? '?',
      black: g.black?.name ?? '?',
      whiteRating: g.white?.rating,
      blackRating: g.black?.rating,
      year: g.year,
      winner: g.winner ?? null,
    })),
  };
  explorerCache.set(key, out);
  return out;
}

/** Offline fallback using the built-in curriculum. */
export function exploreBook(fen: string): ExplorerResult {
  const entry = getBook().get(fenKey(fen));
  const moves: ExplorerMove[] = entry
    ? [...entry.values()].sort((a, b) => b.count - a.count).map((m) => ({ uci: m.uci, san: m.san, white: m.count, draws: 0, black: 0 }))
    : [];
  return { source: 'book', opening: null, white: 0, draws: 0, black: 0, moves, topGames: [] };
}

export async function fetchMastersGamePgn(id: string, token?: string): Promise<string> {
  const res = await fetch(`https://explorer.lichess.ovh/masters/pgn/${id}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Could not fetch game (${res.status})`);
  return res.text();
}

// ------------------------------------------------------------- game import

function resultOf(h: Record<string, string>): GameRecord['result'] {
  const r = h.Result;
  return r === '1-0' || r === '0-1' || r === '1/2-1/2' ? r : '*';
}

function dateOf(h: Record<string, string>): number {
  const d = (h.UTCDate ?? h.Date ?? '').replace(/\./g, '-');
  const t = (h.UTCTime ?? '00:00:00');
  const ms = Date.parse(`${d}T${t}Z`);
  return Number.isFinite(ms) ? ms : Date.now();
}

export function pgnToRecord(pgn: string, source: GameRecord['source'], username?: string, idHint?: string): GameRecord | null {
  const parsed = parsePgn(pgn);
  if (!parsed || parsed.moves.length === 0) return null;
  const h = parsed.headers;
  const white = h.White ?? 'White';
  const black = h.Black ?? 'Black';
  const u = username?.toLowerCase();
  const userColor = u ? (white.toLowerCase() === u ? 'w' : black.toLowerCase() === u ? 'b' : null) : null;
  const site = h.Site ?? h.Link ?? '';
  const id = idHint ?? (site.match(/lichess\.org\/(\w{8})/)?.[1] ? `li-${site.match(/lichess\.org\/(\w{8})/)![1]}` : `${source}-${hash(pgn)}`);
  const opening = h.Opening ?? (h.ECOUrl ? decodeURIComponent(h.ECOUrl.split('/').pop() ?? '').replace(/-/g, ' ') : null) ?? nameOpening(parsed.moves.map((m) => m.after));
  return {
    id,
    source,
    pgn,
    white,
    black,
    userColor,
    result: resultOf(h),
    date: dateOf(h),
    opening: opening || nameOpening(parsed.moves.map((m) => m.after)),
    timeControl: h.TimeControl,
    url: site.startsWith('http') ? site : undefined,
  };
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export async function fetchLichessGames(username: string, max: number, token?: string): Promise<GameRecord[]> {
  const params = new URLSearchParams({ max: String(max), clocks: 'true', opening: 'true', evals: 'false', literate: 'false' });
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`, {
    headers: { Accept: 'application/x-chess-pgn', ...authHeaders(token) },
  });
  if (res.status === 404) throw new Error(`Lichess user "${username}" not found`);
  if (!res.ok) throw new Error(`Lichess returned ${res.status}`);
  const text = await res.text();
  return splitPgn(text)
    .map((p) => pgnToRecord(p, 'lichess', username))
    .filter((g): g is GameRecord => !!g);
}

export async function fetchChesscomGames(username: string, max: number): Promise<GameRecord[]> {
  const u = encodeURIComponent(username.toLowerCase());
  const res = await fetch(`https://api.chess.com/pub/player/${u}/games/archives`);
  if (res.status === 404) throw new Error(`Chess.com user "${username}" not found`);
  if (!res.ok) throw new Error(`Chess.com returned ${res.status}`);
  const { archives } = (await res.json()) as { archives: string[] };
  const out: GameRecord[] = [];
  for (const url of [...archives].reverse()) {
    if (out.length >= max) break;
    const r = await fetch(url);
    if (!r.ok) continue;
    const data = (await r.json()) as { games: { pgn?: string; url?: string; rules?: string }[] };
    for (const g of [...data.games].reverse()) {
      if (out.length >= max) break;
      if (!g.pgn || (g.rules && g.rules !== 'chess')) continue;
      const rec = pgnToRecord(g.pgn, 'chesscom', username, g.url ? `cc-${g.url.split('/').pop()}` : undefined);
      if (rec) {
        if (g.url) rec.url = g.url;
        out.push(rec);
      }
    }
  }
  return out;
}

// ----------------------------------------------------------------- puzzles

export const LICHESS_DIFFICULTIES = ['easiest', 'easier', 'normal', 'harder', 'hardest'] as const;

/** Converts a Lichess API puzzle (game PGN + solution) into our format. */
export function convertLichessPuzzle(data: any): Puzzle | null {
  const pgn: string = data?.game?.pgn ?? '';
  const solution: string[] = data?.puzzle?.solution ?? [];
  if (!pgn || solution.length === 0) return null;
  const chess = new Chess();
  const sans = pgn.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  let last: { before: string; uci: string } | null = null;
  for (const san of sans) {
    try {
      const m = chess.move(san);
      last = { before: m.before, uci: moveToUci(m) };
    } catch {
      return null;
    }
  }
  // Sanity check: the first solution move must be legal here.
  const test = new Chess(chess.fen());
  try {
    test.move({ from: solution[0].slice(0, 2), to: solution[0].slice(2, 4), promotion: solution[0][4] });
  } catch {
    return null;
  }
  return {
    id: `li-${data.puzzle.id}`,
    fen: chess.fen(),
    moves: solution,
    rating: data.puzzle.rating ?? 1500,
    themes: data.puzzle.themes ?? [],
    source: 'lichess',
    setupMove: last?.uci,
    fenBeforeSetup: last?.before,
    gameUrl: data.game?.id ? `https://lichess.org/${data.game.id}` : undefined,
  };
}

export async function fetchLichessPuzzle(opts: { theme?: string; difficulty?: string; token?: string } = {}): Promise<Puzzle> {
  const params = new URLSearchParams();
  if (opts.theme) params.set('angle', opts.theme);
  if (opts.difficulty) params.set('difficulty', opts.difficulty);
  const res = await fetch(`https://lichess.org/api/puzzle/next?${params}`, { headers: authHeaders(opts.token) });
  if (!res.ok) throw new Error(`Lichess puzzles returned ${res.status}`);
  const p = convertLichessPuzzle(await res.json());
  if (!p) throw new Error('Could not read the Lichess puzzle');
  return p;
}

export async function fetchDailyPuzzle(): Promise<Puzzle> {
  const res = await fetch('https://lichess.org/api/puzzle/daily');
  if (!res.ok) throw new Error(`Lichess returned ${res.status}`);
  const p = convertLichessPuzzle(await res.json());
  if (!p) throw new Error('Could not read the daily puzzle');
  return p;
}

/** Imports one or more games from pasted PGN text. */
export function importPgnText(text: string, username?: string): GameRecord[] {
  return splitPgn(text)
    .map((p) => pgnToRecord(p, 'pgn', username))
    .filter((g): g is GameRecord => !!g);
}
