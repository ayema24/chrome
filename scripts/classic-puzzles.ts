// Hand-built positions illustrating classic tactical patterns. The generator
// verifies each one with Stockfish and computes the full solution line.
export interface ClassicDef {
  title: string;
  fen: string;
  first: string;
  themes?: string[];
}

export const CLASSICS: ClassicDef[] = [
  { title: 'Back-rank mate', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', first: 'd1d8', themes: ['backRankMate'] },
  { title: 'Smothered mate', fen: '6rk/6pp/8/6N1/8/8/6PP/6K1 w - - 0 1', first: 'g5f7', themes: ['smotheredMate'] },
  { title: "Philidor's legacy", fen: '4r2k/pp4pp/8/6N1/2Q5/8/PP4PP/6K1 w - - 0 1', first: 'g5f7', themes: ['smotheredMate'] },
  { title: 'Arabian mate', fen: '7k/1R6/5N2/8/8/8/6PP/6K1 w - - 0 1', first: 'b7h7', themes: ['arabianMate'] },
  { title: "Boden's mate", fen: '2kr4/p2n4/8/8/5B2/8/4BPPP/6K1 w - - 0 1', first: 'e2a6', themes: ['bodenMate'] },
  { title: 'Royal fork', fen: '3q3k/6pp/8/4N3/8/8/6PP/6K1 w - - 0 1', first: 'e5f7', themes: ['fork'] },
  { title: 'Skewer', fen: '7r/6k1/8/8/8/4B3/6PP/6K1 w - - 0 1', first: 'e3d4', themes: ['skewer'] },
  { title: 'Discovered attack', fen: '3q2k1/1r3ppp/8/8/8/3B4/5PPP/3Q2K1 w - - 0 1', first: 'd3h7', themes: ['discoveredAttack'] },
  { title: 'Greek gift', fen: 'rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 7', first: 'd3h7', themes: ['sacrifice', 'kingsideAttack'] },
  { title: 'Anastasia’s mate', fen: '5r1k/4Nppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', first: 'd1d8', themes: ['backRankMate'] },
  { title: 'Knight fork of king and rook', fen: 'r3k3/8/8/1N6/8/8/6PP/6K1 w - - 0 1', first: 'b5c7', themes: ['fork'] },
  { title: 'Promotion race', fen: '8/1P6/8/8/8/6k1/r7/4K3 w - - 0 1', first: 'b7b8q', themes: ['promotion'] },
];
