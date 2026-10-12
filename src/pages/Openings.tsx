import { useEffect, useMemo, useRef, useState } from 'react';
import Board, { type Arrow, type BoardMove } from '../components/Board';
import { NavButtons } from '../components/MoveList';
import Explorer from '../components/Explorer';
import EngineSuggest, { rateMove, CLASS_LABEL, type Verdict } from '../components/EngineSuggest';
import { OPENINGS, type OpeningDef } from '../data/openings';
import { linesFor, type ParsedLine } from '../lib/openings';
import { useCore, updateCore, recordLineDrill, getCore } from '../lib/store';
import {
  cardKey,
  naturalSide,
  lineStatus,
  openingProgress,
  nextStepText,
  LINE_STATUS_LABEL,
  OPENING_STATUS_LABEL,
  type OpeningStatus,
} from '../lib/mastery';
import { navigate, setPending } from '../lib/router';
import { buildOpeningReport } from '../lib/openingReport';
import { useGames } from '../lib/store';
import { tryUci } from '../lib/chess';
import { moveSound, sound } from '../lib/sound';
import { fireConfetti } from '../lib/confetti';
import { Chess, type Move } from 'chess.js';


function repertoireSlot(o: OpeningDef): 'white' | 'vsE4' | 'vsD4' | null {
  if (o.side === 'w') return 'white';
  const first = linesFor(o.id)[0]?.sans[0];
  return first === 'e4' ? 'vsE4' : first === 'd4' ? 'vsD4' : null;
}

const SLOT_LABEL = { white: 'My White opening', vsE4: 'My defence vs 1.e4', vsD4: 'My defence vs 1.d4' };

export default function Openings({ params }: { params: Record<string, string> }) {
  if (params.mode === 'review') return <ReviewQueue />;
  if (params.mode === 'report') return <OpeningReportView />;
  if (params.id) {
    const o = OPENINGS.find((x) => x.id === params.id);
    if (o) return <OpeningDetail o={o} lineIndex={params.line ? +params.line : null} mode={(params.mode as 'learn' | 'practice') ?? 'learn'} />;
  }
  return <OpeningList search={params.search ?? ''} />;
}

function OpeningList({ search: initialSearch }: { search: string }) {
  const core = useCore();
  const [side, setSide] = useState<'all' | 'w' | 'b'>('all');
  const [cat, setCat] = useState<'all' | 'opening' | 'gambit' | 'trap'>('all');
  const [search, setSearch] = useState(initialSearch);
  const due = Object.values(core.lineCards).filter((c) => c.due <= Date.now());
  const list = OPENINGS.filter(
    (o) =>
      (side === 'all' || o.side === side) &&
      (cat === 'all' || o.category === cat) &&
      (!search || `${o.name} ${o.summary} ${o.eco}`.toLowerCase().includes(search.toLowerCase().split(':')[0].trim())),
  );
  const progress = (o: OpeningDef) => openingProgress(core, o);
  const masteredCount = OPENINGS.filter((o) => openingProgress(core, o).status === 'mastered').length;
  const learnedCount = OPENINGS.filter((o) => ['learned', 'mastered'].includes(openingProgress(core, o).status)).length;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Openings & gambits</h1>
          <div className="muted">Learn the ideas move by move, then drill the lines until they stick. Lines come back for review on a schedule.</div>
        </div>
        <button className="btn" onClick={() => navigate('openings', { mode: 'report' })}>
          📊 My games report
        </button>
        {due.length > 0 && (
          <button className="btn primary" onClick={() => navigate('openings', { mode: 'review' })}>
            Review {due.length} due line{due.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className="card">
        <h3>Your repertoire</h3>
        <div className="grid-3">
          {(['white', 'vsE4', 'vsD4'] as const).map((slot) => {
            const id = core.repertoire[slot];
            const o = id ? OPENINGS.find((x) => x.id === id) : null;
            return (
              <div key={slot} className="notice">
                <div className="muted small">{SLOT_LABEL[slot]}</div>
                {o ? (
                  <button className="btn small" style={{ marginTop: 4 }} onClick={() => navigate('openings', { id: o.id })}>
                    {o.name}
                  </button>
                ) : (
                  <div className="small">Not chosen – pick one below</div>
                )}
              </div>
            );
          })}
        </div>
        <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
          Tip: club players improve fastest with a small, solid repertoire. Good starter set: Italian Game (White), Caro-Kann (vs 1.e4), Queen’s
          Gambit Declined or Nimzo-Indian (vs 1.d4).
        </p>
      </div>

      <div className="row">
        <div className="seg">
          {(['all', 'w', 'b'] as const).map((s) => (
            <button key={s} className={side === s ? 'active' : ''} onClick={() => setSide(s)}>
              {s === 'all' ? 'All' : s === 'w' ? 'For White' : 'For Black'}
            </button>
          ))}
        </div>
        <div className="seg">
          {(['all', 'opening', 'gambit', 'trap'] as const).map((c) => (
            <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)}>
              {c === 'all' ? 'Everything' : c === 'opening' ? 'Openings' : c === 'gambit' ? 'Gambits' : 'Traps'}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 220 }} />
      </div>

      {(learnedCount > 0 || masteredCount > 0) && (
        <div className="muted small">
          🎓 {learnedCount} opening{learnedCount === 1 ? '' : 's'} learned · 🏆 {masteredCount} mastered
        </div>
      )}
      <div className="opening-grid">
        {list.map((o) => {
          const p = progress(o);
          return (
            <button key={o.id} className="card opening-card" onClick={() => navigate('openings', { id: o.id })}>
              <div className="row">
                <strong>{o.name}</strong>
                <span className="spacer" />
                <span className="pill">{o.side === 'w' ? 'White' : 'Black'}</span>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <span className="pill">{o.category}</span>
                <span className="pill">{o.level}</span>
                <span className="pill">{o.eco}</span>
                {Object.values(core.repertoire).includes(o.id) && <span className="pill accent">★ repertoire</span>}
                {(p.status === 'learned' || p.status === 'mastered') && <StatusPill status={p.status} />}
              </div>
              <div className="muted small">{o.summary}</div>
              <div className={`progressbar ${p.status === 'mastered' ? 'done' : ''}`} style={{ marginTop: 'auto' }}>
                <div style={{ width: `${((p.learned + p.mastered) / (2 * p.total)) * 100}%` }} />
              </div>
              <div className="muted small">
                {p.learned}/{p.total} lines learned · {p.mastered} mastered
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OpeningDetail({ o, lineIndex, mode }: { o: OpeningDef; lineIndex: number | null; mode: 'learn' | 'practice' }) {
  const core = useCore();
  const lines = useMemo(() => linesFor(o.id), [o.id]);
  const slot = repertoireSlot(o);
  const inRep = slot !== null && core.repertoire[slot] === o.id;
  const sel = lineIndex !== null ? lines[lineIndex] : null;
  const prog = openingProgress(core, o);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <button className="btn small" onClick={() => navigate('openings')}>
            ← All openings
          </button>
          <h1 style={{ marginTop: 8 }}>
            {o.name} {prog.status !== 'new' && <StatusPill status={prog.status} />}
          </h1>
          <div className="muted">
            {o.eco} · {o.category} · {o.level} · {prog.learned}/{prog.total} lines learned · {prog.mastered} mastered
          </div>
        </div>
        {o.category !== 'trap' && slot && (
          <button
            className={`btn ${inRep ? '' : 'primary'}`}
            onClick={() =>
              updateCore((c) => {
                if (slot) c.repertoire[slot] = inRep ? null : o.id;
              })
            }
          >
            {inRep ? '★ In your repertoire' : `Add as “${SLOT_LABEL[slot!]}”`}
          </button>
        )}
      </div>

      {!sel && (
        <div className="grid-2">
          <div className="card">
            <p>{o.summary}</p>
            <h3>Key ideas</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {o.ideas.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Lines</h3>
            {lines.map((l) => {
              const card = core.lineCards[cardKey(o.id, l.lineIndex, naturalSide(o, l))];
              const st = lineStatus(card);
              const done = st === 'learned' || st === 'mastered';
              return (
                <div key={l.lineIndex} className="task">
                  <div className="tick" style={done ? { background: st === 'mastered' ? '#d9a21b' : 'var(--good)', borderColor: 'transparent', color: 'white' } : {}}>
                    {st === 'mastered' ? '🏆' : done ? '✓' : ''}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {l.name} <span className={`pill status-${st}`}>{LINE_STATUS_LABEL[st]}</span>
                    </div>
                    <div className="muted small">
                      {l.sans.length} moves{card ? ` · practised ${card.reps}×` : ''} · {nextStepText(card)}
                    </div>
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn small" onClick={() => navigate('openings', { id: o.id, line: String(l.lineIndex), mode: 'learn' })}>
                      Learn
                    </button>
                    <button className="btn small primary" onClick={() => navigate('openings', { id: o.id, line: String(l.lineIndex), mode: 'practice' })}>
                      Drill
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sel && mode === 'learn' && <LearnLine o={o} line={sel} />}
      {sel && mode === 'practice' && <PracticeLine o={o} line={sel} />}
    </div>
  );
}

function LearnLine({ o, line }: { o: OpeningDef; line: ParsedLine }) {
  const core = useCore();
  const [idx, setIdx] = useState(0);
  const [orientation, setOrientation] = useState<'w' | 'b'>(naturalSide(o, line));
  const [explore, setExplore] = useState<string | null>(null); // free exploration fen
  const [bestArrow, setBestArrow] = useState<string | null>(null);
  useEffect(() => {
    setIdx(0);
    setExplore(null);
  }, [line]);
  useEffect(() => {
    updateCore((c) => {
      c.lessonsViewed[`${o.id}#${line.lineIndex}`] = Date.now();
    });
  }, [o.id, line.lineIndex]);
  useEffect(() => {
    if (idx > 0 && !explore) moveSound(line.sans[idx - 1]);
  }, [idx, explore, line.sans]);

  const fen = explore ?? line.fens[idx];
  const lastMove = idx > 0 && !explore ? ([line.ucis[idx - 1].slice(0, 2), line.ucis[idx - 1].slice(2, 4)] as [string, string]) : null;
  const next = line.ucis[idx];
  const arrows: Arrow[] = next && !explore ? [{ from: next.slice(0, 2), to: next.slice(2, 4), color: 'g' }] : [];
  if (explore && bestArrow) arrows.push({ from: bestArrow.slice(0, 2), to: bestArrow.slice(2, 4), color: 'b' });
  const comment = idx === 0 ? line.intro || o.summary : line.comments[idx - 1];

  function onMove(m: BoardMove) {
    const uci = m.from + m.to + (m.promotion ?? '');
    if (!explore && uci === next) {
      setIdx(idx + 1);
      return;
    }
    const r = tryUci(fen, uci);
    if (r) {
      moveSound(r.move.san);
      setExplore(r.chess.fen());
    }
  }

  return (
    <div className="board-layout">
      <div>
        <Board
          fen={fen}
          orientation={orientation}
          movable="both"
          onMove={onMove}
          lastMove={lastMove}
          arrows={arrows}
          theme={core.settings.boardTheme}
          showCoords={core.settings.showCoords}
        />
        <div className="nav-dock">
          <NavButtons
            index={idx}
            max={line.sans.length}
            onChange={(i) => {
              setExplore(null);
              setIdx(i);
            }}
          />
        </div>
      </div>
      <div className="side-col">
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>{line.name}</h2>
            <span className="spacer" />
            <button className="btn small" onClick={() => setOrientation(orientation === 'w' ? 'b' : 'w')}>
              ⇅ Flip
            </button>
          </div>
          <div className="small" style={{ marginTop: 8, lineHeight: 1.9 }}>
            {line.sans.map((s, i) => (
              <span key={i}>
                {i % 2 === 0 && <span className="muted">{i / 2 + 1}. </span>}
                <button
                  className={`mv ${idx === i + 1 && !explore ? 'active' : ''}`}
                  onClick={() => {
                    setExplore(null);
                    setIdx(i + 1);
                  }}
                >
                  {s}
                </button>{' '}
              </span>
            ))}
          </div>
        </div>
        <div className="comment-box">
          {explore ? (
            <>
              <strong>Exploring your own move.</strong> <span className="muted">The engine’s best move is the blue arrow; the database below shows what masters play.</span>{' '}
              <button className="btn small" onClick={() => setExplore(null)}>
                Back to the line
              </button>
            </>
          ) : (
            <>
              {idx > 0 && <strong>{line.sans[idx - 1]} </strong>}
              {comment || <span className="muted">Play the green arrow move, or use ▶ to step through.</span>}
            </>
          )}
        </div>
        {explore && (
          <EngineSuggest
            fen={explore}
            onBest={setBestArrow}
            onPlay={(uci) => {
              const r = tryUci(explore, uci);
              if (r) {
                moveSound(r.move.san);
                setExplore(r.chess.fen());
              }
            }}
          />
        )}
        {idx === line.sans.length && !explore && (
          <div className="feedback ok">
            End of the line.{' '}
            <button className="btn small primary" onClick={() => navigate('openings', { id: o.id, line: String(line.lineIndex), mode: 'practice' })}>
              Now drill it from memory →
            </button>{' '}
            <button
              className="btn small"
              onClick={() => {
                setPending({ fen: line.fens[line.fens.length - 1], color: naturalSide(o, line) });
                navigate('play');
              }}
            >
              ♟ Play the middlegame from here
            </button>
          </div>
        )}
        <div className="card">
          <h3>Database</h3>
          <Explorer
            fen={fen}
            onMove={(uci) => {
              const r = tryUci(fen, uci);
              if (!r) return;
              if (!explore && uci === next) setIdx(idx + 1);
              else setExplore(r.chess.fen());
            }}
          />
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: OpeningStatus }) {
  return <span className={`pill status-${status}`}>{OPENING_STATUS_LABEL[status]}</span>;
}

function PracticeLine({ o, line, onDone, forceColor }: { o: OpeningDef; line: ParsedLine; onDone?: () => void; forceColor?: 'w' | 'b' }) {
  const core = useCore();
  const [color, setColor] = useState<'w' | 'b'>(forceColor ?? naturalSide(o, line));
  const [idx, setIdx] = useState(0);
  const [mistakes, setMistakes] = useState<number[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'fail' | 'info'; text: string } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const [shake, setShake] = useState(0);
  const [celebrate, setCelebrate] = useState<OpeningStatus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Play both sides": the user also moves for the opponent and can try alternatives.
  const [bothSides, setBothSides] = useState(() => {
    try {
      return localStorage.getItem('cc-drill-both') === '1';
    } catch {
      return false;
    }
  });
  const bothRef = useRef(bothSides);
  bothRef.current = bothSides;
  const [offBook, setOffBook] = useState<{ startIdx: number; moves: Move[] } | null>(null);
  const [verdict, setVerdict] = useState<{ san: string; book: string; side: string; v: Verdict | null } | null>(null);
  const [bestArrow, setBestArrow] = useState<string | null>(null);

  // Trap lines end with a blunder by the "victim" – stop before the opponent’s mistake is required from the user.
  const userPlies = useMemo(() => line.ucis.map((_, i) => (i % 2 === 0 ? 'w' : 'b') === color), [line, color]);

  useEffect(() => {
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, color]);

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setIdx(0);
    setMistakes([]);
    setFinished(false);
    setShowAnswer(false);
    setOffBook(null);
    setVerdict(null);
    setCelebrate(null);
    setMsg({ kind: 'info', text: `You play ${color === 'w' ? 'White' : 'Black'}. Play the moves of the line from memory.` });
    if (!userPlies[0]) opponentTurn(0);
  }

  /** Opponent to move: auto-play the book move, or let the user choose in both-sides mode. */
  function opponentTurn(i: number) {
    if (bothRef.current) {
      setMsg({
        kind: 'info',
        text: `Now move for your opponent. The book move ${line.sans[i]} is shown in yellow – or try a different move to learn how to punish it.`,
      });
    } else autoPlay(i);
  }

  function toggleBoth(on: boolean) {
    setBothSides(on);
    bothRef.current = on;
    try {
      localStorage.setItem('cc-drill-both', on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!on && !offBook && !finished && !userPlies[idx]) autoPlay(idx);
    else if (on && !offBook && !finished && !userPlies[idx]) {
      if (timer.current) clearTimeout(timer.current);
      opponentTurn(idx);
    }
  }

  function backToLine() {
    if (!offBook) return;
    const i = offBook.startIdx;
    setOffBook(null);
    setVerdict(null);
    setBestArrow(null);
    setIdx(i);
    if (!userPlies[i]) opponentTurn(i);
  }

  function offBookMove(uci: string) {
    if (!offBook) return;
    const cur = offBook.moves.length ? offBook.moves[offBook.moves.length - 1].after : line.fens[offBook.startIdx];
    const r = tryUci(cur, uci);
    if (!r) return;
    moveSound(r.move.san);
    setOffBook({ ...offBook, moves: [...offBook.moves, r.move] });
  }

  function autoPlay(from: number) {
    timer.current = setTimeout(() => {
      setIdx(from + 1);
      moveSound(line.sans[from]);
      if (from + 1 >= line.ucis.length) complete(mistakesRef.current);
    }, 450);
  }
  const mistakesRef = useRef<number[]>([]);
  mistakesRef.current = mistakes;

  function complete(ms: number[]) {
    setFinished(true);
    const key = cardKey(o.id, line.lineIndex, color);
    const counts = color === naturalSide(o, line); // the opening's own side drives mastery
    const before = lineStatus(getCore().lineCards[key]);
    const openingBefore = openingProgress(getCore(), o).status;
    recordLineDrill(key, ms, userPlies.filter(Boolean).length);
    const card = getCore().lineCards[key];
    const after = lineStatus(card);
    const openingAfter = openingProgress(getCore(), o).status;
    const next = nextStepText(card);
    if (ms.length > 0) {
      setMsg({
        kind: 'fail',
        text: `Line completed with ${ms.length} mistake${ms.length > 1 ? 's' : ''}.${before !== after ? ` Status: ${LINE_STATUS_LABEL[after]}.` : ''} It comes back tomorrow. ${next}`,
      });
      return;
    }
    if (counts && openingAfter !== openingBefore && (openingAfter === 'mastered' || openingAfter === 'learned')) {
      sound.win();
      fireConfetti();
      setCelebrate(openingAfter);
      setMsg({
        kind: 'ok',
        text:
          openingAfter === 'mastered'
            ? `🏆 You’ve MASTERED the ${o.name}! Every line survived a spaced review. Keep it fresh with the occasional check-up.`
            : `🎓 You’ve learned every line of the ${o.name}! Review each line when it’s due to master the opening.`,
      });
      return;
    }
    sound.solved();
    fireConfetti(90);
    if (after === 'mastered' && before !== 'mastered') setMsg({ kind: 'ok', text: `🏆 Line mastered! ${next}` });
    else if (after === 'learned' && before !== 'learned' && before !== 'mastered') setMsg({ kind: 'ok', text: `🎓 Line learned! ${next}` });
    else if (before === after && (after === 'learned' || after === 'mastered'))
      setMsg({ kind: 'ok', text: `Perfect again! Extra practice doesn’t move you up – only on-schedule reviews do. ${next}` });
    else setMsg({ kind: 'ok', text: `Perfect! ${next}` });
  }

  function onMove(m: BoardMove) {
    const uci = m.from + m.to + (m.promotion ?? '');
    if (offBook) {
      offBookMove(uci);
      return;
    }
    if (finished) return;
    const expected = line.ucis[idx];
    if (!userPlies[idx]) {
      if (!bothSides) return;
      if (uci === expected) {
        moveSound(line.sans[idx]);
        const nextIdx = idx + 1;
        setIdx(nextIdx);
        if (nextIdx >= line.ucis.length) complete(mistakes);
        else setMsg({ kind: 'info', text: `Book move ${line.sans[idx]}. Your turn.` });
        return;
      }
      // The opponent deviates from the book: switch to engine-guided exploration.
      const r = tryUci(line.fens[idx], uci);
      if (!r) return;
      moveSound(r.move.san);
      const side = r.move.color === 'w' ? 'White' : 'Black';
      setOffBook({ startIdx: idx, moves: [r.move] });
      setVerdict({ san: r.move.san, book: line.sans[idx], side, v: null });
      setMsg({ kind: 'info', text: `${side} played ${r.move.san} instead of the book move ${line.sans[idx]}. You’re off the book – the engine shows the best reply.` });
      void rateMove(line.fens[idx], r.move.after).then((v) => setVerdict((cur) => (cur && cur.san === r.move.san ? { ...cur, v } : cur)));
      return;
    }
    if (uci === expected) {
      moveSound(line.sans[idx]);
      setShowAnswer(false);
      const c = line.comments[idx];
      setMsg({ kind: 'ok', text: `✓ ${line.sans[idx]}${c ? ` – ${c}` : ''}` });
      const nextIdx = idx + 1;
      setIdx(nextIdx);
      if (nextIdx >= line.ucis.length) complete(mistakes);
      else if (!userPlies[nextIdx]) opponentTurn(nextIdx);
    } else {
      sound.bad();
      setShake((n) => n + 1);
      const played = tryUci(line.fens[idx], uci);
      const ms = mistakes.includes(idx) ? mistakes : [...mistakes, idx];
      setMistakes(ms);
      setShowAnswer(true);
      setMsg({
        kind: 'fail',
        text: `${played?.move.san ?? 'That'} is not the move in this line. The move is ${line.sans[idx]}${line.comments[idx] ? ` – ${line.comments[idx]}` : ''}. Play it to continue.`,
      });
    }
  }

  const offLast = offBook && offBook.moves.length ? offBook.moves[offBook.moves.length - 1] : null;
  const fen = offBook ? (offLast ? offLast.after : line.fens[offBook.startIdx]) : line.fens[idx];
  const expected = line.ucis[idx];
  const arrows: Arrow[] = [];
  if (offBook) {
    if (bestArrow) arrows.push({ from: bestArrow.slice(0, 2), to: bestArrow.slice(2, 4), color: 'b' });
  } else if (expected && (showAnswer || (bothSides && !userPlies[idx] && !finished))) {
    arrows.push({ from: expected.slice(0, 2), to: expected.slice(2, 4), color: userPlies[idx] ? 'g' : 'y' });
  }
  const last: [string, string] | null = offLast
    ? [offLast.from, offLast.to]
    : idx > 0
      ? [line.ucis[idx - 1].slice(0, 2), line.ucis[idx - 1].slice(2, 4)]
      : null;
  const turn = new Chess(fen).turn();
  const movable = offBook ? 'both' : finished ? null : userPlies[idx] && turn === color ? color : bothSides && !userPlies[idx] ? turn : null;

  return (
    <div className="board-layout">
      <Board
        fen={fen}
        orientation={color}
        movable={movable}
        overlay={
          celebrate ? (
            <button className="result-banner" onClick={() => setCelebrate(null)}>
              <div className="big">{celebrate === 'mastered' ? '🏆 Opening mastered!' : '🎓 Opening learned!'}</div>
              <div className="muted">{o.name}</div>
              <div className="small muted" style={{ marginTop: 6 }}>
                Tap to close
              </div>
            </button>
          ) : undefined
        }
        onMove={onMove}
        lastMove={last}
        arrows={arrows}
        shake={shake}
        badge={
          offBook
            ? offBook.moves.length === 1 && verdict?.v
              ? { square: offBook.moves[0].to, kind: verdict.v.cls }
              : null
            : idx > 0 && userPlies[idx - 1] && !showAnswer
              ? { square: line.ucis[idx - 1].slice(2, 4), kind: 'correct' }
              : null
        }
        theme={core.settings.boardTheme}
        showCoords={core.settings.showCoords}
      />
      <div className="side-col">
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>Drill: {line.name}</h2>
            <span className="spacer" />
            <div className="seg">
              <button className={color === 'w' ? 'active' : ''} onClick={() => setColor('w')}>
                White
              </button>
              <button className={color === 'b' ? 'active' : ''} onClick={() => setColor('b')}>
                Black
              </button>
            </div>
          </div>
          <div className="progressbar" style={{ marginTop: 10 }}>
            <div style={{ width: `${(idx / line.ucis.length) * 100}%` }} />
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>
            Move {Math.ceil(idx / 2)} of {Math.ceil(line.ucis.length / 2)} · {mistakes.length} mistake{mistakes.length === 1 ? '' : 's'}
          </div>
          <label className="check small" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={bothSides} onChange={(e) => toggleBoth(e.target.checked)} />
            <span>
              <strong>I play the opponent too</strong> – try other moves for the opponent and see the engine’s best answer
            </span>
          </label>
        </div>
        {msg && <div className={`feedback ${msg.kind}`}>{msg.text}</div>}
        {offBook && verdict && (
          <div className="card">
            <div className="row">
              <strong>
                {verdict.side}’s alternative {verdict.san}
              </strong>
              {verdict.v ? (
                <span className={`cls-badge ${verdict.v.cls}`}>{verdict.v.cls === 'best' ? 'As good as the book' : CLASS_LABEL[verdict.v.cls]}</span>
              ) : (
                <span className="muted small">rating it…</span>
              )}
            </div>
            {verdict.v && (
              <div className="small muted" style={{ marginTop: 4 }}>
                Evaluation after the book move {verdict.book}: {verdict.v.before} · after {verdict.san}: {verdict.v.after}
                {['mistake', 'blunder', 'inaccuracy'].includes(verdict.v.cls) ? ' – find the move that punishes it!' : ''}
              </div>
            )}
          </div>
        )}
        {offBook && <EngineSuggest fen={fen} onBest={setBestArrow} onPlay={offBookMove} />}
        <div className="row">
          {offBook && (
            <>
              <button className="btn primary" onClick={backToLine}>
                ↩ Back to the line
              </button>
              <button
                className="btn"
                disabled={offBook.moves.length <= 1}
                onClick={() => setOffBook({ ...offBook, moves: offBook.moves.slice(0, -1) })}
              >
                ↶ Undo
              </button>
            </>
          )}
          {!finished && !offBook && (
            <button
              className="btn"
              onClick={() => {
                setShowAnswer(true);
                if (!mistakes.includes(idx)) setMistakes([...mistakes, idx]);
              }}
            >
              💡 Show move
            </button>
          )}
          <button className="btn" onClick={reset}>
            Restart
          </button>
          {finished && onDone && (
            <button className="btn primary" onClick={onDone}>
              Next →
            </button>
          )}
          {finished && !onDone && (
            <button className="btn" onClick={() => navigate('openings', { id: o.id, line: String(line.lineIndex), mode: 'learn' })}>
              Study the line again
            </button>
          )}
          {finished && (
            <button
              className="btn"
              onClick={() => {
                setPending({ fen: line.fens[line.fens.length - 1], color });
                navigate('play');
              }}
            >
              ♟ Play on vs engine
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewQueue() {
  const core = useCore();
  const [queue] = useState(() =>
    Object.values(core.lineCards)
      .filter((c) => c.due <= Date.now())
      .sort((a, b) => a.due - b.due),
  );
  const [i, setI] = useState(0);
  const card = queue[i];
  if (!card)
    return (
      <div className="card">
        <h2>Review complete 🎉</h2>
        <p className="muted">All due opening lines are done. Come back tomorrow – spaced repetition works best a little every day.</p>
        <button className="btn" onClick={() => navigate('openings')}>
          Back to openings
        </button>
      </div>
    );
  const [oid, li, color] = card.key.split('#');
  const o = OPENINGS.find((x) => x.id === oid)!;
  const line = linesFor(oid)[+li];
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Opening review</h1>
          <div className="muted">
            {i + 1} of {queue.length}: {o.name}
          </div>
        </div>
      </div>
      <PracticeLineWithColor key={card.key} o={o} line={line} color={color as 'w' | 'b'} onDone={() => setI(i + 1)} />
    </div>
  );
}

function PracticeLineWithColor({ o, line, color, onDone }: { o: OpeningDef; line: ParsedLine; color: 'w' | 'b'; onDone: () => void }) {
  return <PracticeLine o={o} line={line} onDone={onDone} forceColor={color} />;
}

function OpeningReportView() {
  const core = useCore();
  const games = useGames();
  const report = useMemo(() => buildOpeningReport(games), [games]);
  const sanArrow = (fen: string, san: string | null, color: 'g' | 'r'): Arrow | null => {
    if (!san) return null;
    try {
      const m = new Chess(fen).move(san);
      return { from: m.from, to: m.to, color };
    } catch {
      return null;
    }
  };
  const pct = (gs: { score: number | null }[]) => {
    const sc = gs.filter((g) => g.score !== null) as { score: number }[];
    return sc.length ? `${Math.round((sc.reduce((a, b) => a + b.score, 0) / sc.length) * 100)}%` : '–';
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <button className="btn small" onClick={() => navigate('openings')}>
            ← All openings
          </button>
          <h1 style={{ marginTop: 8 }}>My opening report</h1>
          <div className="muted">
            From {report.gamesScanned} of your games
            {report.avgBookExit ? ` · you leave the studied lines around move ${report.avgBookExit.toFixed(0)}` : ''}
            {report.opponentDeviations ? ` · opponents left the book first in ${report.opponentDeviations} games` : ''}
          </div>
        </div>
      </div>
      {report.gamesScanned === 0 && (
        <div className="card">
          <p className="muted">Import or play some games first – the report compares them with the lines you study.</p>
          <button className="btn primary" onClick={() => navigate('games', { tab: 'import' })}>
            Import games
          </button>
        </div>
      )}

      {report.mistakes.length > 0 && (
        <div className="card">
          <h2>Where you first go wrong</h2>
          <p className="muted small">Your first inaccuracy or worse in each analysed game, grouped by position. Repeated ones are habits worth fixing.</p>
          <div className="opening-grid">
            {report.mistakes.slice(0, 12).map((m) => (
              <div key={m.key} className="notice stack" style={{ gap: 8 }}>
                <div style={{ maxWidth: 240 }}>
                  <Board
                    fen={m.fen}
                    orientation={m.fen.split(' ')[1] as 'w' | 'b'}
                    arrows={[sanArrow(m.fen, m.played, 'r'), sanArrow(m.fen, m.best, 'g')].filter(Boolean) as Arrow[]}
                    theme={core.settings.boardTheme}
                    showCoords={false}
                  />
                </div>
                <div>
                  <span className={`cls-badge ${m.cls}`}>{m.games.length > 1 ? `${m.games.length}× ` : ''}{m.moveLabel}</span>
                </div>
                <div className="small">
                  Better: <strong>{m.best ?? '?'}</strong> <span className="muted">({m.bestLine})</span>
                </div>
                <div className="muted small">Score in these games: {pct(m.games)}</div>
                <div className="row">
                  <button
                    className="btn small primary"
                    onClick={() => {
                      setPending({ fen: m.fen });
                      navigate('play');
                    }}
                  >
                    Play it out vs engine
                  </button>
                  <button className="btn small" onClick={() => navigate('analysis', { game: m.games[0].id })}>
                    See game
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Where you leave the lines you study</h2>
        <p className="muted small">Positions from the opening library where you played something else. Drill the line to make the book move automatic.</p>
        {report.deviations.length === 0 ? (
          <p className="muted">No deviations found – either you follow the book, or your games use openings that aren’t in the library yet.</p>
        ) : (
          <div className="opening-grid">
            {report.deviations.slice(0, 12).map((d) => (
              <div key={d.key} className="notice stack" style={{ gap: 8 }}>
                <div style={{ maxWidth: 240 }}>
                  <Board
                    fen={d.fen}
                    orientation={d.fen.split(' ')[1] as 'w' | 'b'}
                    arrows={[sanArrow(d.fen, d.played, 'r'), sanArrow(d.fen, d.bookMoves[0], 'g')].filter(Boolean) as Arrow[]}
                    theme={core.settings.boardTheme}
                    showCoords={false}
                  />
                </div>
                <div style={{ fontWeight: 600 }}>{d.openingName}</div>
                <div className="small">
                  You played <strong>{d.moveLabel}</strong> {d.games.length > 1 ? `in ${d.games.length} games` : ''}; the book move is{' '}
                  <strong>{d.bookMoves.join(' / ')}</strong>.
                </div>
                <div className="muted small">Score in these games: {pct(d.games)}</div>
                <div className="row">
                  <button className="btn small primary" onClick={() => navigate('openings', { id: d.openingId, line: String(d.lineIndex), mode: 'practice' })}>
                    Drill the line
                  </button>
                  <button className="btn small" onClick={() => navigate('analysis', { game: d.games[0].id })}>
                    See game
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
