import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mergeData } from './sync';
import { DEFAULT_SETTINGS, type CoreData, type GameRecord, type PuzzleAttempt } from './store';

function core(p: Partial<CoreData> = {}): CoreData {
  return {
    version: 1,
    createdAt: 1000,
    planStart: 1000,
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
    ...p,
  };
}
const att = (t: number, id: string, ratingAfter: number): PuzzleAttempt => ({ t, id, success: true, puzzleRating: 1200, themes: [], ms: 1, ratingAfter, source: 'generated' });
const game = (id: string, analysedAt?: number): GameRecord => ({
  id, source: 'play', pgn: '', white: 'a', black: 'b', userColor: 'w', result: '1-0', date: 1,
  opening: null, analysis: analysedAt ? ({ analysedAt } as GameRecord['analysis']) : undefined,
});

describe('sync merge', () => {
  it('keeps training from both devices and takes the latest rating', () => {
    const phone = core({ puzzleAttempts: [att(10, 'a', 1210), att(30, 'c', 1230)], updatedAt: 30 });
    const laptop = core({ puzzleAttempts: [att(10, 'a', 1210), att(20, 'b', 1220)], updatedAt: 20, repertoire: { white: 'italian', vsE4: null, vsD4: null } });
    const m = mergeData({ core: phone, games: [] }, { core: laptop, games: [] });
    expect(m.core.puzzleAttempts.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(m.core.puzzleRating).toBe(1230);
    // scalar fields come from the most recently edited device
    expect(m.core.repertoire.white).toBe(null);
  });

  it('keeps the most recently practised opening card and personal bests', () => {
    const a = core({ lineCards: { k: { key: 'k', due: 0, box: 3, reps: 5, lapses: 0, misses: {}, lastPracticed: 50 } }, rushBest: { '3min': 12 } });
    const b = core({ lineCards: { k: { key: 'k', due: 0, box: 1, reps: 2, lapses: 1, misses: {}, lastPracticed: 40 } }, rushBest: { '3min': 15, survival: 4 } });
    const m = mergeData({ core: a, games: [] }, { core: b, games: [] });
    expect(m.core.lineCards.k.box).toBe(3);
    expect(m.core.rushBest).toEqual({ '3min': 15, survival: 4 });
  });

  it('unions games, prefers analysed copies and respects deletions', () => {
    const m = mergeData(
      { core: core({ deletedGames: ['x'] }), games: [game('g1'), game('g2', 5)] },
      { core: core(), games: [game('g1', 9), game('x'), game('g3')] },
    );
    expect(m.games.map((g) => g.id).sort()).toEqual(['g1', 'g2', 'g3']);
    expect(m.games.find((g) => g.id === 'g1')!.analysis?.analysedAt).toBe(9);
  });

  it('never takes another device’s Lichess token', () => {
    const local = core({ settings: { ...DEFAULT_SETTINGS, lichessToken: 'mine' }, updatedAt: 1 });
    const remote = core({ settings: { ...DEFAULT_SETTINGS, lichessToken: '', boardTheme: 'green' }, updatedAt: 2 });
    const m = mergeData({ core: local, games: [] }, { core: remote, games: [] });
    expect(m.core.settings.lichessToken).toBe('mine');
    expect(m.core.settings.boardTheme).toBe('green');
  });
});

describe('sync against a mocked GitHub', () => {
  const ls = new Map<string, string>();
  beforeEach(() => {
    ls.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => void ls.set(k, v),
      removeItem: (k: string) => void ls.delete(k),
    });
  });

  it('creates the gist, uploads compressed data without tokens, and reads it back', async () => {
    let stored: string | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/gists?per_page')) return new Response('[]', { status: 200 });
      if (init?.method === 'POST' || init?.method === 'PATCH') {
        stored = JSON.parse(String(init.body)).files['chess-coach-sync.b64'].content;
        return new Response(JSON.stringify({ id: 'gist123' }), { status: 200 });
      }
      if (u.endsWith('/gists/gist123')) return new Response(JSON.stringify({ files: { 'chess-coach-sync.b64': { content: stored, raw_url: '' } } }), { status: 200 });
      return new Response('nope', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const store = await import('./store');
    store.updateSettings({ lichessToken: 'secret-lichess' });
    store.updateCore((c) => {
      c.puzzleRating = 1444;
    });
    const sync = await import('./sync');
    await sync.connectSync('ghp_test');
    expect(ls.get('cc-sync-gist')).toBe('gist123');
    expect(stored).toBeTruthy();
    // decode what was uploaded
    const bytes = Uint8Array.from(atob(stored!), (c) => c.charCodeAt(0));
    const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    expect(text).toContain('1444');
    expect(text).not.toContain('secret-lichess');
    expect(text).not.toContain('ghp_test');
    // second sync reads the gist and merges cleanly
    await sync.syncNow();
    expect(sync.useSync).toBeTypeOf('function');
    expect(store.getCore().puzzleRating).toBe(1444);
  });
});
