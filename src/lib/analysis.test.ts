import { describe, it, expect, beforeAll } from 'vitest';
import { Chess } from 'chess.js';
import { analyseMoves, classify, gameAccuracy, moveAccuracy, whiteWin } from './analysis';
import { createNodeEngine } from '../../scripts/node-engine';
import type { Engine } from './engine';
import { detectThemes } from './motifs';

let engine: Engine;
beforeAll(async () => {
  engine = await createNodeEngine();
});

describe('scoring helpers', () => {
  it('maps evals to win chances', () => {
    expect(whiteWin({ cp: 0 })).toBeCloseTo(50);
    expect(whiteWin({ cp: 300 })).toBeGreaterThan(75);
    expect(whiteWin({ mate: 3 })).toBe(100);
    expect(whiteWin({ mate: -1 })).toBe(0);
  });
  it('classifies drops', () => {
    expect(classify(0, true)).toBe('best');
    expect(classify(15, false)).toBe('inaccuracy');
    expect(classify(25, false)).toBe('mistake');
    expect(classify(40, false)).toBe('blunder');
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(gameAccuracy([100, 100, 10])).toBeLessThan(70);
  });
});

describe('game analysis', () => {
  it('finds the blunder in a miniature and tags it', async () => {
    const c = new Chess();
    for (const m of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) c.move(m);
    const a = await analyseMoves(engine, c.history({ verbose: true })[0].before, c.history({ verbose: true }), { depth: 10 });
    const nf6 = a.moves[5];
    expect(nf6.san).toBe('Nf6');
    expect(nf6.cls).toBe('blunder');
    expect(nf6.tags).toContain('allowed-mate');
    expect(a.counts.b.blunder).toBe(1);
    expect(a.accuracy.w).toBeGreaterThan(a.accuracy.b);
  });
});

describe('motif detection', () => {
  it('detects back-rank mate and forks', () => {
    expect(detectThemes('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', ['d1d8'])).toEqual(expect.arrayContaining(['mateIn1', 'backRankMate']));
    expect(detectThemes('3q3k/6pp/8/4N3/8/8/6PP/6K1 w - - 0 1', ['e5f7', 'h8g8', 'f7d8'])).toContain('fork');
    expect(detectThemes('6rk/6pp/8/6N1/8/8/6PP/6K1 w - - 0 1', ['g5f7'])).toContain('smotheredMate');
  });
});
