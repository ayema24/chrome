// Heuristic tactical-theme detection. Uses Lichess theme keys so locally
// generated puzzles and Lichess puzzles share the same vocabulary.
import { Chess, type Square } from 'chess.js';
import { PIECE_VALUE, parseUci, gamePhase, materialBalance, kingSquare, type Color } from './chess';

export const THEME_LABEL: Record<string, string> = {
  mate: 'Checkmate',
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  mateIn4: 'Mate in 4',
  mateIn5: 'Mate in 5+',
  backRankMate: 'Back-rank mate',
  smotheredMate: 'Smothered mate',
  fork: 'Fork',
  pin: 'Pin',
  skewer: 'Skewer',
  discoveredAttack: 'Discovered attack',
  doubleCheck: 'Double check',
  hangingPiece: 'Hanging piece',
  promotion: 'Promotion',
  sacrifice: 'Sacrifice',
  deflection: 'Deflection',
  attraction: 'Attraction',
  trappedPiece: 'Trapped piece',
  advancedPawn: 'Advanced pawn',
  kingsideAttack: 'Kingside attack',
  queensideAttack: 'Queenside attack',
  defensiveMove: 'Defensive move',
  quietMove: 'Quiet move',
  endgame: 'Endgame',
  middlegame: 'Middlegame',
  opening: 'Opening',
  rookEndgame: 'Rook endgame',
  pawnEndgame: 'Pawn endgame',
  crushing: 'Crushing',
  advantage: 'Advantage',
  short: 'Short',
  long: 'Long',
  oneMove: 'One move',
  exposedKing: 'Exposed king',
  capturingDefender: 'Capturing the defender',
  interference: 'Interference',
  intermezzo: 'Intermezzo',
  xRayAttack: 'X-ray attack',
  zugzwang: 'Zugzwang',
  equality: 'Equality',
  clearance: 'Clearance',
  anastasiaMate: "Anastasia's mate",
  arabianMate: 'Arabian mate',
  bodenMate: "Boden's mate",
  hookMate: 'Hook mate',
  doubleBishopMate: 'Double-bishop mate',
  dovetailMate: 'Dovetail mate',
  enPassant: 'En passant',
  castling: 'Castling',
  underPromotion: 'Underpromotion',
  master: 'Master game',
  masterVsMaster: 'Master vs master',
  superGM: 'Super GM game',
  veryLong: 'Very long',
  bishopEndgame: 'Bishop endgame',
  knightEndgame: 'Knight endgame',
  queenEndgame: 'Queen endgame',
  queenRookEndgame: 'Queen & rook endgame',
  attackingF2F7: 'Attacking f2/f7',
};

/** Themes worth training individually (shown in the theme picker). */
export const TRAINABLE_THEMES = [
  'mateIn1',
  'mateIn2',
  'mateIn3',
  'backRankMate',
  'smotheredMate',
  'fork',
  'pin',
  'skewer',
  'discoveredAttack',
  'hangingPiece',
  'sacrifice',
  'deflection',
  'promotion',
  'trappedPiece',
  'quietMove',
  'defensiveMove',
  'endgame',
  'rookEndgame',
  'pawnEndgame',
  'attackingF2F7',
];

export function themeLabel(t: string): string {
  return THEME_LABEL[t] ?? t.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

const DIRS: Record<string, [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

function sq(f: number, r: number): Square | null {
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return (String.fromCharCode(97 + f) + (r + 1)) as Square;
}
function coords(s: string): [number, number] {
  return [s.charCodeAt(0) - 97, parseInt(s[1], 10) - 1];
}

/** Squares a piece on `from` attacks (pseudo-legal, ignores pins). */
export function attackedBy(chess: Chess, from: Square): Square[] {
  const p = chess.get(from);
  if (!p) return [];
  const [f, r] = coords(from);
  const out: Square[] = [];
  const add = (s: Square | null) => s && out.push(s);
  switch (p.type) {
    case 'p': {
      const dir = p.color === 'w' ? 1 : -1;
      add(sq(f - 1, r + dir));
      add(sq(f + 1, r + dir));
      break;
    }
    case 'n':
      for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(sq(f + df, r + dr));
      break;
    case 'k':
      for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) if (df || dr) add(sq(f + df, r + dr));
      break;
    default:
      for (const [df, dr] of DIRS[p.type]) {
        let i = 1;
        for (;;) {
          const s = sq(f + df * i, r + dr * i);
          if (!s) break;
          out.push(s);
          if (chess.get(s)) break;
          i++;
        }
      }
  }
  return out;
}

function isDefended(chess: Chess, s: Square, by: Color): boolean {
  return chess.attackers(s, by).length > 0;
}

function valueOf(chess: Chess, s: Square): number {
  const p = chess.get(s);
  if (!p) return 0;
  return p.type === 'k' ? 100 : PIECE_VALUE[p.type];
}

/** Looks through the first piece hit by a slider to find what is behind it. */
function rayPairs(chess: Chess, from: Square): { front: Square; back: Square }[] {
  const p = chess.get(from);
  if (!p || !DIRS[p.type]) return [];
  const [f, r] = coords(from);
  const out: { front: Square; back: Square }[] = [];
  for (const [df, dr] of DIRS[p.type]) {
    let front: Square | null = null;
    for (let i = 1; ; i++) {
      const s = sq(f + df * i, r + dr * i);
      if (!s) break;
      const q = chess.get(s);
      if (!q) continue;
      if (q.color === p.color) break;
      if (!front) front = s;
      else {
        out.push({ front, back: s });
        break;
      }
    }
  }
  return out;
}

/**
 * Detects themes for a puzzle. `solution` alternates player/opponent moves,
 * starting with the player's move from `fen`.
 */
export function detectThemes(fen: string, solution: string[]): string[] {
  const themes = new Set<string>();
  const chess = new Chess(fen);
  const me = chess.turn();
  const them: Color = me === 'w' ? 'b' : 'w';
  const startMat = materialBalance(chess) * (me === 'w' ? 1 : -1);
  const phase = gamePhase(chess, 30);
  themes.add(phase);
  const playerMoves = Math.ceil(solution.length / 2);

  // Endgame flavours
  if (phase === 'endgame') {
    const types = new Set<string>();
    for (const row of chess.board()) for (const s of row) if (s && s.type !== 'k' && s.type !== 'p') types.add(s.type);
    if (types.size === 0) themes.add('pawnEndgame');
    else if (types.size === 1 && types.has('r')) themes.add('rookEndgame');
    else if (types.size === 1 && types.has('q')) themes.add('queenEndgame');
    else if (types.size === 1 && types.has('b')) themes.add('bishopEndgame');
    else if (types.size === 1 && types.has('n')) themes.add('knightEndgame');
  }

  for (let i = 0; i < solution.length; i++) {
    const isPlayer = i % 2 === 0;
    const before = new Chess(chess.fen());
    const m = parseUci(solution[i]);
    let mv;
    try {
      mv = chess.move(m);
    } catch {
      break;
    }
    if (!isPlayer) continue;
    if (mv.promotion) {
      themes.add('promotion');
      if (mv.promotion !== 'q') themes.add('underPromotion');
    }
    if (mv.flags.includes('e')) themes.add('enPassant');
    if ((mv.to === 'f7' && me === 'w') || (mv.to === 'f2' && me === 'b')) {
      if (mv.captured) themes.add('attackingF2F7');
    }
    if (i === 0) {
      // Hanging piece: capture of an undefended piece as the whole idea.
      if (mv.captured && !isDefended(before, mv.to as Square, them) && solution.length <= 2) themes.add('hangingPiece');
      // Sacrifice: moved piece can be captured and we end up down material for now.
      const movedVal = PIECE_VALUE[mv.piece];
      const capVal = mv.captured ? PIECE_VALUE[mv.captured] : 0;
      if (movedVal > capVal + 1 && chess.attackers(mv.to as Square, them).length > 0 && playerMoves >= 2) {
        const reply = solution[1];
        if (reply && reply.slice(2, 4) === mv.to) themes.add('sacrifice');
      }
      // Quiet move: no check, no capture, no promotion.
      if (!mv.captured && !mv.promotion && !chess.inCheck()) themes.add('quietMove');
    }

    // Double / discovered checks and attacks
    const kSq = kingSquare(chess, them);
    if (kSq) {
      const checkers = chess.attackers(kSq, me);
      if (checkers.length >= 2) themes.add('doubleCheck');
    }
    // Discovered attack: a different friendly slider now attacks something valuable.
    for (const row of before.board())
      for (const s of row) {
        if (!s || s.color !== me || s.square === mv.from || !DIRS[s.type]) continue;
        const was = new Set(attackedBy(before, s.square));
        for (const t of attackedBy(chess, s.square)) {
          if (was.has(t)) continue;
          const tp = chess.get(t);
          if (tp && tp.color === them && (tp.type === 'k' || PIECE_VALUE[tp.type] > PIECE_VALUE[s.type] || !isDefended(chess, t, them)) && PIECE_VALUE[tp.type] >= 3)
            themes.add('discoveredAttack');
          if (tp && tp.color === them && tp.type === 'k') themes.add('discoveredAttack');
        }
      }
    // Fork: the moved piece attacks two or more valuable targets.
    const targets = attackedBy(chess, mv.to as Square).filter((t) => {
      const tp = chess.get(t);
      if (!tp || tp.color !== them) return false;
      if (tp.type === 'k') return true;
      return PIECE_VALUE[tp.type] > PIECE_VALUE[mv.piece] || (!isDefended(chess, t, them) && PIECE_VALUE[tp.type] >= 3);
    });
    if (targets.length >= 2 && mv.piece !== 'k') themes.add('fork');
    // Pins and skewers from the moved slider
    for (const { front, back } of rayPairs(chess, mv.to as Square)) {
      const fv = valueOf(chess, front);
      const bv = valueOf(chess, back);
      const fp = chess.get(front)!;
      const bp = chess.get(back)!;
      if (bp.color !== them || fp.color !== them) continue;
      if (bv > fv && fv >= 3) themes.add('pin');
      else if (fv > bv && bv >= 3 && (fp.type === 'k' || fp.type === 'q')) themes.add('skewer');
    }
  }

  // Mates
  if (chess.isCheckmate()) {
    themes.add('mate');
    themes.add(playerMoves >= 5 ? 'mateIn5' : `mateIn${playerMoves}`);
    const k = kingSquare(chess, them)!;
    const backRank = them === 'w' ? '1' : '8';
    const checkers = chess.attackers(k, me);
    const checker = checkers[0] ? chess.get(checkers[0]) : null;
    if (k[1] === backRank && checker && (checker.type === 'r' || checker.type === 'q') && checkers[0][1] === backRank) {
      // escape squares blocked by own pawns
      themes.add('backRankMate');
    }
    if (checker && checker.type === 'n' && checkers.length === 1) {
      const [f, r] = coords(k);
      let allOwn = true;
      for (let df = -1; df <= 1; df++)
        for (let dr = -1; dr <= 1; dr++) {
          if (!df && !dr) continue;
          const s = sq(f + df, r + dr);
          if (!s) continue;
          const p = chess.get(s);
          if (!p || p.color !== them) allOwn = false;
        }
      if (allOwn) themes.add('smotheredMate');
    }
  } else {
    const endMat = materialBalance(chess) * (me === 'w' ? 1 : -1);
    if (endMat - startMat >= 1) themes.add(endMat - startMat >= 3 ? 'crushing' : 'advantage');
  }
  themes.add(playerMoves === 1 ? 'oneMove' : playerMoves <= 2 ? 'short' : 'long');
  return [...themes];
}
