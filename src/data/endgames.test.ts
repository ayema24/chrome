import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { ENDGAMES } from './endgames';
import { createNodeEngine } from '../../scripts/node-engine';
import { lineToEval } from '../lib/analysis';

describe('endgame drills', () => {
  it('positions are legal and goals match the engine', async () => {
    const e = await createNodeEngine();
    for (const d of ENDGAMES) {
      new Chess(d.fen); // throws if invalid
      const r = await e.search(d.fen, { depth: 22 });
      const ev = lineToEval(r.lines[0], d.fen);
      const side = d.fen.split(' ')[1];
      const forUser = side === 'w' ? ev : { cp: ev.cp !== undefined ? -ev.cp : undefined, mate: ev.mate !== undefined ? -ev.mate : undefined };
      if (d.goal === 'win') expect(forUser.mate !== undefined ? forUser.mate > 0 : (forUser.cp ?? 0) > (d.knownWin ? 100 : 250), `${d.id} ${JSON.stringify(forUser)}`).toBe(true);
      else expect(forUser.mate === undefined && Math.abs(forUser.cp ?? 0) < 150, `${d.id} ${JSON.stringify(forUser)}`).toBe(true);
    }
  }, 300000);
});
