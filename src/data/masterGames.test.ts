import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { MASTER_GAMES } from './masterGames';

describe('master games', () => {
  for (const g of MASTER_GAMES) {
    it(`${g.id} is legal`, () => {
      const c = new Chess();
      for (const t of g.moves.split(/\s+/)) {
        if (/^\d+\.+$/.test(t)) continue;
        c.move(t);
      }
      if (g.moves.endsWith('#')) expect(c.isCheckmate()).toBe(true);
    });
  }
});
