// Difficulty levels for the sparring engine. Ratings are rough estimates of
// the equivalent online (Lichess blitz/rapid) strength.
export interface Level {
  id: number;
  name: string;
  elo: number;
  skill: number; // Stockfish Skill Level 0..20
  depth?: number;
  movetime?: number;
  /** Chance of playing a random legal move (makes the lowest levels human-beatable). */
  randomness: number;
}

export const LEVELS: Level[] = [
  { id: 1, name: 'Beginner', elo: 400, skill: 0, depth: 1, randomness: 0.4 },
  { id: 2, name: 'Novice', elo: 600, skill: 0, depth: 1, randomness: 0.22 },
  { id: 3, name: 'Casual', elo: 800, skill: 1, depth: 2, randomness: 0.12 },
  { id: 4, name: 'Improver', elo: 1000, skill: 3, depth: 3, randomness: 0.06 },
  { id: 5, name: 'Club', elo: 1200, skill: 5, depth: 5, randomness: 0.03 },
  { id: 6, name: 'Strong club', elo: 1400, skill: 7, depth: 7, randomness: 0.01 },
  { id: 7, name: 'Advanced', elo: 1600, skill: 10, depth: 9, randomness: 0 },
  { id: 8, name: 'Expert', elo: 1800, skill: 13, depth: 11, randomness: 0 },
  { id: 9, name: 'Candidate Master', elo: 2000, skill: 16, depth: 13, randomness: 0 },
  { id: 10, name: 'Master', elo: 2200, skill: 18, depth: 15, randomness: 0 },
  { id: 11, name: 'Grandmaster', elo: 2500, skill: 20, movetime: 1000, randomness: 0 },
  { id: 12, name: 'Stockfish (max)', elo: 3200, skill: 20, movetime: 3000, randomness: 0 },
];

export function levelById(id: number): Level {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[3];
}

/** Suggests the level whose rating is closest to the player's. */
export function suggestLevel(playRating: number): Level {
  return LEVELS.reduce((best, l) => (Math.abs(l.elo - playRating) < Math.abs(best.elo - playRating) ? l : best));
}
