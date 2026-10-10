import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { type Arrow, type BoardMove, type BadgeKind } from './Board';
import type { Puzzle } from '../lib/puzzleTypes';
import { parseUci, moveToUci, sideToMove, uciLineToSan, formatLine } from '../lib/chess';
import { getEngine } from '../lib/engine';
import { lineToEval, moverWin } from '../lib/analysis';
import { themeLabel } from '../lib/motifs';
import { useCore } from '../lib/store';
import { sound, moveSound } from '../lib/sound';
import { navigate, setPending } from '../lib/router';

type Status = 'intro' | 'solving' | 'correct' | 'wrong' | 'solved' | 'failed';

interface Props {
  puzzle: Puzzle;
  /** Called once with the first-try result. */
  onResult: (success: boolean, ms: number) => void;
  onNext: () => void;
  showRating?: boolean;
}

export default function PuzzleSolver({ puzzle, onResult, onNext, showRating = true }: Props) {
  const core = useCore();
  const solverColor = sideToMove(puzzle.fen);
  const [fen, setFen] = useState(puzzle.fenBeforeSetup ?? puzzle.fen);
  const [step, setStep] = useState(0); // index into puzzle.moves of the next expected move
  const [status, setStatus] = useState<Status>(puzzle.fenBeforeSetup ? 'intro' : 'solving');
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [message, setMessage] = useState('');
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [highlights, setHighlights] = useState<Record<string, string>>({});
  const [showThemes, setShowThemes] = useState(false);
  const reported = useRef(false);
  const startedAt = useRef(Date.now());
  const [checking, setChecking] = useState(false);
  const [shake, setShake] = useState(0);
  const [glowKey, setGlowKey] = useState(0);
  const [badge, setBadge] = useState<{ square: string; kind: BadgeKind } | null>(null);
  // The real puzzle position (the displayed fen can briefly show a wrong move).
  const pos = useRef(puzzle.fen);

  // Reset on new puzzle
  // Bumped on every (re)start so stale timers from a previous attempt do nothing.
  const gen = useRef(0);
  const [retryKey, setRetryKey] = useState(0);
  const [isRetry, setIsRetry] = useState(false);

  // A new puzzle counts for your rating; a retry is practice only.
  useEffect(() => {
    reported.current = false;
    setIsRetry(false);
  }, [puzzle]);

  useEffect(() => {
    const g = ++gen.current;
    startedAt.current = Date.now();
    setStep(0);
    setArrows([]);
    setHighlights({});
    setMessage('');
    setShowThemes(false);
    setBadge(null);
    pos.current = puzzle.fen;
    if (puzzle.fenBeforeSetup && puzzle.setupMove) {
      setFen(puzzle.fenBeforeSetup);
      setLastMove(null);
      setStatus('intro');
      const t = setTimeout(() => {
        if (gen.current !== g) return;
        setFen(puzzle.fen);
        setLastMove([puzzle.setupMove!.slice(0, 2), puzzle.setupMove!.slice(2, 4)]);
        setStatus('solving');
        startedAt.current = Date.now();
      }, 700);
      return () => clearTimeout(t);
    }
    setFen(puzzle.fen);
    setLastMove(null);
    setStatus('solving');
  }, [puzzle, retryKey]);

  function retry() {
    setIsRetry(true);
    setRetryKey((k) => k + 1);
  }

  function report(success: boolean) {
    if (reported.current) return;
    reported.current = true;
    onResult(success, Date.now() - startedAt.current);
  }

  function playReply(afterFen: string, nextStep: number) {
    const reply = puzzle.moves[nextStep];
    if (!reply) return;
    const g = gen.current;
    setTimeout(() => {
      if (gen.current !== g) return;
      const c = new Chess(afterFen);
      const mv = c.move(parseUci(reply));
      moveSound(mv.san);
      pos.current = c.fen();
      setBadge(null);
      setFen(c.fen());
      setLastMove([mv.from, mv.to]);
      setStep(nextStep + 1);
      setStatus('solving');
    }, 450);
  }

  async function onMove(m: BoardMove) {
    if (status !== 'solving' && status !== 'correct' && status !== 'wrong') return;
    if (checking) return;
    const fen = pos.current;
    const chess = new Chess(fen);
    let mv;
    try {
      mv = chess.move(m);
    } catch {
      return;
    }
    const expected = puzzle.moves[step];
    const uci = moveToUci(mv);
    let ok = uci === expected || chess.isCheckmate();
    // For positions from your own games any move that keeps the advantage counts.
    if (!ok && puzzle.source === 'mistake') {
      setChecking(true);
      try {
        const [rb, ra] = [
          await getEngine().search(fen, { depth: 12 }),
          await getEngine().search(chess.fen(), { depth: 12 }),
        ];
        const drop = moverWin(lineToEval(rb.lines[0], fen), solverColor) - moverWin(lineToEval(ra.lines[0], chess.fen()), solverColor);
        ok = drop < 4;
      } catch {
        /* ignore */
      }
      setChecking(false);
    }
    setArrows([]);
    setHighlights({});
    if (ok) {
      moveSound(mv.san);
      pos.current = chess.fen();
      setFen(chess.fen());
      setLastMove([mv.from, mv.to]);
      const nextStep = step + 1;
      if (nextStep >= puzzle.moves.length || chess.isCheckmate() || (puzzle.source === 'mistake' && uci !== expected)) {
        setStatus('solved');
        setMessage(uci === expected ? 'Correct! Puzzle solved.' : 'That works too! Puzzle solved.');
        setBadge({ square: mv.to, kind: 'correct' });
        setGlowKey((k) => k + 1);
        setTimeout(() => sound.solved(), 120);
        report(true);
      } else {
        setStatus('correct');
        setBadge({ square: mv.to, kind: 'correct' });
        setTimeout(() => sound.good(), 100);
        setMessage('Good move! Keep going…');
        setStep(nextStep);
        playReply(chess.fen(), nextStep);
      }
    } else {
      sound.bad();
      // Show the wrong move briefly, then take it back.
      setFen(chess.fen());
      setLastMove([mv.from, mv.to]);
      setStatus('wrong');
      setShake((n) => n + 1);
      setBadge({ square: mv.to, kind: 'wrong' });
      setMessage(`${mv.san} is not the answer. Try again, or view the solution.`);
      report(false);
      setTimeout(() => {
        if (pos.current === fen) {
          setFen(fen);
          setLastMove(null);
          setBadge(null);
        }
      }, 600);
    }
  }

  function hint() {
    const expected = puzzle.moves[step];
    if (!expected) return;
    setHighlights({ [expected.slice(0, 2)]: 'rgba(60,140,240,0.55)' });
    report(false);
  }

  function showSolution() {
    report(false);
    setStatus('failed');
    // Animate the rest of the solution
    const fen = pos.current;
    let f = fen;
    let s = step;
    const moves = puzzle.moves;
    const g = gen.current;
    const play = () => {
      if (s >= moves.length || gen.current !== g) return;
      const c = new Chess(f);
      let mv;
      try {
        mv = c.move(parseUci(moves[s]));
      } catch {
        return;
      }
      moveSound(mv.san);
      f = c.fen();
      pos.current = f;
      setFen(f);
      setLastMove([mv.from, mv.to]);
      s++;
      setStep(s);
      if (s < moves.length) setTimeout(play, 700);
    };
    play();
    const sans = uciLineToSan(fen, moves.slice(step));
    setMessage(`Solution: ${formatLine(fen, sans)}`);
  }

  const done = status === 'solved' || status === 'failed';
  const toMove = solverColor === 'w' ? 'White' : 'Black';

  return (
    <div className="board-layout">
      <div>
        <Board
          fen={fen}
          orientation={solverColor}
          movable={!done && status !== 'intro' && !checking ? solverColor : null}
          onMove={onMove}
          lastMove={lastMove}
          arrows={arrows}
          highlights={highlights}
          badge={badge}
          shake={shake}
          glow={glowKey ? 'good' : null}
          glowKey={glowKey}
          theme={core.settings.boardTheme}
          showCoords={core.settings.showCoords}
        />
      </div>
      <div className="side-col">
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>{puzzle.title ?? `${toMove} to move`}</h2>
            <span className="spacer" />
            {showRating && <span className="pill">Rating {puzzle.rating}</span>}
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>
            {puzzle.source === 'mistake'
              ? `Find a better move than the one you played. ${toMove} to move.`
              : `Find the best move for ${toMove}.${puzzle.moves.length > 1 ? ' The puzzle continues until the tactic is complete.' : ''}`}
          </p>
          {isRetry && <p className="small" style={{ marginTop: 0 }}>↻ Practice attempt: this one doesn’t change your rating.</p>}
          {showThemes || done ? (
            <div className="row">
              {puzzle.themes
                .filter((t) => !['short', 'long', 'oneMove', 'veryLong', 'middlegame', 'opening', 'advantage', 'crushing'].includes(t))
                .map((t) => (
                  <span key={t} className="pill">
                    {themeLabel(t)}
                  </span>
                ))}
            </div>
          ) : (
            <button className="btn small" onClick={() => setShowThemes(true)}>
              Show theme
            </button>
          )}
        </div>
        {message && (
          <div className={`feedback ${status === 'solved' || status === 'correct' ? 'ok' : status === 'wrong' || status === 'failed' ? 'fail' : 'info'}`}>
            {checking ? 'Checking your move…' : message}
          </div>
        )}
        <div className="row">
          {!done && (
            <>
              <button className="btn" onClick={hint} disabled={status === 'intro'}>
                💡 Hint
              </button>
              <button className="btn" onClick={showSolution} disabled={status === 'intro' || status === 'correct'}>
                Show solution
              </button>
            </>
          )}
          {done && (
            <>
              <button className="btn" onClick={retry}>
                ↻ Retry
              </button>
              <button className="btn primary" onClick={onNext}>
                Next puzzle →
              </button>
            </>
          )}
          <span className="spacer" />
          <button
            className="btn small"
            onClick={() => {
              setPending({ fen: puzzle.fen });
              navigate('analysis', { fen: puzzle.fen });
            }}
          >
            Analyse
          </button>
          {puzzle.gameUrl && (
            <a className="btn small" href={puzzle.gameUrl} target="_blank" rel="noreferrer">
              Source game
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
