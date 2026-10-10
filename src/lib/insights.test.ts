import { describe, it, expect } from 'vitest';
import { computeWeaknesses, dailyPlan, gameStats, comparePeriods, DAY } from './insights';
import type { CoreData, GameRecord, PuzzleAttempt } from './store';
import { DEFAULT_SETTINGS } from './store';
import type { GameAnalysis, MoveAnalysis } from './analysis';

function core(attempts: PuzzleAttempt[] = []): CoreData {
  return {
    version: 1,
    createdAt: Date.now() - 20 * DAY,
    planStart: Date.now() - 10 * DAY,
    settings: { ...DEFAULT_SETTINGS },
    puzzleRating: 1300,
    puzzleAttempts: attempts,
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

function fakeGame(i: number, blunders: number): GameRecord {
  const moves: MoveAnalysis[] = [];
  for (let p = 0; p < 40; p++) {
    const isBlunder = p % 2 === 0 && p / 2 < blunders;
    moves.push({
      ply: p,
      san: 'x',
      uci: 'e2e4',
      color: p % 2 === 0 ? 'w' : 'b',
      fenBefore: '',
      fenAfter: '',
      best: null,
      bestSan: null,
      bestLine: '',
      evalBefore: { cp: 0 },
      evalAfter: { cp: 0 },
      winBefore: 50,
      winAfter: 50,
      drop: isBlunder ? 40 : 0,
      accuracy: isBlunder ? 10 : 95,
      cls: isBlunder ? 'blunder' : 'best',
      tags: isBlunder ? ['hung-material'] : [],
      phase: p < 20 ? 'opening' : 'middlegame',
      clock: null,
      explanation: '',
    });
  }
  const analysis: GameAnalysis = {
    depth: 10,
    moves,
    evals: moves.map(() => ({ cp: 0 })),
    accuracy: { w: 80, b: 90 },
    counts: { w: { inaccuracy: 0, mistake: 0, blunder: blunders }, b: { inaccuracy: 0, mistake: 0, blunder: 0 } },
    analysedAt: Date.now(),
  };
  return { id: `g${i}`, source: 'lichess', pgn: '', white: 'me', black: 'opp', userColor: 'w', result: '0-1', date: Date.now() - i * DAY, opening: 'Italian Game', analysis };
}

describe('insights', () => {
  it('flags hanging material and losing openings from real games', () => {
    const games = [0, 1, 2, 3].map((i) => fakeGame(i, 2));
    const w = computeWeaknesses(core(), games);
    const ids = w.map((x) => x.id);
    expect(ids).toContain('tag-hung-material');
    expect(ids).toContain('blunders');
    expect(ids).toContain('opening-Italian Game');
    expect(gameStats(games).blundersPerGame).toBe(2);
  });

  it('flags weak puzzle themes and builds a plan targeting them', () => {
    const att: PuzzleAttempt[] = [];
    for (let i = 0; i < 20; i++) att.push({ t: Date.now() - i * 1000, id: `p${i}`, success: true, puzzleRating: 1200, themes: ['mateIn2'], ms: 20000, ratingAfter: 1300, source: 'generated' });
    for (let i = 0; i < 8; i++) att.push({ t: Date.now() - i * 1000, id: `f${i}`, success: i === 0, puzzleRating: 1200, themes: ['fork'], ms: 20000, ratingAfter: 1300, source: 'generated' });
    const c = core(att);
    const w = computeWeaknesses(c, []);
    expect(w[0].id).toBe('theme-fork');
    const plan = dailyPlan(c, [], w);
    expect(plan.find((t) => t.id === 'targeted')?.action.params?.theme).toBe('fork');
  });

  it('compares periods', () => {
    const [a, b] = comparePeriods(core(), [fakeGame(10, 3), fakeGame(1, 1)], 7);
    expect(a.blunders).toBe(3);
    expect(b.blunders).toBe(1);
  });
});
