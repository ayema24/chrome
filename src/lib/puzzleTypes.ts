export type PuzzleSource = 'classic' | 'generated' | 'lichess' | 'mistake';

export interface Puzzle {
  id: string;
  /** Position where the solver is to move. */
  fen: string;
  /** Solution in UCI, starting with the solver's move, alternating with replies. */
  moves: string[];
  rating: number;
  themes: string[];
  source: PuzzleSource;
  title?: string;
  /** Opponent move that led to the puzzle position (for animation), if known. */
  setupMove?: string;
  fenBeforeSetup?: string;
  gameUrl?: string;
}
