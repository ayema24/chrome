import { describe, it, expect } from 'vitest';
import { convertLichessPuzzle, pgnToRecord, importPgnText } from './db';

describe('lichess puzzle conversion', () => {
  it('replays the game and checks the first solution move', () => {
    const p = convertLichessPuzzle({
      game: { id: 'abcd1234', pgn: 'e4 e5 Bc4 Nc6 Qh5 Nf6' },
      puzzle: { id: 'X1', rating: 900, solution: ['h5f7'], themes: ['mateIn1', 'short'], initialPly: 5 },
    })!;
    expect(p.fen.split(' ')[1]).toBe('w');
    expect(p.setupMove).toBe('g8f6');
    expect(p.moves).toEqual(['h5f7']);
    expect(p.themes).toContain('mateIn1');
  });
  it('rejects inconsistent data', () => {
    expect(convertLichessPuzzle({ game: { pgn: 'e4 e5' }, puzzle: { id: 'x', solution: ['a1a8'] } })).toBeNull();
  });
});

describe('PGN import', () => {
  const pgn = `[Event "Rated Blitz game"]
[Site "https://lichess.org/AbCdEfGh"]
[UTCDate "2026.09.01"]
[UTCTime "12:00:00"]
[White "alice"]
[Black "Bob"]
[Result "0-1"]
[TimeControl "180+0"]
[Opening "Scandinavian Defense"]

1. e4 { [%clk 0:03:00] } d5 { [%clk 0:03:00] } 2. exd5 { [%clk 0:02:58] } Qxd5 { [%clk 0:02:57] } 0-1`;
  it('detects the user, result, opening and id', () => {
    const r = pgnToRecord(pgn, 'lichess', 'bob')!;
    expect(r.userColor).toBe('b');
    expect(r.result).toBe('0-1');
    expect(r.id).toBe('li-AbCdEfGh');
    expect(r.opening).toBe('Scandinavian Defense');
    expect(new Date(r.date).getUTCFullYear()).toBe(2026);
  });
  it('splits multi-game files', () => {
    expect(importPgnText(`${pgn}\n\n${pgn.replace('AbCdEfGh', 'ZzZzZzZz')}`, 'alice')).toHaveLength(2);
  });
});
