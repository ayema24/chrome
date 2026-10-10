// Opening & gambit curriculum. Each line is written in PGN movetext with
// {comments} attached to the move they follow. All lines are validated for
// legality by src/data/openings.test.ts.

export type OpeningCategory = 'opening' | 'gambit' | 'trap';
export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface OpeningLineDef {
  name: string;
  pgn: string;
}

export interface OpeningDef {
  id: string;
  name: string;
  eco: string;
  /** The side this opening is usually studied for. */
  side: 'w' | 'b';
  category: OpeningCategory;
  level: Level;
  summary: string;
  ideas: string[];
  lines: OpeningLineDef[];
}

export const OPENINGS: OpeningDef[] = [
  // ------------------------------------------------------------------ WHITE
  {
    id: 'italian',
    name: 'Italian Game',
    eco: 'C50–C54',
    side: 'w',
    category: 'opening',
    level: 'beginner',
    summary:
      'One of the oldest openings. White develops quickly, aims the bishop at f7 and prepares a central break with c3 and d4.',
    ideas: [
      'Bishop on c4 targets the weak f7 square.',
      'c3 prepares d4 to build a big centre.',
      'In slow lines (d3), White manoeuvres the knight b1–d2–f1–g3 and attacks on the kingside.',
    ],
    lines: [
      {
        name: 'Giuoco Pianissimo (slow, positional)',
        pgn: `1. e4 {Claim the centre and open lines for the queen and bishop.} e5 2. Nf3 {Develop with tempo by attacking e5.} Nc6 {Defends the pawn.} 3. Bc4 {The Italian bishop aims at f7, the weakest point in Black's camp.} Bc5 {Black mirrors the idea and eyes f2.} 4. c3 {Prepares d4 to build a big pawn centre.} Nf6 5. d3 {The modern slow approach: keep the centre solid and avoid early simplification.} d6 6. O-O O-O 7. Re1 {Supports e4 and prepares Nbd2–f1–g3.} a6 {Gives the c5 bishop a retreat on a7.} 8. a4 {Stops ...b5 and gains space on the queenside.} Ba7 9. h3 {Prevents ...Bg4 pins and prepares Nbd2–f1.} h6 10. Nbd2 {Plan: Nf1, Ng3, and later d4. Both sides have a long manoeuvring game ahead.}`,
      },
      {
        name: 'Giuoco Piano with c3 & d4 (open centre)',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 {Preparing d4.} Nf6 {Counter-attacks e4.} 5. d4 {Strike the centre immediately.} exd4 6. cxd4 Bb4+ {The bishop must leave c5 with check.} 7. Bd2 {Simplest. 7.Nc3 leads to the sharp Møller Attack.} Bxd2+ 8. Nbxd2 d5 {Black must hit back in the centre or be squeezed.} 9. exd5 Nxd5 10. Qb3 {Pressure on d5 and b7.} Nce7 {Reinforces d5.} 11. O-O O-O 12. Rfe1 c6 {White has an isolated d-pawn: more space and activity, but a long-term weakness. Play actively!}`,
      },
      {
        name: 'Two Knights: 4.Ng5 main line',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 {The Two Knights Defence: Black counter-attacks e4.} 4. Ng5 {Attacks f7 twice.} d5 {The only good way to block the bishop.} 5. exd5 Na5 {Correct! 5...Nxd5? allows the Fried Liver attack.} 6. Bb5+ c6 7. dxc6 bxc6 8. Be2 {White keeps the extra pawn; Black gets fast development as compensation.} h6 9. Nf3 e4 10. Ne5 Bd6 {Black has strong activity for the pawn. A rich, double-edged position.}`,
      },
    ],
  },
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez (Spanish)',
    eco: 'C60–C99',
    side: 'w',
    category: 'opening',
    level: 'intermediate',
    summary:
      'White pressures the knight that defends e5. The most classical of all openings – it teaches long-term pressure and manoeuvring.',
    ideas: [
      'Bb5 indirectly pressures e5 by attacking its defender.',
      'The bishop usually retreats to a4 and b3, aiming at f7.',
      'White builds the centre with c3 + d4 and often re-routes the b1 knight to g3.',
    ],
    lines: [
      {
        name: 'Closed Ruy Lopez',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bb5 {The Spanish bishop attacks the defender of e5.} a6 {The Morphy Defence: ask the bishop a question.} 4. Ba4 {Keep the pin-like pressure.} Nf6 5. O-O {Castle first; e4 is indirectly defended because ...Nxe4 runs into Re1.} Be7 6. Re1 {Now e4 is directly protected.} b5 7. Bb3 d6 8. c3 {Prepares d4 and keeps the bishop safe on c2 later.} O-O 9. h3 {Stops ...Bg4 before playing d4.} Na5 {The Chigorin: chase the bishop.} 10. Bc2 c5 11. d4 Qc7 {Classic Closed Spanish. White will play Nbd2–f1–g3; Black fights on the queenside.}`,
      },
      {
        name: 'Berlin Defence',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 {The Berlin – very solid, favoured at elite level.} 4. O-O Nxe4 {Taking is fine because White regains the pawn.} 5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 {The Berlin endgame: Black has the bishop pair but has lost castling rights. White has a kingside pawn majority.}`,
      },
      {
        name: 'Exchange Variation',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 {Give up the bishop to damage Black's pawns.} dxc6 5. O-O {Indirectly defends e4 for now.} f6 {Solid protection of e5.} 6. d4 exd4 7. Nxd4 c5 8. Nb3 Qxd1 9. Rxd1 {White's healthy 4-vs-3 kingside majority can create a passed pawn in the endgame; Black has the two bishops.}`,
      },
    ],
  },
  {
    id: 'queens-gambit',
    name: "Queen's Gambit",
    eco: 'D06–D69',
    side: 'w',
    category: 'gambit',
    level: 'beginner',
    summary:
      "White offers the c-pawn to deflect Black's d5 pawn from the centre. It is not a real gambit – the pawn can usually be regained.",
    ideas: [
      'c4 challenges d5 from the side.',
      'If Black takes (QGA), White builds a big centre and regains c4.',
      'In the Declined, White pressures with Bg5, Rc1 and the minority attack (b4–b5).',
    ],
    lines: [
      {
        name: "Queen's Gambit Declined",
        pgn: `1. d4 d5 2. c4 {The Queen's Gambit.} e6 {Declined: Black keeps a solid pawn on d5.} 3. Nc3 Nf6 4. Bg5 {Pins the knight that defends d5.} Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 {The Tartakower: Black fianchettoes the problem light-squared bishop.} 8. Be2 Bb7 9. Bxf6 Bxf6 10. cxd5 exd5 {White will press on the queenside; Black has a solid but slightly passive position.}`,
      },
      {
        name: "Queen's Gambit Accepted",
        pgn: `1. d4 d5 2. c4 dxc4 {Accepted. Black does not try to keep the pawn long-term.} 3. Nf3 {Prevents ...e5.} Nf6 4. e3 {Opens the bishop to regain c4.} e6 5. Bxc4 c5 {Black strikes at the centre.} 6. O-O a6 7. a4 {Stops ...b5 gaining space.} Nc6 {A classical position: White often gets an isolated d-pawn with active pieces.}`,
      },
      {
        name: 'Slav Defence',
        pgn: `1. d4 d5 2. c4 c6 {The Slav: supports d5 without blocking the c8 bishop.} 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 {Stops ...b5 holding the pawn.} Bf5 {The bishop gets out before ...e6.} 6. e3 e6 7. Bxc4 Bb4 8. O-O O-O 9. Qe2 {White prepares e4; Black has a very solid position.}`,
      },
      {
        name: 'Trap: Elephant Trap (for Black!)',
        pgn: `1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 {Looks like it leaves d5 weak...} 5. cxd5 exd5 6. Nxd5?? {Greedy! White thinks the knight on f6 is pinned.} Nxd5! {The pin is fake.} 7. Bxd8 Bb4+ {Check! The queen is returned with interest.} 8. Qd2 Bxd2+ 9. Kxd2 Kxd8 {Black is a full piece up. Lesson: check whether a pin is absolute before relying on it.}`,
      },
    ],
  },
  {
    id: 'london',
    name: 'London System',
    eco: 'D02',
    side: 'w',
    category: 'opening',
    level: 'beginner',
    summary:
      'A system opening: White sets up d4, Bf4, e3, Nf3, c3 and Bd3 against almost anything. Easy to learn, solid, with attacking chances.',
    ideas: [
      'Develop the dark bishop to f4 BEFORE playing e3.',
      'The pyramid d4–e3–c3 is very hard to break.',
      'Typical attack: Ne5, f4, and a kingside pawn storm.',
    ],
    lines: [
      {
        name: 'Against ...d5 and ...c5',
        pgn: `1. d4 d5 2. Bf4 {The London bishop comes out before e3 locks it in.} Nf6 3. e3 c5 {The most testing reply.} 4. c3 {Hold d4 firmly.} Nc6 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3 {Keep the bishop; don't allow ...Bxf4 for free.} O-O 8. Bd3 {Aiming at h7. White castles and plays Ne5 with kingside play.}`,
      },
      {
        name: 'Against the King’s Indian set-up',
        pgn: `1. d4 Nf6 2. Bf4 g6 3. e3 Bg7 4. Nf3 O-O 5. Be2 d6 6. h3 {A useful retreat square for the bishop on h2 after ...Nh5.} c5 7. c3 Nc6 8. O-O {Solid. White keeps the centre and will expand with a4 or Nbd2–c4.}`,
      },
    ],
  },
  {
    id: 'scotch',
    name: 'Scotch Game',
    eco: 'C45',
    side: 'w',
    category: 'opening',
    level: 'beginner',
    summary: 'White opens the centre immediately with 3.d4. Clear, active play that avoids a lot of theory.',
    ideas: ['Immediate central tension.', 'Fast development and open lines for White’s pieces.'],
    lines: [
      {
        name: 'Mieses Variation',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. d4 {Open the centre at once.} exd4 4. Nxd4 Nf6 {Counter-attacks e4.} 5. Nxc6 bxc6 6. e5 {Kick the knight.} Qe7 {Pins the pawn to the king.} 7. Qe2 Nd5 8. c4 Ba6 {Black pins c4. Dynamic play; White has space, Black has pressure.}`,
      },
      {
        name: 'Classical 4...Bc5',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5 {Attacks the knight on d4.} 5. Be3 {Defends it.} Qf6 {Doubles the attack.} 6. c3 Nge7 7. Bc4 {Simple development; White keeps a firm grip on the centre.}`,
      },
    ],
  },
  {
    id: 'english',
    name: 'English Opening',
    eco: 'A10–A39',
    side: 'w',
    category: 'opening',
    level: 'intermediate',
    summary: 'White starts on the flank with 1.c4 and fights for d5. Often a Sicilian with colours reversed.',
    ideas: ['Control d5.', 'Fianchetto the king’s bishop on g2.', 'Queenside expansion with b4–b5.'],
    lines: [
      {
        name: 'Reversed Sicilian',
        pgn: `1. c4 {Control d5 from the flank.} e5 2. Nc3 Nf6 3. g3 d5 4. cxd5 Nxd5 5. Bg2 {The fianchettoed bishop pressures d5 and the long diagonal.} Nb6 6. Nf3 Nc6 7. O-O Be7 {A Sicilian Dragon with an extra tempo for White.}`,
      },
    ],
  },
  // ---------------------------------------------------------- WHITE GAMBITS
  {
    id: 'kings-gambit',
    name: "King's Gambit",
    eco: 'C30–C39',
    side: 'w',
    category: 'gambit',
    level: 'intermediate',
    summary:
      'The romantic gambit: White sacrifices the f-pawn to deflect e5 and open the f-file. Leads to sharp, tactical games.',
    ideas: ['Deflect the e5 pawn and build a centre with d4.', 'Open the f-file for the rook after castling.', 'Watch out for ...Qh4+ checks.'],
    lines: [
      {
        name: 'Accepted: Kieseritzky',
        pgn: `1. e4 e5 2. f4 {Offer the f-pawn.} exf4 3. Nf3 {Prevents ...Qh4+.} g5 {Black tries to hold the extra pawn.} 4. h4 {Undermine the pawn chain immediately.} g4 5. Ne5 {The Kieseritzky Gambit.} Nf6 6. d4 d6 7. Nd3 Nxe4 8. Bxf4 Qe7 9. Qe2 {Pins the knight. White will regain material, though with best play Black is doing well – typical of the King's Gambit: objectively risky, practically dangerous.}`,
      },
      {
        name: 'Declined: Classical 2...Bc5',
        pgn: `1. e4 e5 2. f4 Bc5 {Declined: the bishop stops White castling short.} 3. Nf3 d6 4. c3 {Prepares d4 to blunt the bishop.} Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2 {White has a big centre; Black hits it with ...d5 or ...O-O and ...Re8.}`,
      },
      {
        name: 'Falkbeer Countergambit',
        pgn: `1. e4 e5 2. f4 d5 {Counter-attack in the centre!} 3. exd5 e4 {A wedge that cramps White.} 4. d3 {Break it up immediately.} Nf6 5. dxe4 Nxe4 6. Nf3 Bc5 7. Qe2 Bf5 {Sharp and balanced. Black develops fast; White must be careful about the f2 square.}`,
      },
    ],
  },
  {
    id: 'evans-gambit',
    name: 'Evans Gambit',
    eco: 'C51–C52',
    side: 'w',
    category: 'gambit',
    level: 'intermediate',
    summary: 'In the Italian, White offers the b-pawn to gain time for c3 and d4. A favourite of Kasparov and Morphy.',
    ideas: ['Gain tempo on the c5 bishop.', 'Build the centre with c3 + d4.', 'Rapid attack against f7 and the black king.'],
    lines: [
      {
        name: 'Accepted 5...Ba5',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 {The Evans Gambit.} Bxb4 5. c3 {Gain time on the bishop.} Ba5 6. d4 {Open the centre while Black is undeveloped.} exd4 7. O-O {Development first.} Nge7 {Prepares ...d5 to return material.} 8. cxd4 d5 9. exd5 Nxd5 {Black has given back the pawn to finish development. White is very active.}`,
      },
      {
        name: 'Lasker-style 6...d6',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 d6 {Solid: keep the e5 point.} 7. Qb3 {Pressure on f7 and b7.} Qd7 8. dxe5 Bb6 9. Nbd2 {White has a lead in development for the pawn.}`,
      },
    ],
  },
  {
    id: 'fried-liver',
    name: 'Fried Liver Attack',
    eco: 'C57',
    side: 'w',
    category: 'gambit',
    level: 'beginner',
    summary:
      'If Black recaptures 5...Nxd5 in the Two Knights, White can sacrifice a knight on f7 and drag the black king into the centre.',
    ideas: ['Punish 5...Nxd5 by attacking the pinned knight on d5.', 'The king on e6 is very exposed.', 'Black should play 5...Na5 instead!'],
    lines: [
      {
        name: 'The knight sacrifice',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5? {Natural but risky. 5...Na5 is best.} 6. Nxf7! {The Fried Liver sacrifice.} Kxf7 7. Qf3+ {The queen attacks the pinned knight.} Ke6 {The only way to keep the knight.} 8. Nc3 {Attack d5 a third time.} Ncb4 {Defends d5 and threatens ...Nxc2+.} 9. a3 Nxc2+ 10. Kd1 Nxa1 11. Nxd5 {White has a dangerous attack against the exposed king. The engine actually prefers Black, but over the board this is very hard to defend – which is why 5...Na5 is the principled reply.}`,
      },
      {
        name: 'Safer: Lolli Attack 6.d4',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. d4 {The Lolli: opens lines before sacrificing.} exd4 7. O-O Be7 8. Nxf7 Kxf7 9. Qf3+ Ke6 10. Nc3 {All White's pieces join the attack.}`,
      },
    ],
  },
  {
    id: 'danish',
    name: 'Danish Gambit',
    eco: 'C21',
    side: 'w',
    category: 'gambit',
    level: 'intermediate',
    summary: 'White gives up two pawns for two raking bishops aimed at the black king. Black’s best defence is to return material with ...d5.',
    ideas: ['Bishops on c4 and b2 aim at f7 and g7.', 'Black should give material back with ...d5.'],
    lines: [
      {
        name: 'Schlechter Defence (how Black defends)',
        pgn: `1. e4 e5 2. d4 exd4 3. c3 {The Danish.} dxc3 4. Bc4 cxb2 5. Bxb2 {Two pawns down, but two monster bishops.} d5! {Return a pawn to blunt the c4 bishop.} 6. Bxd5 Nf6 7. Bxf7+ Kxf7 8. Qxd8 Bb4+ {Intermezzo! Black regains the queen.} 9. Qd2 Bxd2+ 10. Nxd2 c5 {Material is level, but White's gambit has fizzled out and Black has a healthy queenside majority. This is why strong players rarely play the Danish.}`,
      },
    ],
  },
  {
    id: 'smith-morra',
    name: 'Smith-Morra Gambit',
    eco: 'B21',
    side: 'w',
    category: 'gambit',
    level: 'intermediate',
    summary: 'Against the Sicilian, White sacrifices a pawn for quick development and open c- and d-files.',
    ideas: ['Rooks to c1 and d1.', 'Target the d6 pawn and the d5 square.', 'Watch out for the Siberian Trap!'],
    lines: [
      {
        name: 'Main line',
        pgn: `1. e4 c5 2. d4 cxd4 3. c3 {The Morra.} dxc3 4. Nxc3 {A pawn down, but White is ahead in development.} Nc6 5. Nf3 d6 6. Bc4 e6 7. O-O Nf6 8. Qe2 Be7 9. Rd1 e5 10. h3 O-O {White has pressure on d6 and the open files.}`,
      },
      {
        name: 'Trap: the Siberian Trap (beware!)',
        pgn: `1. e4 c5 2. d4 cxd4 3. c3 dxc3 4. Nxc3 Nc6 5. Nf3 e6 6. Bc4 Qc7 7. O-O Nf6 8. Qe2 Ng4 {Eyes h2 with knight and queen.} 9. h3?? {Natural – but a blunder.} Nd4! {Attacks the queen and deflects the f3 knight.} 10. Nxd4? Qh2# {Checkmate! White should play 9.Rd1 or 9.Nb5 instead.}`,
      },
    ],
  },
  {
    id: 'vienna',
    name: 'Vienna Gambit',
    eco: 'C29',
    side: 'w',
    category: 'gambit',
    level: 'intermediate',
    summary: 'A King’s-Gambit-style f4 push after first developing the knight. Aggressive yet sound.',
    ideas: ['Nc3 protects e4 before f4.', 'Open the f-file and attack.'],
    lines: [
      {
        name: 'Main line 3...d5',
        pgn: `1. e4 e5 2. Nc3 {The Vienna.} Nf6 3. f4 {The Vienna Gambit.} d5 {Best: strike back in the centre.} 4. fxe5 Nxe4 5. Nf3 Be7 6. d4 O-O 7. Bd3 f5 {Supports the strong knight on e4.} 8. exf6 Bxf6 9. O-O {Balanced but sharp. White has open lines towards the black king.}`,
      },
    ],
  },
  // ------------------------------------------------------------------ BLACK
  {
    id: 'najdorf',
    name: 'Sicilian Najdorf',
    eco: 'B90–B99',
    side: 'b',
    category: 'opening',
    level: 'advanced',
    summary: 'The most famous Sicilian. 5...a6 keeps options open and prepares ...e5 or ...e6 and ...b5.',
    ideas: ['...a6 controls b5 and prepares ...b5.', 'Fight for d5.', 'Counter-attack on the queenside and the c-file.'],
    lines: [
      {
        name: 'English Attack 6.Be3 e5',
        pgn: `1. e4 c5 {The Sicilian: fight for d4 asymmetrically.} 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 {The Najdorf.} 6. Be3 e5 {Kick the knight and grab central space.} 7. Nb3 Be6 {Fight for d5.} 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 {Opposite-side castling: race! Black attacks with ...b5–b4.}`,
      },
      {
        name: 'Classical 6.Bg5',
        pgn: `1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 Be7 8. Qf3 Qc7 9. O-O-O Nbd7 {One of the sharpest lines in chess; both kings will come under fire.}`,
      },
    ],
  },
  {
    id: 'dragon',
    name: 'Sicilian Dragon',
    eco: 'B70–B79',
    side: 'b',
    category: 'opening',
    level: 'advanced',
    summary: 'Black fianchettoes the bishop on g7 where it breathes fire down the long diagonal.',
    ideas: ['The g7 bishop is Black’s best piece – keep it!', 'Exchange sac ...Rxc3 is a typical idea.', 'Attack on the c-file.'],
    lines: [
      {
        name: 'Yugoslav Attack',
        pgn: `1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 {The Dragon.} 6. Be3 Bg7 7. f3 {The Yugoslav Attack: f3, Qd2, O-O-O and h4–h5.} O-O 8. Qd2 Nc6 9. Bc4 Bd7 10. O-O-O Rc8 11. Bb3 Ne5 {Black aims for ...Nc4 and the c-file. Whoever attacks faster usually wins.}`,
      },
    ],
  },
  {
    id: 'french',
    name: 'French Defence',
    eco: 'C00–C19',
    side: 'b',
    category: 'opening',
    level: 'intermediate',
    summary: 'Black builds a solid e6–d5 chain and counter-attacks the white centre with ...c5 and ...f6.',
    ideas: ['Attack the base of White’s pawn chain with ...c5.', 'The light-squared bishop is the problem piece.', '...Qb6 pressures d4 and b2.'],
    lines: [
      {
        name: 'Advance Variation',
        pgn: `1. e4 e6 2. d4 d5 3. e5 {Grab space.} c5 {Hit the base of the chain immediately.} 4. c3 Nc6 5. Nf3 Qb6 {Triple pressure on d4.} 6. a3 c4 {Fixes the queenside and cramps White.} 7. Nbd2 Na5 {The knight eyes b3. Black plays on the queenside, White on the kingside.}`,
      },
      {
        name: 'Winawer',
        pgn: `1. e4 e6 2. d4 d5 3. Nc3 Bb4 {The Winawer: pin and pressure e4.} 4. e5 c5 5. a3 Bxc3+ 6. bxc3 Ne7 7. Qg4 {Attacks g7.} O-O {Very sharp. White has the bishop pair and kingside play; Black has the better structure.}`,
      },
      {
        name: 'Exchange Variation',
        pgn: `1. e4 e6 2. d4 d5 3. exd5 exd5 {Symmetrical. Black's c8 bishop is now free.} 4. Bd3 Nc6 5. c3 Bd6 6. Nf3 Nge7 7. O-O Bg4 {Equal and calm; good for learning piece play.}`,
      },
    ],
  },
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defence',
    eco: 'B10–B19',
    side: 'b',
    category: 'opening',
    level: 'beginner',
    summary: 'Like the French, but Black supports d5 with c6 so the light-squared bishop can develop. Rock solid.',
    ideas: ['Develop the c8 bishop before ...e6.', 'Solid pawn structure, good endgames.', 'Counter-attack with ...c5 later.'],
    lines: [
      {
        name: 'Classical 4...Bf5',
        pgn: `1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 {Develop the bishop outside the pawn chain.} 5. Ng3 Bg6 6. h4 h6 {Keep the bishop: if h5 it would be trapped without this.} 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6 {A healthy, solid position. Black will castle and play ...c5 or ...Qc7.}`,
      },
      {
        name: 'Advance Variation',
        pgn: `1. e4 c6 2. d4 d5 3. e5 Bf5 {The bishop comes out first.} 4. Nf3 e6 5. Be2 c5 {Attack the base of the chain.} 6. Be3 Nd7 7. O-O Ne7 {Black aims for ...Nc6 and pressure on d4.}`,
      },
    ],
  },
  {
    id: 'scandinavian',
    name: 'Scandinavian Defence',
    eco: 'B01',
    side: 'b',
    category: 'opening',
    level: 'beginner',
    summary: 'Black challenges e4 immediately. Simple plans and easy development make it great for improving players.',
    ideas: ['Queen retreats to a5 to pin c3 and stay active.', 'Develop ...Bf5, ...e6, ...c6 – a solid "Caro-Kann" structure.'],
    lines: [
      {
        name: 'Main line 3...Qa5',
        pgn: `1. e4 d5 {Challenge the centre immediately.} 2. exd5 Qxd5 3. Nc3 Qa5 {Out of the way, and pins the c3 knight once d2 moves.} 4. d4 Nf6 5. Nf3 c6 {A safe retreat square for the queen on c7.} 6. Bc4 Bf5 7. Bd2 e6 {Solid and easy to play.}`,
      },
    ],
  },
  {
    id: 'kings-indian',
    name: "King's Indian Defence",
    eco: 'E60–E99',
    side: 'b',
    category: 'opening',
    level: 'advanced',
    summary: 'Black lets White build a big centre, then attacks it. In the main lines Black storms the white king.',
    ideas: ['Fianchetto and castle fast.', 'Strike with ...e5 (or ...c5).', 'In closed centres, attack with ...f5–f4–g5.'],
    lines: [
      {
        name: 'Classical: Mar del Plata',
        pgn: `1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 {Strike the centre.} 7. O-O Nc6 8. d5 Ne7 {The centre is closed. White attacks on the queenside...} 9. Ne1 Nd7 10. Nd3 f5 {...and Black on the kingside with ...f4, ...g5 and ...g4. A race!}`,
      },
    ],
  },
  {
    id: 'nimzo-indian',
    name: 'Nimzo-Indian Defence',
    eco: 'E20–E59',
    side: 'b',
    category: 'opening',
    level: 'intermediate',
    summary: 'Black pins the c3 knight to control e4. Often gives up the bishop pair to double White’s pawns.',
    ideas: ['Control e4 with pieces.', 'Double White’s c-pawns with ...Bxc3.', 'Blockade on the light squares.'],
    lines: [
      {
        name: 'Rubinstein 4.e3',
        pgn: `1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 {The Nimzo pin.} 4. e3 O-O 5. Bd3 d5 6. Nf3 c5 7. O-O {A classical, balanced fight.}`,
      },
      {
        name: 'Classical 4.Qc2',
        pgn: `1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Qc2 {Avoids doubled pawns.} O-O 5. a3 Bxc3+ 6. Qxc3 b6 7. Bg5 Bb7 {Black controls e4; White has the bishop pair.}`,
      },
    ],
  },
  {
    id: 'petroff',
    name: 'Petroff Defence',
    eco: 'C42',
    side: 'b',
    category: 'opening',
    level: 'intermediate',
    summary: 'Black counter-attacks e4 instead of defending e5. Extremely solid.',
    ideas: ['Don’t copy White blindly – 3...d6 first!', 'Symmetrical, solid positions.'],
    lines: [
      {
        name: 'Classical',
        pgn: `1. e4 e5 2. Nf3 Nf6 {The Petroff.} 3. Nxe5 d6 {Kick the knight first! 3...Nxe4? is a mistake (see the trap).} 4. Nf3 Nxe4 5. d4 d5 6. Bd3 Nc6 7. O-O Be7 8. c4 Nb4 {Main line theory; Black is solid.}`,
      },
      {
        name: 'Trap: the copycat 3...Nxe4?',
        pgn: `1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nxe4? {Copying White.} 4. Qe2 {Pins the knight against the king.} Nf6?? {Natural – and losing.} 5. Nc6+ {Discovered check! The queen on d8 falls.} Be7 6. Nxd8 {White wins the queen. Remember: 3...d6!}`,
      },
    ],
  },
  // ---------------------------------------------------------- BLACK GAMBITS
  {
    id: 'budapest',
    name: 'Budapest Gambit',
    eco: 'A51–A52',
    side: 'b',
    category: 'gambit',
    level: 'intermediate',
    summary: 'Black answers 1.d4 Nf6 2.c4 with the surprising 2...e5!? and usually regains the pawn on e5.',
    ideas: ['Pressure e5 with ...Ng4, ...Nc6 and ...Qe7.', '...Bb4+ to develop with tempo.', 'Many traps for White.'],
    lines: [
      {
        name: 'Main line 4.Bf4',
        pgn: `1. d4 Nf6 2. c4 e5 {The Budapest Gambit.} 3. dxe5 Ng4 {Attack the pawn.} 4. Bf4 Nc6 5. Nf3 Bb4+ 6. Nbd2 Qe7 {Pile up on e5.} 7. e3 Ngxe5 8. Nxe5 Nxe5 9. Be2 O-O 10. O-O {Black has regained the pawn with active pieces.}`,
      },
      {
        name: 'Trap: 8.axb4?? Nd3#',
        pgn: `1. d4 Nf6 2. c4 e5 3. dxe5 Ng4 4. Bf4 Nc6 5. Nf3 Bb4+ 6. Nbd2 Qe7 7. a3 {Asking the bishop...} Ngxe5 {Ignoring it!} 8. axb4?? Nd3# {Smothered checkmate! The e2 pawn is pinned by the queen on e7.}`,
      },
    ],
  },
  {
    id: 'benko',
    name: 'Benko Gambit',
    eco: 'A57–A59',
    side: 'b',
    category: 'gambit',
    level: 'advanced',
    summary: 'Black sacrifices a queenside pawn for long-lasting pressure on the a- and b-files.',
    ideas: ['Open the a- and b-files for the rooks.', 'Fianchettoed bishop on g7 bears down on the queenside.', 'Black is often happy to reach an endgame a pawn down!'],
    lines: [
      {
        name: 'Fully accepted',
        pgn: `1. d4 Nf6 2. c4 c5 3. d5 b5 {The Benko.} 4. cxb5 a6 5. bxa6 Bxa6 {Black's bishop and rooks will dominate the queenside.} 6. Nc3 d6 7. e4 Bxf1 8. Kxf1 {White cannot castle.} g6 9. g3 Bg7 10. Kg2 O-O 11. Nf3 Nbd7 {Typical Benko pressure: ...Qa5, ...Rfb8, ...Rxa2.}`,
      },
    ],
  },
  {
    id: 'albin',
    name: 'Albin Countergambit',
    eco: 'D08–D09',
    side: 'b',
    category: 'gambit',
    level: 'intermediate',
    summary: 'A sharp answer to the Queen’s Gambit: Black hits back with ...e5 and plants a pawn on d4.',
    ideas: ['The d4 pawn cramps White.', 'Black often castles long and attacks.', 'Famous Lasker Trap with an underpromotion!'],
    lines: [
      {
        name: 'Main line',
        pgn: `1. d4 d5 2. c4 e5 {The Albin.} 3. dxe5 d4 {A space-gaining wedge.} 4. Nf3 Nc6 5. g3 Be6 6. Nbd2 Qd7 7. Bg2 O-O-O {Opposite intentions: Black attacks the kingside with ...Bh3 and ...h5.}`,
      },
      {
        name: 'Trap: the Lasker Trap',
        pgn: `1. d4 d5 2. c4 e5 3. dxe5 d4 4. e3? Bb4+ 5. Bd2 dxe3 6. Bxb4?? {Greedy.} exf2+ 7. Ke2 fxg1=N+! {Underpromotion! A queen would be captured.} 8. Ke1 Qh4+ {Black wins: the attack is decisive.}`,
      },
    ],
  },
  {
    id: 'stafford',
    name: 'Stafford Gambit',
    eco: 'C42',
    side: 'b',
    category: 'gambit',
    level: 'beginner',
    summary: 'A tricky (objectively dubious) gambit from the Petroff. Learn it to set traps — and learn how to refute it as White.',
    ideas: ['Black gets open lines and fast development.', 'Traps around f2 and e4.', 'As White: calm moves like d3, Be2 and Nc3 refute it.'],
    lines: [
      {
        name: 'Trap: 6.Bg5?? Nxe4!',
        pgn: `1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nc6 {The Stafford.} 4. Nxc6 dxc6 5. d3 Bc5 6. Bg5?? {Pins the knight – or does it?} Nxe4! {Unpins with a counter-attack.} 7. Bxd8? Bxf2+ 8. Ke2 Bg4# {A beautiful mate with three minor pieces.}`,
      },
      {
        name: 'How White should play',
        pgn: `1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nc6 4. Nxc6 dxc6 5. d3 {Solidly protect e4.} Bc5 6. Be2 {Calmly blocks the e-file and prepares castling.} h5 7. c3 {Prepares d4 to hit the bishop and guard against ...Ng4 tricks.} Ng4 8. d4 {White is a pawn up with a safe position.}`,
      },
    ],
  },
  // --------------------------------------------------------------- TRAPS
  {
    id: 'traps-e4',
    name: 'Classic Traps (1.e4 e5)',
    eco: '—',
    side: 'w',
    category: 'trap',
    level: 'beginner',
    summary: 'Famous traps every player should know – to use them and, more importantly, never fall for them.',
    ideas: ['Look for checks, captures and threats every move.', 'Do not grab material if it leaves your king exposed.'],
    lines: [
      {
        name: "Legal's Mate",
        pgn: `1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6? 5. Nxe5! {Sacrifices the queen!} Bxd1?? {Taking is fatal. 5...dxe5 6.Qxg4 only loses a pawn.} 6. Bxf7+ Ke7 7. Nd5# {Legal's Mate: three minor pieces checkmate the king.}`,
      },
      {
        name: 'Blackburne Shilling Trap (for Black)',
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 {Looks like it loses the e5 pawn...} 4. Nxe5? Qg5! {Double attack on e5 and g2.} 5. Nxf7?? Qxg2 6. Rf1 Qxe4+ 7. Be2? Nf3# {Smothered-style mate. White should answer 3...Nd4 with 4.Nxd4 or 4.O-O.}`,
      },
      {
        name: "Defending against Scholar's Mate",
        pgn: `1. e4 e5 2. Qh5 {Threatens e5 and – after Bc4 – f7.} Nc6 {Defends e5.} 3. Bc4 g6 {Blocks the queen. 3...Nf6?? 4.Qxf7# is mate.} 4. Qf3 {Renews the threat on f7.} Nf6 {Blocks the f-file with a developing move. Black is fine and will gain time by hitting White's queen with ...Nd4.}`,
      },
      {
        name: "Noah's Ark Trap (Ruy Lopez, for Black)",
        pgn: `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 d6 5. d4 b5 6. Bb3 Nxd4 7. Nxd4 exd4 8. Qxd4?? c5! {Hits the queen...} 9. Qd5 Be6 10. Qc6+ Bd7 11. Qd5 c4 {...and the bishop on b3 is trapped like an animal in Noah's Ark.}`,
      },
    ],
  },
  {
    id: 'traps-d4',
    name: 'Classic Traps (1.d4)',
    eco: '—',
    side: 'b',
    category: 'trap',
    level: 'beginner',
    summary: 'Traps in queen-pawn openings.',
    ideas: ['Be suspicious when your opponent offers material early.'],
    lines: [
      {
        name: 'Englund Gambit Trap',
        pgn: `1. d4 e5 {The Englund Gambit – dubious, but tricky.} 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4? Qb4+ 5. Bd2 Qxb2 6. Bc3?? Bb4! {Pins the bishop.} 7. Qd2 Bxc3 8. Qxc3? Qc1# {Checkmate on the back rank. White should play 4.Nc3 or 4.Qd5.}`,
      },
    ],
  },
];

export function openingById(id: string): OpeningDef | undefined {
  return OPENINGS.find((o) => o.id === id);
}
