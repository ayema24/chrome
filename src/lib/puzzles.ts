import PUZZLES_RAW from '../data/puzzles.json';
import type { Puzzle } from './puzzleTypes';
import type { CoreData } from './store';

export const LOCAL_PUZZLES = PUZZLES_RAW as Puzzle[];

export function localThemes(): { theme: string; count: number }[] {
  const m = new Map<string, number>();
  for (const p of LOCAL_PUZZLES) for (const t of p.themes) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count);
}

/** Picks the next local puzzle: unseen first, closest to the player's rating. */
export function pickLocalPuzzle(core: CoreData, theme?: string, excludeId?: string): Puzzle | null {
  const attempted = new Map<string, boolean>();
  for (const a of core.puzzleAttempts) attempted.set(a.id, (attempted.get(a.id) ?? false) || a.success);
  let pool = LOCAL_PUZZLES.filter((p) => (!theme || p.themes.includes(theme)) && p.id !== excludeId);
  if (pool.length === 0) return null;
  const unseen = pool.filter((p) => !attempted.has(p.id));
  // Failed puzzles come back once everything has been seen.
  const failed = pool.filter((p) => attempted.get(p.id) === false);
  pool = unseen.length ? unseen : failed.length ? failed : pool;
  const r = core.puzzleRating;
  const sorted = [...pool].sort((a, b) => Math.abs(a.rating - r) - Math.abs(b.rating - r));
  const top = sorted.slice(0, Math.min(8, sorted.length));
  return top[Math.floor(Math.random() * top.length)];
}
