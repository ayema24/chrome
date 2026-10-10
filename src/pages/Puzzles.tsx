import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import PuzzleSolver from '../components/PuzzleSolver';
import Board, { type BoardMove } from '../components/Board';
import { useCore, recordPuzzle, reviewMistake, recordEndgame, getCore, type MistakeCard } from '../lib/store';
import { pickLocalPuzzle, localThemes, LOCAL_PUZZLES } from '../lib/puzzles';
import { fetchLichessPuzzle, fetchDailyPuzzle, LICHESS_DIFFICULTIES } from '../lib/db';
import { TRAINABLE_THEMES, themeLabel } from '../lib/motifs';
import { themeStats } from '../lib/insights';
import { navigate } from '../lib/router';
import type { Puzzle } from '../lib/puzzleTypes';
import { ENDGAMES, type EndgameDrill } from '../data/endgames';
import { getEngine, isCancelled } from '../lib/engine';
import { parseUci } from '../lib/chess';
import { moveSound, sound } from '../lib/sound';
import { fireConfetti } from '../lib/confetti';
import { TAG_LABEL, type MistakeTag } from '../lib/analysis';

type Mode = 'rated' | 'daily' | 'mistakes' | 'endgames';

export default function Puzzles({ params }: { params: Record<string, string> }) {
  const mode = (params.mode as Mode) || 'rated';
  const theme = params.theme || '';
  const setMode = (m: Mode) => navigate('puzzles', m === 'rated' ? (theme ? { theme } : {}) : { mode: m });
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Puzzles & drills</h1>
          <div className="muted">Pattern recognition is the fastest way to improve. Your rating and weak themes update after every puzzle.</div>
        </div>
        <div className="seg">
          {(
            [
              ['rated', 'Tactics'],
              ['daily', 'Daily'],
              ['mistakes', 'My mistakes'],
              ['endgames', 'Endgames'],
            ] as [Mode, string][]
          ).map(([m, l]) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {mode === 'rated' && <RatedPuzzles theme={theme} />}
      {mode === 'daily' && <DailyPuzzle />}
      {mode === 'mistakes' && <MistakeReview />}
      {mode === 'endgames' && <EndgameDrills initial={params.id} />}
    </div>
  );
}

function RatedPuzzles({ theme }: { theme: string }) {
  const core = useCore();
  const [online, setOnline] = useState(() => localStorage.getItem('cc-online-puzzles') === '1');
  const [difficulty, setDifficulty] = useState('normal');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState({ solved: 0, failed: 0, start: core.puzzleRating });

  const load = useCallback(
    async (excludeId?: string) => {
      setError('');
      if (online) {
        setLoading(true);
        try {
          setPuzzle(await fetchLichessPuzzle({ theme: theme || undefined, difficulty, token: getCore().settings.lichessToken || undefined }));
          setLoading(false);
          return;
        } catch (e) {
          setError(`${(e as Error).message}. Using the offline puzzle set instead.`);
        }
        setLoading(false);
      }
      const p = pickLocalPuzzle(getCore(), theme || undefined, excludeId);
      setPuzzle(p);
      if (!p) setError(theme ? `No offline puzzles for “${themeLabel(theme)}” yet – turn on Lichess puzzles for unlimited ones.` : 'No puzzles available.');
    },
    [online, theme, difficulty],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => themeStats(core), [core]);
  const themes = useMemo(() => {
    const local = new Map(localThemes().map((t) => [t.theme, t.count]));
    return TRAINABLE_THEMES.map((t) => ({ theme: t, count: local.get(t) ?? 0, stat: stats.find((s) => s.theme === t) }));
  }, [stats]);

  return (
    <div className="stack">
      <div className="card">
        <div className="row">
          <label className="field" style={{ minWidth: 200 }}>
            Theme
            <select value={theme} onChange={(e) => navigate('puzzles', e.target.value ? { theme: e.target.value } : {})}>
              <option value="">Mixed (adaptive)</option>
              {themes.map((t) => (
                <option key={t.theme} value={t.theme}>
                  {themeLabel(t.theme)}
                  {t.stat ? ` – ${Math.round(t.stat.rate * 100)}% of ${t.stat.attempts}` : ''}
                  {!online ? ` (${t.count} offline)` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="check" style={{ marginTop: 18 }}>
            <input
              type="checkbox"
              checked={online}
              onChange={(e) => {
                setOnline(e.target.checked);
                try {
                  localStorage.setItem('cc-online-puzzles', e.target.checked ? '1' : '0');
                } catch {
                  /* ignore */
                }
              }}
            />
            Use Lichess puzzle database (online, millions of puzzles)
          </label>
          {online && (
            <label className="field">
              Difficulty
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                {LICHESS_DIFFICULTIES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
          )}
          <span className="spacer" />
          <div className="stat" style={{ textAlign: 'right' }}>
            <span className="value">{core.puzzleRating}</span>
            <span className="label">
              Session: <span className="good">{session.solved}✓</span> <span className="bad">{session.failed}✗</span>{' '}
              {core.puzzleRating !== session.start && (
                <span className={core.puzzleRating > session.start ? 'good' : 'bad'}>
                  ({core.puzzleRating > session.start ? '+' : ''}
                  {core.puzzleRating - session.start})
                </span>
              )}
            </span>
          </div>
        </div>
        {!online && <div className="muted small" style={{ marginTop: 6 }}>{LOCAL_PUZZLES.length} verified offline puzzles included.</div>}
      </div>
      {error && <div className="notice">{error}</div>}
      {loading && <div className="muted">Loading puzzle…</div>}
      {puzzle && !loading && (
        <PuzzleSolver
          puzzle={puzzle}
          onResult={(ok, ms) => {
            recordPuzzle(puzzle, ok, ms);
            setSession((s) => ({ ...s, solved: s.solved + (ok ? 1 : 0), failed: s.failed + (ok ? 0 : 1) }));
          }}
          onNext={() => load(puzzle.id)}
        />
      )}
    </div>
  );
}

function DailyPuzzle() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchDailyPuzzle()
      .then(setPuzzle)
      .catch((e) => setError(`Could not load the Lichess daily puzzle (${(e as Error).message}). Are you online?`));
  }, []);
  if (error) return <div className="notice">{error}</div>;
  if (!puzzle) return <div className="muted">Loading the daily puzzle…</div>;
  return <PuzzleSolver puzzle={puzzle} onResult={(ok, ms) => recordPuzzle(puzzle, ok, ms)} onNext={() => navigate('puzzles')} />;
}

function MistakeReview() {
  const core = useCore();
  const due = core.mistakeDeck.filter((m) => m.due <= Date.now());
  const [current, setCurrent] = useState<MistakeCard | null>(null);
  const [allMode, setAllMode] = useState(false);

  useEffect(() => {
    if (!current) {
      const list = allMode ? core.mistakeDeck : due;
      setCurrent(list.length ? list[Math.floor(Math.random() * Math.min(list.length, 5))] : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, allMode]);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of core.mistakeDeck) for (const t of c.tags) if (t !== 'positional') m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [core.mistakeDeck]);

  if (core.mistakeDeck.length === 0)
    return (
      <div className="card">
        <h2>No mistakes collected yet</h2>
        <p className="muted">
          Every mistake and blunder you make in analysed games becomes a puzzle here, scheduled with spaced repetition until you stop making it. Play
          a game or import your online games to fill the deck.
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => navigate('play')}>
            Play a game
          </button>
          <button className="btn" onClick={() => navigate('games', { tab: 'import' })}>
            Import games
          </button>
        </div>
      </div>
    );

  return (
    <div className="stack">
      <div className="card">
        <div className="row">
          <strong>
            {due.length} due · {core.mistakeDeck.length} in deck
          </strong>
          <span className="spacer" />
          {tagCounts.slice(0, 4).map(([t, n]) => (
            <span key={t} className="pill">
              {TAG_LABEL[t as MistakeTag] ?? t}: {n}
            </span>
          ))}
        </div>
      </div>
      {current ? (
        <PuzzleSolver
          key={current.puzzle.id}
          puzzle={current.puzzle}
          showRating={false}
          onResult={(ok, ms) => {
            reviewMistake(current.puzzle.id, ok);
            recordPuzzle({ ...current.puzzle, source: 'mistake' }, ok, ms);
          }}
          onNext={() => setCurrent(null)}
        />
      ) : (
        <div className="card">
          <h2>All caught up 🎉</h2>
          <p className="muted">No mistakes are due right now. They come back on a schedule until you’ve fixed them.</p>
          <button className="btn" onClick={() => setAllMode(true)}>
            Practise the whole deck anyway
          </button>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- endgames

function EndgameDrills({ initial }: { initial?: string }) {
  const core = useCore();
  const [drill, setDrill] = useState<EndgameDrill | null>(() => ENDGAMES.find((e) => e.id === initial) ?? null);
  const results = useMemo(() => {
    const m = new Map<string, { ok: number; tries: number }>();
    for (const r of core.endgameResults) {
      const e = m.get(r.id) ?? { ok: 0, tries: 0 };
      e.tries++;
      if (r.success) e.ok++;
      m.set(r.id, e);
    }
    return m;
  }, [core.endgameResults]);

  if (drill) return <EndgameGame key={drill.id} drill={drill} onBack={() => setDrill(null)} />;
  return (
    <div className="opening-grid">
      {ENDGAMES.map((d) => {
        const r = results.get(d.id);
        return (
          <button key={d.id} className="card opening-card" onClick={() => setDrill(d)}>
            <div className="row">
              <strong>{d.title}</strong>
              <span className="spacer" />
              {r?.ok ? <span className="pill accent">✓ mastered</span> : r ? <span className="pill">{r.tries} tries</span> : null}
            </div>
            <div className="muted small">
              Goal: {d.goal === 'win' ? (d.promote ? 'promote / win' : 'checkmate') : `hold the draw for ${d.moves} moves`} · {d.level}
            </div>
            <div className="small">{d.tip}</div>
          </button>
        );
      })}
    </div>
  );
}

function EndgameGame({ drill, onBack }: { drill: EndgameDrill; onBack: () => void }) {
  const core = useCore();
  const userColor = drill.fen.split(' ')[1] as 'w' | 'b';
  const [moves, setMoves] = useState<Move[]>([]);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [msg, setMsg] = useState('');
  const [thinking, setThinking] = useState(false);
  const fen = moves.length ? moves[moves.length - 1].after : drill.fen;
  const userMoves = moves.filter((m) => m.color === userColor).length;
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      getEngine().stopAll();
    },
    [],
  );

  function end(success: boolean, text: string) {
    setStatus(success ? 'won' : 'lost');
    setMsg(text);
    recordEndgame(drill.id, success);
    setTimeout(() => {
      if (success) {
        sound.win();
        fireConfetti();
      } else sound.lose();
    }, 300);
  }

  function evaluate(list: Move[]): boolean {
    const last = list[list.length - 1];
    const c = new Chess(last.after);
    const byUser = last.color === userColor;
    const um = list.filter((m) => m.color === userColor).length;
    if (c.isCheckmate()) {
      end(byUser, byUser ? 'Checkmate – drill complete!' : 'You were checkmated.');
      return true;
    }
    if (last.promotion) {
      if (byUser && drill.goal === 'win' && drill.promote) {
        end(true, 'Pawn promoted – drill complete!');
        return true;
      }
      if (!byUser) {
        end(false, 'Your opponent promoted.');
        return true;
      }
    }
    if (c.isDraw() || c.isStalemate()) {
      end(drill.goal === 'draw', drill.goal === 'draw' ? 'Draw secured – well defended!' : c.isStalemate() ? 'Stalemate! Careful – leave the king a square.' : 'The game was drawn.');
      return true;
    }
    if (drill.goal === 'draw' && um >= (drill.moves ?? 30)) {
      end(true, `You held for ${um} moves – drill complete!`);
      return true;
    }
    if (drill.goal === 'win' && um >= 60) {
      end(false, 'Too many moves – try a more efficient technique.');
      return true;
    }
    return false;
  }

  async function onMove(m: BoardMove) {
    if (status !== 'playing' || thinking) return;
    const c = new Chess(fen);
    let mv: Move;
    try {
      mv = c.move(m);
    } catch {
      return;
    }
    moveSound(mv.san);
    const list = [...moves, mv];
    setMoves(list);
    if (evaluate(list)) return;
    setThinking(true);
    try {
      const r = await getEngine().search(mv.after, { depth: 18, movetime: 800 });
      if (!alive.current || !r.bestMove) return;
      const c2 = new Chess(mv.after);
      const reply = c2.move(parseUci(r.bestMove));
      moveSound(reply.san);
      const list2 = [...list, reply];
      setMoves(list2);
      evaluate(list2);
    } catch (e) {
      if (!isCancelled(e)) console.error(e);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="board-layout">
      <Board
        fen={fen}
        orientation={userColor}
        movable={status === 'playing' && !thinking && fen.split(' ')[1] === userColor ? userColor : null}
        onMove={onMove}
        lastMove={moves.length ? [moves[moves.length - 1].from, moves[moves.length - 1].to] : null}
        theme={core.settings.boardTheme}
        showCoords={core.settings.showCoords}
      />
      <div className="side-col">
        <div className="card">
          <h2>{drill.title}</h2>
          <p>
            <strong>Goal:</strong>{' '}
            {drill.goal === 'win' ? (drill.promote ? 'Promote your pawn (or mate).' : 'Deliver checkmate.') : `Don’t lose – hold for ${drill.moves} moves.`}{' '}
            You play {userColor === 'w' ? 'White' : 'Black'} against full-strength Stockfish.
          </p>
          <p className="muted small">💡 {drill.tip}</p>
          <div className="muted small">Moves played: {userMoves}</div>
        </div>
        {msg && <div className={`feedback ${status === 'won' ? 'ok' : 'fail'}`}>{msg}</div>}
        <div className="row">
          <button className="btn" onClick={onBack}>
            ← All drills
          </button>
          <button
            className="btn"
            onClick={() => {
              getEngine().stopAll();
              setMoves([]);
              setStatus('playing');
              setMsg('');
            }}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  );
}
