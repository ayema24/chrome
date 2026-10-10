# ♟ Chess Coach

A personal chess trainer that runs entirely in your browser (desktop or phone, installable as an app). It's built around one goal: **making you a much stronger player in 30 days**, and measuring whether it's working.

## What it does

| | |
|---|---|
| **Coach dashboard** | A 30-day plan (4 weekly themes) turned into a daily checklist. It ticks off by itself as you train. Your top weaknesses and strengths update live after every puzzle, drill and game. |
| **Play** | Spar against Stockfish 18 at 12 difficulty levels (~400 → 3200). *Coach mode* reviews every move as you play (best / inaccuracy / mistake / blunder, with an explanation). It also gives an eval bar, hints and takebacks. *Adaptive difficulty* moves the level up after a win and down after two losses in a row. |
| **Openings & gambits** | 26 openings, gambits and trap collections with 52 annotated lines: Italian, Ruy Lopez, Queen's Gambit, London, Sicilian Najdorf & Dragon, French, Caro-Kann, King's Indian, King's/Evans/Danish/Smith-Morra/Vienna/Budapest/Benko/Albin/Stafford gambits, Fried Liver, Legal's mate, and more. *Learn* steps through every move with comments. *Drill* has you play the line from memory, with spaced repetition. You can also build a repertoire. |
| **Puzzles** | Engine-verified offline puzzles with themes, plus unlimited **Lichess puzzles** (online, by theme and difficulty) and the daily puzzle. Puzzle rating uses an Elo-style rating that settles quickly. |
| **My mistakes** | Every mistake/blunder from your analysed games becomes a puzzle ("find the better move"). These puzzles come back on a spaced-repetition schedule until you stop making the mistake. |
| **Endgame drills** | Queen/rook/two-bishop mates, king & pawn, rule of the square, Lucena, Philidor, Q vs P. You play them out against full-strength Stockfish. |
| **Analysis** | Full game review: accuracy per side, every move classified, an explanation for each move (hung material, missed tactic, allowed mate, missed mate, time trouble, etc.) and a win-probability graph. It also has a live multi-line engine and variations. |
| **Games database** | Import your games from **Lichess** and **Chess.com** by username, or paste PGN. A background engine analyses them and feeds your weakness profile. The **opening explorer** shows Lichess Masters and Lichess-player statistics, with the top master games one click away. |
| **Scan a board** | Upload, paste or photograph a screenshot of a board. The app finds the board, reads the pieces, lets you correct them, then you can analyse the position or play it out. Calibrate once with a start-position screenshot from any site to recognise its piece style. |
| **Progress** | Puzzle and play rating over time, game accuracy, blunders per game, tactical-theme success rates, accuracy by game phase, results per opening, a 30-day activity map, and a *before vs now* comparison. |

### How weaknesses are detected
The coach combines:
- **Real games** (analysed by Stockfish): which kinds of mistakes you repeat per game (hanging material, missed tactics, not punishing your opponent's errors, missed/allowed mates, endgame technique, opening errors, errors in time trouble). It also looks at your weakest game phase, your conversion rate from winning positions, openings that score badly and colour imbalance.
- **Puzzles**: themes you solve noticeably less often than average, and "rushing" (fast failures).
- **Drills**: opening lines you keep forgetting and endgames you keep failing.

Each weakness links straight to the drill that fixes it, and the daily plan's "targeted" task follows your worst tactical theme.

## Getting started

```bash
npm install      # also copies the Stockfish WASM build into public/engine
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm test         # unit tests (includes engine-backed tests)
npx playwright test   # end-to-end tests in a real browser
```

**Deploy:** every push runs `.github/workflows/ci.yml` (typecheck, tests, build). Pushes to the default branch also deploy to GitHub Pages, at https://ayema24.github.io/chrome/ for this repo. Turn that on once under *Settings → Pages → Source: GitHub Actions*. The build uses relative paths, so it works from any sub-path or static host.

Your data (games, ratings, history) is stored privately in the browser's IndexedDB. Use *Settings → Export backup* to move it between devices.

### Regenerating the offline puzzle set
```bash
npx tsx scripts/generate-puzzles.ts 200   # self-play + Stockfish verification → src/data/puzzles.json
```
Each puzzle's solution is checked to be the engine's unique best move at depth 18. Mates must be forced, and material wins must hold up.

## Tech
React + TypeScript + Vite (PWA, works offline), [chess.js](https://github.com/jhlywa/chess.js) for the rules, [Stockfish 18](https://stockfishchess.org/) via [stockfish.js](https://github.com/nmrugg/stockfish.js) (lite single-threaded WASM, runs in Web Workers), and the public [Lichess](https://lichess.org/api) and [Chess.com](https://www.chess.com/news/view/published-data-api) APIs. If the Lichess opening explorer asks for authentication, add a free personal token in Settings.

## License
GPL-3.0-or-later (Stockfish is GPLv3). Piece set: Cburnett (Colin M.L. Burnett), BSD/GPL/GFDL tri-license.
