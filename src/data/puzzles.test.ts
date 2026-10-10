import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { LOCAL_PUZZLES } from '../lib/puzzles';

describe('offline puzzle set', () => {
  it('has unique ids and legal solutions', () => {
    expect(LOCAL_PUZZLES.length).toBeGreaterThan(200);
    expect(new Set(LOCAL_PUZZLES.map((p) => p.id)).size).toBe(LOCAL_PUZZLES.length);
    for (const p of LOCAL_PUZZLES) {
      const c = new Chess(p.fen);
      for (const m of p.moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      // Every puzzle ends on the solver's move
      expect(p.moves.length % 2).toBe(1);
      if (p.themes.includes('mate')) expect(c.isCheckmate()).toBe(true);
    }
  });
});
