import { describe, it, expect } from 'vitest';
import { OPENINGS } from '../data/openings';
import { parseLine, getBook, nameOpening, allLines } from './openings';

describe('opening curriculum', () => {
  for (const o of OPENINGS) {
    for (let i = 0; i < o.lines.length; i++) {
      it(`${o.id} / ${o.lines[i].name} is legal`, () => {
        const l = parseLine(o, i);
        expect(l.sans.length).toBeGreaterThan(4);
      });
    }
  }
  it('builds a book and names openings', () => {
    expect(getBook().size).toBeGreaterThan(50);
    const l = allLines().find((x) => x.openingId === 'najdorf')!;
    expect(nameOpening(l.fens.slice(1))).toMatch(/Najdorf/);
  });
});
