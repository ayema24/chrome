import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import Board, { type BoardMove, type Arrow } from '../components/Board';
import EvalBar from '../components/EvalBar';
import MoveList from '../components/MoveList';
import { getEngine, isCancelled, type SearchResult } from '../lib/engine';
import { lineToEval, reviewMove, CLASS_LABEL, TAG_LABEL, terminalEval, type Eval, type MoveAnalysis } from '../lib/analysis';
import { LEVELS, levelById, suggestLevel } from '../lib/levels';
import { START_FEN, isValidFen, parseUci, moveToUci } from '../lib/chess';
import { nameOpening, bookPositions } from '../lib/openings';
import { useCore, updateSettings, recordPlay, upsertGame, uid, type GameRecord } from '../lib/store';
import { enqueueAnalysis } from '../lib/analyzer';
import { navigate, takePending } from '../lib/router';
import { moveSound, sound } from '../lib/sound';
import { fireConfetti } from '../lib/confetti';

interface GameState {
  id: string;
  startFen: string;
  moves: Move[];
  userColor: 'w' | 'b';
  level: number;
  coach: boolean;
  hints: number;
  takebacks: number;
  reviews: Record<number, MoveAnalysis>;
  over: null | { result: GameRecord['result']; reason: string };
  saved: boolean;
}

// Keep the game alive when navigating between pages (and across reloads).
const SAVE_KEY = 'cc-current-game';
let savedGame: GameState | null = (() => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const g = raw ? (JSON.parse(raw) as GameState) : null;
    return g && !g.saved ? g : null;
  } catch {
    return null;
  }
})();

const COACH_DEPTH = 12;

export default function Play({ params }: { params: Record<string, string> }) {
  const core = useCore();
  const [game, setGame] = useState<GameState | null>(savedGame);
  const [setupFen, setSetupFen] = useState<string>(() => {
    const pending = takePending<{ fen: string }>();
    return pending?.fen ?? params.fen ?? '';
  });
  const [color, setColor] = useState<'w' | 'b' | 'random'>('w');
  const [thinking, setThinking] = useState(false);
  const [view, setView] = useState<number | null>(null); // browsing history
  const [hintArrow, setHintArrow] = useState<Arrow | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const evalCache = useRef(new Map<string, SearchResult>());
  const [liveEval, setLiveEval] = useState<Eval | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    savedGame = game;
    try {
      if (game && !game.saved) localStorage.setItem(SAVE_KEY, JSON.stringify(game));
      else localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [game]);

  // A restored game where it's the engine's turn needs a nudge.
  useEffect(() => {
    if (game && !game.over && !thinking && turn !== game.userColor) void engineMove(game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fen = game ? (game.moves.length ? game.moves[game.moves.length - 1].after : game.startFen) : START_FEN;
  const shownFen = game && view !== null ? (view === 0 ? game.startFen : game.moves[view - 1].after) : fen;
  const level = levelById(game?.level ?? core.settings.level);
  const turn = fen.split(' ')[1] as 'w' | 'b';
  const book = useMemo(() => bookPositions(), []);
  const opening = useMemo(() => (game ? nameOpening(game.moves.map((m) => m.after)) : null), [game]);

  const coachEval = useCallback(async (f: string): Promise<SearchResult | null> => {
    const hit = evalCache.current.get(f);
    if (hit) return hit;
    try {
      const r = await getEngine().search(f, { depth: COACH_DEPTH, multipv: 1 });
      evalCache.current.set(f, r);
      return r;
    } catch (e) {
      if (!isCancelled(e)) console.warn(e);
      return null;
    }
  }, []);

  // ------------------------------------------------------------ game flow
  function checkOver(g: GameState): GameState {
    const last = g.moves.length ? g.moves[g.moves.length - 1].after : g.startFen;
    const c = new Chess(last);
    if (!c.isGameOver()) return g;
    let result: GameRecord['result'] = '1/2-1/2';
    let reason = 'Draw';
    if (c.isCheckmate()) {
      result = c.turn() === 'w' ? '0-1' : '1-0';
      reason = 'Checkmate';
    } else if (c.isStalemate()) reason = 'Stalemate';
    else if (c.isThreefoldRepetition()) reason = 'Threefold repetition';
    else if (c.isInsufficientMaterial()) reason = 'Insufficient material';
    else reason = '50-move rule';
    return { ...g, over: { result, reason } };
  }

  const engineBusy = useRef(false);
  async function engineMove(g: GameState) {
    if (engineBusy.current) return;
    engineBusy.current = true;
    const f = g.moves.length ? g.moves[g.moves.length - 1].after : g.startFen;
    setThinking(true);
    const started = Date.now();
    try {
      const lv = levelById(g.level);
      const chess = new Chess(f);
      let uci: string | null = null;
      if (Math.random() < lv.randomness) {
        const legal = chess.moves({ verbose: true });
        uci = moveToUci(legal[Math.floor(Math.random() * legal.length)]);
      } else {
        const r = await getEngine().search(f, { depth: lv.depth, movetime: lv.movetime, skill: lv.skill });
        uci = r.bestMove;
      }
      const wait = 350 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (gameRef.current?.id !== g.id || !uci || gameRef.current.moves.length !== g.moves.length || gameRef.current.over) return;
      const mv = chess.move(parseUci(uci));
      moveSound(mv.san);
      let next: GameState = { ...gameRef.current!, moves: [...gameRef.current!.moves, mv] };
      next = checkOver(next);
      setGame(next);
      if (next.over) finish(next);
      else if (next.coach) {
        const r = await coachEval(mv.after);
        if (r && gameRef.current?.id === g.id) setLiveEval(lineToEval(r.lines[0], mv.after));
      }
    } catch (e) {
      if (!isCancelled(e)) console.error(e);
    } finally {
      engineBusy.current = false;
      setThinking(false);
    }
  }

  async function onUserMove(m: BoardMove) {
    if (!game || game.over || thinking || turn !== game.userColor || view !== null) return;
    const chess = new Chess(fen);
    let mv: Move;
    try {
      mv = chess.move(m);
    } catch {
      return;
    }
    moveSound(mv.san);
    setHintArrow(null);
    let next: GameState = { ...game, moves: [...game.moves, mv] };
    next = checkOver(next);
    setGame(next);
    if (next.over) {
      finish(next);
      return;
    }
    if (next.coach) {
      setThinking(true);
      const ply = next.moves.length - 1;
      const before = await coachEval(mv.before);
      const after = await coachEval(mv.after);
      if (before && after && gameRef.current?.id === next.id) {
        const evB = lineToEval(before.lines[0], mv.before);
        const evA = lineToEval(after.lines[0], mv.after);
        setLiveEval(evA);
        const review = reviewMove(mv, ply, evB, evA, before, after, { bookPlies: book, prev: gameRef.current.reviews[ply - 1] });
        if (review.cls === 'blunder' || review.cls === 'mistake') setTimeout(() => sound.alert(), 150);
        next = { ...gameRef.current!, reviews: { ...gameRef.current!.reviews, [ply]: review } };
        setGame(next);
      }
      setThinking(false);
    }
    await engineMove(next);
  }

  function finish(g: GameState) {
    if (g.saved || !g.over) return;
    const lv = levelById(g.level);
    const userWon = (g.over.result === '1-0' && g.userColor === 'w') || (g.over.result === '0-1' && g.userColor === 'b');
    const score: 0 | 0.5 | 1 = g.over.result === '1/2-1/2' ? 0.5 : userWon ? 1 : 0;
    setTimeout(() => {
      if (score === 1) {
        sound.win();
        fireConfetti();
      } else if (score === 0.5) sound.draw();
      else sound.lose();
    }, 350);
    setBannerOpen(true);
    const record = toRecord(g);
    upsertGame(record);
    // Games with lots of help don't count towards your rating.
    if (g.hints <= 2 && g.takebacks <= 2 && g.moves.length >= 6) recordPlay(g.level, lv.elo, score, g.id);
    if (core.settings.autoAnalyse) enqueueAnalysis([g.id], true);
    setGame({ ...g, saved: true });
  }

  function toRecord(g: GameState): GameRecord {
    const c = new Chess(g.startFen);
    if (g.startFen !== START_FEN) {
      c.setHeader('SetUp', '1');
      c.setHeader('FEN', g.startFen);
    }
    for (const m of g.moves) c.move(m.san);
    const lv = levelById(g.level);
    const you = 'You';
    const bot = `Stockfish ${lv.name} (${lv.elo})`;
    c.setHeader('Event', 'Chess Coach training game');
    c.setHeader('White', g.userColor === 'w' ? you : bot);
    c.setHeader('Black', g.userColor === 'b' ? you : bot);
    c.setHeader('Result', g.over?.result ?? '*');
    c.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
    return {
      id: g.id,
      source: 'play',
      pgn: c.pgn(),
      white: g.userColor === 'w' ? you : bot,
      black: g.userColor === 'b' ? you : bot,
      userColor: g.userColor,
      result: g.over?.result ?? '*',
      date: Date.now(),
      opening: nameOpening(g.moves.map((m) => m.after)),
      engineLevel: g.level,
    };
  }

  function start() {
    const startFen = setupFen && isValidFen(setupFen) ? setupFen : START_FEN;
    const userColor = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    const g: GameState = {
      id: uid('play-'),
      startFen,
      moves: [],
      userColor,
      level: core.settings.level,
      coach: core.settings.coach,
      hints: 0,
      takebacks: 0,
      reviews: {},
      over: null,
      saved: false,
    };
    evalCache.current.clear();
    sound.start();
    setBannerOpen(false);
    getEngine().newGame();
    setGame(g);
    setView(null);
    setLiveEval(null);
    setHintArrow(null);
    const sideToMove = startFen.split(' ')[1];
    if (sideToMove !== userColor) void engineMove(g);
    else if (g.coach) void coachEval(startFen).then((r) => r && setLiveEval(lineToEval(r.lines[0], startFen)));
  }

  function resign() {
    if (!game || game.over) return;
    getEngine().stopAll();
    const g = { ...game, over: { result: (game.userColor === 'w' ? '0-1' : '1-0') as GameRecord['result'], reason: 'You resigned' } };
    setGame(g);
    finish(g);
  }

  function takeback() {
    if (!game || game.over || thinking) return;
    const n = game.moves.length;
    // Undo back to the position before the user's last move.
    let k = 0;
    for (let i = n - 1; i >= 0; i--) {
      k++;
      if (game.moves[i].color === game.userColor) break;
    }
    if (k === 0 || n - k < 0) return;
    const reviews = { ...game.reviews };
    for (let i = n - k; i < n; i++) delete reviews[i];
    setGame({ ...game, moves: game.moves.slice(0, n - k), takebacks: game.takebacks + 1, reviews });
    setHintArrow(null);
  }

  async function hint() {
    if (!game || game.over || turn !== game.userColor) return;
    const r = await coachEval(fen);
    if (r?.bestMove) {
      setHintArrow({ from: r.bestMove.slice(0, 2), to: r.bestMove.slice(2, 4), color: 'b' });
      setGame((g) => (g ? { ...g, hints: g.hints + 1 } : g));
    }
  }

  // Terminal eval for display when the game ends
  useEffect(() => {
    if (game?.over) {
      const t = terminalEval(new Chess(fen));
      if (t) setLiveEval(t.mate === 0 ? { mate: (t.cp ?? 0) > 0 ? 1 : -1 } : t);
    }
  }, [game?.over, fen]);

  // ---------------------------------------------------------------- render
  if (!game) {
    const sugg = suggestLevel(core.playRating);
    return (
      <div className="stack" style={{ maxWidth: 720 }}>
        <div className="page-head">
          <div>
            <h1>Play</h1>
            <div className="muted">Spar with Stockfish. The coach reviews every move you make.</div>
          </div>
        </div>
        <div className="card stack">
          <div>
            <h3>Difficulty</h3>
            <input
              type="range"
              min={1}
              max={12}
              value={core.settings.level}
              onChange={(e) => updateSettings({ level: +e.target.value })}
              aria-label="Difficulty"
            />
            <div className="row">
              <strong>
                Level {level.id}: {level.name}
              </strong>
              <span className="muted">≈ {level.elo} rating</span>
              <span className="spacer" />
              {sugg.id !== level.id && (
                <button className="btn small" onClick={() => updateSettings({ level: sugg.id })}>
                  Suggested for you: {sugg.name}
                </button>
              )}
            </div>
            <div className="row" style={{ marginTop: 6, gap: 4 }}>
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  className={`btn small ${l.id === level.id ? 'primary' : ''}`}
                  onClick={() => updateSettings({ level: l.id })}
                  title={`${l.name} (${l.elo})`}
                >
                  {l.id}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3>Your colour</h3>
            <div className="seg">
              {(['w', 'random', 'b'] as const).map((c) => (
                <button key={c} className={color === c ? 'active' : ''} onClick={() => setColor(c)}>
                  {c === 'w' ? '♔ White' : c === 'b' ? '♚ Black' : '🎲 Random'}
                </button>
              ))}
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <label className="check">
              <input type="checkbox" checked={core.settings.coach} onChange={(e) => updateSettings({ coach: e.target.checked })} />
              <span>
                <strong>Coach mode</strong> – live feedback on every move, eval bar, hints and takebacks
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={core.settings.adaptive} onChange={(e) => updateSettings({ adaptive: e.target.checked })} />
              <span>
                <strong>Adaptive difficulty</strong> – level goes up when you win, down after two losses
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={core.settings.autoAnalyse} onChange={(e) => updateSettings({ autoAnalyse: e.target.checked })} />
              <span>
                <strong>Auto-analyse</strong> finished games and add your mistakes to your review deck
              </span>
            </label>
          </div>
          <label className="field">
            Start from a position (FEN, optional)
            <input type="text" value={setupFen} onChange={(e) => setSetupFen(e.target.value)} placeholder="Leave empty for the normal start position" />
          </label>
          {setupFen && !isValidFen(setupFen) && <div className="error">That FEN is not valid.</div>}
          <div>
            <button className="btn primary" onClick={start}>
              Start game
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lastMove = (() => {
    const idx = view ?? game.moves.length;
    const m = idx > 0 ? game.moves[idx - 1] : null;
    return m ? ([m.from, m.to] as [string, string]) : null;
  })();
  const lastReviewIdx = (() => {
    for (let i = game.moves.length - 1; i >= 0; i--) if (game.reviews[i]) return i;
    return -1;
  })();
  const shownReview = view !== null ? game.reviews[view - 1] : game.reviews[lastReviewIdx];
  const arrows: Arrow[] = [];
  if (hintArrow && view === null) arrows.push(hintArrow);
  if (shownReview && shownReview.best && shownReview.best !== shownReview.uci && (shownReview.cls === 'mistake' || shownReview.cls === 'blunder' || shownReview.cls === 'inaccuracy') && (view !== null || game.over)) {
    arrows.push({ from: shownReview.best.slice(0, 2), to: shownReview.best.slice(2, 4), color: 'g' });
  }
  const userTurn = !game.over && turn === game.userColor && view === null;
  // Quality badge on the square the reviewed move landed on
  const badgeReview = view !== null ? game.reviews[view - 1] : game.reviews[game.moves.length - 1] ?? game.reviews[game.moves.length - 2];
  const badgeMoveIdx = view !== null ? view - 1 : game.reviews[game.moves.length - 1] ? game.moves.length - 1 : game.moves.length - 2;
  const boardBadge =
    game.coach && badgeReview && game.moves[badgeMoveIdx]
      ? { square: game.moves[badgeMoveIdx].to, kind: badgeReview.cls }
      : null;
  const resultTitle = game.over
    ? game.over.result === '1/2-1/2'
      ? '½–½ Draw'
      : (game.over.result === '1-0') === (game.userColor === 'w')
        ? '🎉 You won!'
        : 'You lost'
    : '';
  const reviewList = Object.values(game.reviews);
  const counts = { inaccuracy: 0, mistake: 0, blunder: 0 } as Record<string, number>;
  for (const r of reviewList) if (r.cls in counts) counts[r.cls]++;

  return (
    <div className="board-layout">
      <div>
        <div className="player-strip">
          <span>
            {game.userColor === 'w' ? '♚' : '♔'} Stockfish · {level.name} ({level.elo})
          </span>
          <span className="muted">{thinking && turn !== game.userColor ? 'thinking…' : ''}</span>
        </div>
        <div className="board-col">
          {game.coach && <EvalBar ev={liveEval} orientation={game.userColor} />}
          <Board
            fen={shownFen}
            orientation={game.userColor}
            movable={userTurn && !thinking ? game.userColor : null}
            onMove={onUserMove}
            lastMove={lastMove}
            arrows={arrows}
            theme={core.settings.boardTheme}
            showCoords={core.settings.showCoords}
            badge={boardBadge}
            overlay={
              game.over && bannerOpen && view === null ? (
                <button className="result-banner" onClick={() => setBannerOpen(false)}>
                  <div className="big">{resultTitle}</div>
                  <div className="muted">{game.over.reason}</div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    Tap to see the board
                  </div>
                </button>
              ) : undefined
            }
          />
        </div>
        <div className="player-strip">
          <span>{game.userColor === 'w' ? '♔' : '♚'} You</span>
          <span className="muted">{userTurn ? 'your move' : ''}</span>
        </div>
      </div>

      <div className="side-col">
        <div className="card">
          <div className="row">
            <strong>{opening ?? 'Game in progress'}</strong>
            <span className="spacer" />
            {game.coach && <span className="pill accent">Coach on</span>}
          </div>
          {game.coach && (
            <div className="muted small" style={{ marginTop: 4 }}>
              This game: {counts.inaccuracy} inaccuracies · {counts.mistake} mistakes · {counts.blunder} blunders
              {game.hints ? ` · ${game.hints} hints` : ''}
            </div>
          )}
        </div>

        {game.over && (
          <div className="card feedback info">
            <h2 style={{ marginBottom: 4 }}>
              {game.over.result === '1/2-1/2'
                ? '½–½ Draw'
                : (game.over.result === '1-0') === (game.userColor === 'w')
                  ? '🎉 You won!'
                  : 'You lost'}
            </h2>
            <div className="muted">{game.over.reason}</div>
            {game.hints > 2 || game.takebacks > 2 ? (
              <div className="small muted">Not rated: too many hints/takebacks.</div>
            ) : null}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => navigate('analysis', { game: game.id })}>
                Full analysis
              </button>
              <button className="btn" onClick={start}>
                Rematch
              </button>
              <button
                className="btn"
                onClick={() => {
                  setGame(null);
                  savedGame = null;
                }}
              >
                New game
              </button>
            </div>
          </div>
        )}

        {game.coach && shownReview && (
          <div className={`card feedback ${['mistake', 'blunder'].includes(shownReview.cls) ? 'fail' : ['inaccuracy'].includes(shownReview.cls) ? '' : 'ok'}`}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className={`cls-badge ${shownReview.cls}`}>{CLASS_LABEL[shownReview.cls]}</span>
              <strong>{shownReview.san}</strong>
              {shownReview.tags
                .filter((t) => t !== 'positional')
                .map((t) => (
                  <span key={t} className="pill">
                    {TAG_LABEL[t]}
                  </span>
                ))}
            </div>
            <div className="small">{shownReview.explanation}</div>
            {!game.over && view === null && ['mistake', 'blunder'].includes(shownReview.cls) && (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn small" onClick={takeback} disabled={thinking}>
                  ↶ Take back and try again
                </button>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <MoveList
            moves={game.moves.map((m, i) => ({ san: m.san, cls: game.reviews[i]?.cls }))}
            current={view ?? game.moves.length}
            onSelect={(i) => setView(i === game.moves.length ? null : i)}
            startsWithBlack={game.startFen.split(' ')[1] === 'b'}
            startMoveNumber={parseInt(game.startFen.split(' ')[5] ?? '1', 10)}
          />
          {view !== null && (
            <button className="btn small" style={{ marginTop: 8 }} onClick={() => setView(null)}>
              Back to the game
            </button>
          )}
        </div>

        {!game.over && (
          <div className="row">
            {game.coach && (
              <>
                <button className="btn" onClick={hint} disabled={!userTurn || thinking}>
                  💡 Hint
                </button>
                <button className="btn" onClick={takeback} disabled={thinking || game.moves.length === 0}>
                  ↶ Takeback
                </button>
              </>
            )}
            <span className="spacer" />
            <button className="btn danger" onClick={resign}>
              Resign
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
