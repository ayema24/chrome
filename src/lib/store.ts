// App state persisted to IndexedDB. Small "core" data and the (larger) game
// list are stored under separate keys. React components subscribe with
// useCore()/useGames().
import { get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import type { GameAnalysis } from './analysis';
import type { Puzzle } from './puzzleTypes';

export interface Settings {
  level: number;
  adaptive: boolean;
  coach: boolean;
  boardTheme: 'brown' | 'blue' | 'green' | 'gray';
  showCoords: boolean;
  analysisDepth: number;
  lichessToken: string;
  lichessUser: string;
  chesscomUser: string;
  sound: boolean;
  volume: number; // 0..100
  animations: boolean;
  autoAnalyse: boolean;
}

export interface PuzzleAttempt {
  t: number;
  id: string;
  success: boolean;
  puzzleRating: number;
  themes: string[];
  ms: number;
  ratingAfter: number;
  source: string;
}

export interface PlayResult {
  t: number;
  level: number;
  levelElo: number;
  score: 0 | 0.5 | 1;
  gameId: string;
  ratingAfter: number;
}

export interface LineCard {
  key: string; // `${openingId}#${lineIndex}#${color}`
  due: number;
  box: number; // Leitner box 0..6
  reps: number;
  lapses: number;
  /** ply index -> times missed */
  misses: Record<number, number>;
  lastPracticed: number;
}

export interface DrillResult {
  t: number;
  key: string;
  mistakes: number;
  moves: number;
}

export interface MistakeCard {
  puzzle: Puzzle;
  gameId: string;
  due: number;
  box: number;
  tags: string[];
  attempts: number;
  solved: number;
}

export interface EndgameResult {
  t: number;
  id: string;
  success: boolean;
}

export interface Repertoire {
  white: string | null;
  vsE4: string | null;
  vsD4: string | null;
}

export interface CoreData {
  version: 1;
  createdAt: number;
  planStart: number;
  settings: Settings;
  puzzleRating: number;
  puzzleAttempts: PuzzleAttempt[];
  playRating: number;
  playResults: PlayResult[];
  lineCards: Record<string, LineCard>;
  drillResults: DrillResult[];
  mistakeDeck: MistakeCard[];
  endgameResults: EndgameResult[];
  repertoire: Repertoire;
  lessonsViewed: Record<string, number>;
}

export interface GameRecord {
  id: string;
  source: 'play' | 'lichess' | 'chesscom' | 'pgn';
  pgn: string;
  white: string;
  black: string;
  userColor: 'w' | 'b' | null;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  date: number;
  opening: string | null;
  timeControl?: string;
  url?: string;
  engineLevel?: number;
  analysis?: GameAnalysis;
}

export const DEFAULT_SETTINGS: Settings = {
  level: 4,
  adaptive: true,
  coach: true,
  boardTheme: 'brown',
  showCoords: true,
  analysisDepth: 14,
  lichessToken: '',
  lichessUser: '',
  chesscomUser: '',
  sound: true,
  volume: 70,
  animations: true,
  autoAnalyse: true,
};

function freshCore(): CoreData {
  const now = Date.now();
  return {
    version: 1,
    createdAt: now,
    planStart: now,
    settings: { ...DEFAULT_SETTINGS },
    puzzleRating: 1200,
    puzzleAttempts: [],
    playRating: 1000,
    playResults: [],
    lineCards: {},
    drillResults: [],
    mistakeDeck: [],
    endgameResults: [],
    repertoire: { white: null, vsE4: null, vsD4: null },
    lessonsViewed: {},
  };
}

let core: CoreData = freshCore();
let games: GameRecord[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const CORE_KEY = 'chess-coach:core';
const GAMES_KEY = 'chess-coach:games';

let coreTimer: ReturnType<typeof setTimeout> | null = null;
let gamesTimer: ReturnType<typeof setTimeout> | null = null;

function persistCore() {
  if (coreTimer) clearTimeout(coreTimer);
  coreTimer = setTimeout(() => void set(CORE_KEY, core).catch(console.error), 300);
}
function persistGames() {
  if (gamesTimer) clearTimeout(gamesTimer);
  gamesTimer = setTimeout(() => void set(GAMES_KEY, games).catch(console.error), 500);
}

export async function loadStore(): Promise<void> {
  try {
    const [c, g] = await Promise.all([get<CoreData>(CORE_KEY), get<GameRecord[]>(GAMES_KEY)]);
    if (c) core = { ...freshCore(), ...c, settings: { ...DEFAULT_SETTINGS, ...c.settings } };
    if (g) games = g;
  } catch (e) {
    console.warn('Could not load saved data', e);
  }
  loaded = true;
  emit();
}

export function isLoaded() {
  return loaded;
}

export function getCore(): CoreData {
  return core;
}
export function getGames(): GameRecord[] {
  return games;
}

export function updateCore(fn: (c: CoreData) => CoreData | void) {
  const draft = structuredClone(core);
  const res = fn(draft);
  core = res ?? draft;
  persistCore();
  emit();
}

export function updateSettings(patch: Partial<Settings>) {
  updateCore((c) => {
    c.settings = { ...c.settings, ...patch };
  });
}

export function upsertGame(g: GameRecord) {
  const i = games.findIndex((x) => x.id === g.id);
  games = i >= 0 ? games.map((x, j) => (j === i ? g : x)) : [g, ...games];
  games.sort((a, b) => b.date - a.date);
  persistGames();
  emit();
}

export function upsertGames(list: GameRecord[]) {
  const map = new Map(games.map((g) => [g.id, g]));
  for (const g of list) {
    const old = map.get(g.id);
    map.set(g.id, old?.analysis && !g.analysis ? { ...g, analysis: old.analysis } : g);
  }
  games = [...map.values()].sort((a, b) => b.date - a.date);
  persistGames();
  emit();
}

export function deleteGame(id: string) {
  games = games.filter((g) => g.id !== id);
  persistGames();
  emit();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCore(): CoreData {
  return useSyncExternalStore(subscribe, getCore);
}
export function useGames(): GameRecord[] {
  return useSyncExternalStore(subscribe, getGames);
}

export function exportData(): string {
  return JSON.stringify({ app: 'chess-coach', exportedAt: Date.now(), core, games });
}

export function importData(json: string) {
  const data = JSON.parse(json);
  if (data.app !== 'chess-coach' || !data.core) throw new Error('Not a Chess Coach backup file');
  core = { ...freshCore(), ...data.core, settings: { ...DEFAULT_SETTINGS, ...data.core.settings } };
  games = data.games ?? [];
  persistCore();
  persistGames();
  emit();
}

export function resetAll() {
  core = freshCore();
  games = [];
  persistCore();
  persistGames();
  emit();
}

// ---------------------------------------------------------------- ratings

export function expectedScore(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export function puzzleK(attempts: number) {
  // Converge quickly at first, then stabilise.
  if (attempts < 10) return 60;
  if (attempts < 30) return 40;
  if (attempts < 100) return 24;
  return 16;
}

export function recordPuzzle(p: Puzzle, success: boolean, ms: number) {
  updateCore((c) => {
    const k = puzzleK(c.puzzleAttempts.length);
    const exp = expectedScore(c.puzzleRating, p.rating);
    c.puzzleRating = Math.round(Math.max(400, c.puzzleRating + k * ((success ? 1 : 0) - exp)));
    c.puzzleAttempts.push({
      t: Date.now(),
      id: p.id,
      success,
      puzzleRating: p.rating,
      themes: p.themes,
      ms,
      ratingAfter: c.puzzleRating,
      source: p.source,
    });
  });
}

export function recordPlay(level: number, levelElo: number, score: 0 | 0.5 | 1, gameId: string) {
  updateCore((c) => {
    const k = c.playResults.length < 10 ? 48 : 32;
    const exp = expectedScore(c.playRating, levelElo);
    c.playRating = Math.round(Math.max(100, c.playRating + k * (score - exp)));
    c.playResults.push({ t: Date.now(), level, levelElo, score, gameId, ratingAfter: c.playRating });
    // Adaptive difficulty: step up after a win, down after two losses in a row.
    if (c.settings.adaptive) {
      const last = c.playResults.slice(-2);
      if (score === 1) c.settings.level = Math.min(12, level + 1);
      else if (last.length === 2 && last.every((r) => r.score === 0)) c.settings.level = Math.max(1, level - 1);
    }
  });
}

const BOX_DAYS = [0, 1, 3, 7, 14, 30, 60];
const DAY = 86400000;

export function recordLineDrill(key: string, mistakePlies: number[], moves: number) {
  updateCore((c) => {
    const card = c.lineCards[key] ?? { key, due: 0, box: 0, reps: 0, lapses: 0, misses: {}, lastPracticed: 0 };
    card.reps++;
    card.lastPracticed = Date.now();
    const now = Date.now();
    if (mistakePlies.length === 0) {
      // Learning (first two perfect runs) can happen in one sitting; after that a
      // line only climbs when it is reviewed on schedule, so "mastered" means
      // it survived a spaced review rather than a burst of repetitions.
      if (card.box < 2 || card.due <= now) {
        card.box = Math.min(BOX_DAYS.length - 1, card.box + 1);
        card.due = now + BOX_DAYS[card.box] * DAY;
      }
    } else {
      card.box = Math.max(0, card.box - 2);
      card.lapses++;
      for (const p of mistakePlies) card.misses[p] = (card.misses[p] ?? 0) + 1;
      card.due = now + BOX_DAYS[card.box] * DAY;
    }
    c.lineCards[key] = card;
    c.drillResults.push({ t: Date.now(), key, mistakes: mistakePlies.length, moves });
  });
}

export function reviewMistake(puzzleId: string, success: boolean) {
  updateCore((c) => {
    const card = c.mistakeDeck.find((m) => m.puzzle.id === puzzleId);
    if (!card) return;
    card.attempts++;
    if (success) {
      card.solved++;
      card.box = Math.min(BOX_DAYS.length - 1, card.box + 1);
    } else card.box = 0;
    card.due = Date.now() + Math.max(BOX_DAYS[card.box], success ? 1 : 0) * DAY;
  });
}

export function addMistakeCards(cards: MistakeCard[]) {
  updateCore((c) => {
    const ids = new Set(c.mistakeDeck.map((m) => m.puzzle.id));
    for (const card of cards) if (!ids.has(card.puzzle.id)) c.mistakeDeck.push(card);
  });
}

export function recordEndgame(id: string, success: boolean) {
  updateCore((c) => {
    c.endgameResults.push({ t: Date.now(), id, success });
  });
}

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
