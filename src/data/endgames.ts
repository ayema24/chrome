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
  level: 'beginner' | 'intermediate' | 'advanced';
  tip: string;
}

export const ENDGAMES: EndgameDrill[] = [
  {
    id: 'kq-k',
    title: 'Queen mate',
    fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1',
    goal: 'win',
    level: 'beginner',
    tip: 'Use the queen a knight’s move away from the king to box it in, then bring your king. Beware of stalemate!',
  },
  {
    id: 'kr-k',
    title: 'Rook mate',
    fen: '8/8/8/4k3/8/8/8/4K2R w - - 0 1',
    goal: 'win',
    level: 'beginner',
    tip: 'Cut the king off with the rook, walk your king up into opposition, then check on the edge. Shrink the box.',
  },
  {
    id: 'kbb-k',
    title: 'Two bishops mate',
    fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1',
    goal: 'win',
    level: 'intermediate',
    tip: 'Bishops side by side form a wall. Push the king to a corner and keep your king close.',
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
];
