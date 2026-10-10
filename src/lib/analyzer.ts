// Background game analysis queue. Analyses games with a dedicated engine so
// play/puzzles stay responsive, then feeds mistakes into the review deck.
import { useSyncExternalStore } from 'react';
import { getBackgroundEngine } from './engine';
import { analyseMoves, type GameAnalysis } from './analysis';
import { parsePgn } from './chess';
import { bookPositions } from './openings';
import { detectThemes } from './motifs';
import { addMistakeCards, getCore, getGames, upsertGame, type GameRecord, type MistakeCard } from './store';

interface Status {
  running: boolean;
  currentId: string | null;
  progress: number; // 0..1 for the current game
  queued: number;
}

let status: Status = { running: false, currentId: null, progress: 0, queued: 0 };
const queue: string[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function setStatus(s: Partial<Status>) {
  status = { ...status, ...s, queued: queue.length };
  emit();
}

export function useAnalyzer(): Status {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

export function enqueueAnalysis(ids: string[], front = false) {
  for (const id of ids) {
    if (queue.includes(id) || status.currentId === id) continue;
    if (front) queue.unshift(id);
    else queue.push(id);
  }
  setStatus({});
  void run();
}

export function cancelQueue() {
  queue.length = 0;
  setStatus({});
}

export function mistakesToCards(g: GameRecord, a: GameAnalysis): MistakeCard[] {
  if (!g.userColor) return [];
  const rating = getCore().puzzleRating;
  return a.moves
    .filter((m) => m.color === g.userColor && (m.cls === 'mistake' || m.cls === 'blunder') && m.best)
    .map((m) => ({
      puzzle: {
        id: `m-${g.id}-${m.ply}`,
        fen: m.fenBefore,
        moves: [m.best!],
        rating,
        themes: detectThemes(m.fenBefore, [m.best!]),
        source: 'mistake' as const,
        title: `${g.white} – ${g.black}, move ${Math.floor(m.ply / 2) + 1}: you played ${m.san}`,
      },
      gameId: g.id,
      due: Date.now(),
      box: 0,
      tags: m.tags,
      attempts: 0,
      solved: 0,
    }));
}

export async function analyseGameRecord(g: GameRecord, onProgress?: (p: number) => void): Promise<GameRecord | null> {
  const parsed = parsePgn(g.pgn);
  if (!parsed) return null;
  const tc = g.timeControl?.match(/^(\d+)/);
  const analysis = await analyseMoves(getBackgroundEngine(), parsed.startFen, parsed.moves, {
    depth: getCore().settings.analysisDepth,
    bookPlies: bookPositions(),
    clocks: parsed.clocks,
    initialClock: tc ? parseInt(tc[1], 10) : null,
    onProgress: (d, t) => onProgress?.(d / t),
  });
  const updated = { ...g, analysis };
  upsertGame(updated);
  addMistakeCards(mistakesToCards(updated, analysis));
  return updated;
}

async function run() {
  if (status.running) return;
  setStatus({ running: true });
  while (queue.length) {
    const id = queue.shift()!;
    const g = getGames().find((x) => x.id === id);
    if (!g || g.analysis) continue;
    setStatus({ currentId: id, progress: 0 });
    try {
      await analyseGameRecord(g, (p) => setStatus({ progress: p }));
    } catch (e) {
      console.warn('analysis failed', id, e);
    }
  }
  setStatus({ running: false, currentId: null, progress: 0 });
}
