// Endgame drills: play the position out against full-strength Stockfish.
// Goals are verified by src/data/endgames.test.ts.
export interface EndgameDrill {
  id: string;
  title: string;
  fen: string;
  goal: 'win' | 'draw';
  /** Win = checkmate (or promotion if `promote`); draw = survive `moves` moves or reach a draw. */
  promote?: boolean;
  moves?: number;
  /** Theoretical win the engine underrates without tablebases. */
  knownWin?: boolean;
  level: 'beginner' | 'intermediate' | 'advanced';
  tip: string;
  /** Step-by-step technique shown in the drill. */
  steps?: string[];
}

export const ENDGAMES: EndgameDrill[] = [
  {
    id: 'kq-k',
    title: 'Queen mate',
    fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1',
    goal: 'win',
    level: 'beginner',
    tip: 'Use the queen a knight’s move away from the king to box it in, then bring your king. Beware of stalemate!',
    steps: [
      'Box it in: put your queen a knight’s jump away from the enemy king. The king is now trapped in a rectangle.',
      'Shadow it: every time the king moves, move the queen so it is a knight’s jump away again. The box shrinks each time until the king is on the edge.',
      'Stop squeezing: once the king is shuttling between two edge squares, leave the queen where it is and walk your own king up.',
      'Stalemate check: with the king in a corner (say h8), a queen on g6 or f7 is stalemate. Before every quiet move, make sure the king still has a legal square.',
      'Mate: with the kings facing each other (e8 and e6), check along the edge (Qb8#) or put the queen right next to the king, protected by yours (Qe7#).',
    ],
  },
  {
    id: 'kr-k',
    title: 'Rook mate',
    fen: '8/8/8/4k3/8/8/8/4K2R w - - 0 1',
    goal: 'win',
    level: 'beginner',
    tip: 'Cut the king off with the rook, walk your king up into opposition, then check on the edge. Shrink the box.',
    steps: [
      'Cut it off: put the rook on a rank or file next to the enemy king to fence it into one part of the board.',
      'Bring your king: walk your king towards the enemy king, staying on the same side of the fence.',
      'Kings face each other (opposition, one square between them)? Give a rook check from the side. The king must step back one row.',
      'Can the fence move one row closer safely? Then shrink the box.',
      'Neither? Make a waiting move with the rook along the same line, far from the enemy king. This forces it into opposition or away.',
      'Rook attacked? Slide it to the far side of the board on the same line. Never give up the fence.',
      'Mate: kings facing (e8 and e6), rook checks on the back rank: Ra8#. In the corner: enemy king h8, yours g6, Ra8#.',
    ],
  },
  {
    id: 'krr-k',
    title: 'Two rooks “ladder” mate',
    fen: '8/8/8/4k3/8/8/8/R3K2R w - - 0 1',
    goal: 'win',
    level: 'beginner',
    tip: 'The rooks take turns: one guards a row, the other checks on the next row, climbing like a ladder to the edge. Your king isn’t needed.',
    steps: [
      'One rook guards a row, the other gives check on the next row. The king must step back.',
      'Swap roles: the rook that was guarding now checks one row further. Keep climbing towards the edge.',
      'King comes next to a rook? Move that rook to the far side of the board on the same row, then keep laddering.',
      'Mate: the last check on the edge row, with the other rook guarding the row before it. The same method works with queen + rook.',
    ],
  },
  {
    id: 'kbb-k',
    title: 'Two bishops mate',
    fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1',
    goal: 'win',
    level: 'intermediate',
    tip: 'Bishops side by side form a wall. Push the king to a corner and keep your king close.',
    steps: [
      'Build a wall: place the bishops side by side (e.g. d4 and e4) so their diagonals form a barrier the king can’t cross.',
      'Bring your king to help: the bishops can’t push the king back alone.',
      'Push to the edge, then a corner: step the bishops forward one at a time to take away squares, keeping them out of reach of the enemy king.',
      'Watch for stalemate once the king is in the corner. Leave it a move until you can give the final check.',
      'Mate: it only happens in a corner, with one bishop checking and the other covering the escape diagonal.',
    ],
  },
  {
    id: 'kp-k-front',
    title: 'King in front of the pawn',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    goal: 'win',
    promote: true,
    level: 'beginner',
    tip: 'King on the 6th rank in front of its pawn always wins. Use the opposition.',
  },
  {
    id: 'kp-k-defend',
    title: 'Defend king vs king & pawn',
    fen: '8/8/8/3k4/8/3KP3/8/8 b - - 0 1',
    goal: 'draw',
    moves: 30,
    level: 'beginner',
    tip: 'Stay in front of the pawn and take the opposition when the enemy king advances.',
  },
  {
    id: 'square',
    title: 'Rule of the square',
    fen: '7k/8/8/p7/5K2/8/8/8 w - - 0 1',
    goal: 'draw',
    moves: 20,
    level: 'beginner',
    tip: 'Draw a square from the pawn to its promotion rank – if your king can step into it, you catch the pawn.',
  },
  {
    id: 'lucena',
    title: 'Lucena position',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    goal: 'win',
    promote: true,
    level: 'intermediate',
    tip: '“Build a bridge”: check the king away, bring your rook to the 4th rank, then walk out with your king and block checks with the rook.',
  },
  {
    id: 'philidor',
    title: 'Philidor defence',
    fen: '4k3/7R/r7/3KP3/8/8/8/8 b - - 0 1',
    goal: 'draw',
    moves: 30,
    level: 'intermediate',
    tip: 'Keep your rook on the 6th rank until the pawn advances to it – then give checks from behind.',
  },
  {
    id: 'kq-kp',
    title: 'Queen vs pawn on the 7th',
    fen: '8/8/8/8/2Q5/1K6/4p3/5k2 w - - 0 1',
    goal: 'win',
    level: 'advanced',
    tip: 'Force the king in front of its pawn with checks/pins, then use the tempo to bring your king closer.',
  },
  {
    id: 'rook-cutoff',
    title: 'Rook & pawn vs rook: king cut off',
    fen: '8/8/8/5k2/8/2P5/2K5/4R2r w - - 0 1',
    goal: 'win',
    promote: true,
    level: 'intermediate',
    tip: 'Your rook keeps the enemy king cut off on the e-file. Walk your king up in front of the pawn, use the rook to block checks, then push.',
  },
  {
    id: 'outside-passer',
    title: 'Outside passed pawn',
    fen: '8/5pk1/8/8/1P6/8/5K2/8 w - - 0 1',
    goal: 'win',
    promote: true,
    level: 'intermediate',
    tip: 'Push the b-pawn: the enemy king must run over to stop it. Meanwhile your king eats the f-pawn and returns – a classic pawn-endgame win.',
  },
  {
    id: 'opp-bishops',
    title: 'Opposite-coloured bishops: hold the draw',
    fen: '8/4k3/8/3PK3/8/8/1B6/4b3 b - - 0 1',
    goal: 'draw',
    moves: 30,
    level: 'intermediate',
    tip: 'A pawn up is often not enough with opposite-coloured bishops. Blockade the pawn with your king on the light squares and keep your bishop on its diagonal.',
  },
  {
    id: 'kbn-k',
    title: 'Bishop & knight mate',
    fen: '8/8/8/4k3/8/8/8/2B1KN2 w - - 0 1',
    goal: 'win',
    knownWin: true,
    level: 'advanced',
    tip: 'Drive the king to the edge, then to a corner of your bishop’s colour. The “W manoeuvre” with the knight stops it escaping. Hard – but a great technique test.',
    steps: [
      'Centralise everything and drive the king to the edge, using king, bishop and knight together.',
      'Know your corner: mate is only possible in a corner the same colour as your bishop. Your c1 bishop is dark-squared, so aim for a1 or h8.',
      'If the king runs to the wrong corner, chase it along the edge with the “W manoeuvre”: the knight hops along in a W shape while the bishop covers the escape squares.',
      'Finish: bishop and knight cover the last squares, your king guards the rest. It can take 30+ moves, so mind the 50-move rule.',
    ],
  },
];
