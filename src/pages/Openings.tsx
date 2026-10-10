import { useEffect, useMemo, useRef, useState } from 'react';
import Board, { type Arrow, type BoardMove } from '../components/Board';
import { NavButtons } from '../components/MoveList';
import Explorer from '../components/Explorer';
import { OPENINGS, type OpeningDef } from '../data/openings';
import { linesFor, type ParsedLine } from '../lib/openings';
import { useCore, updateCore, recordLineDrill, type LineCard } from '../lib/store';
import { navigate } from '../lib/router';
import { tryUci } from '../lib/chess';
import { moveSound, sound } from '../lib/sound';
import { fireConfetti } from '../lib/confetti';
import { Chess } from 'chess.js';

const cardKey = (openingId: string, lineIndex: number, color: 'w' | 'b') => `${openingId}#${lineIndex}#${color}`;

function repertoireSlot(o: OpeningDef): 'white' | 'vsE4' | 'vsD4' | null {
  if (o.side === 'w') return 'white';
  const first = linesFor(o.id)[0]?.sans[0];
  return first === 'e4' ? 'vsE4' : first === 'd4' ? 'vsD4' : null;
}

const SLOT_LABEL = { white: 'My White opening', vsE4: 'My defence vs 1.e4', vsD4: 'My defence vs 1.d4' };

export default function Openings({ params }: { params: Record<string, string> }) {
  if (params.mode === 'review') return <ReviewQueue />;
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
  const progress = (o: OpeningDef) => {
    const ls = linesFor(o.id);
    const cards = ls.map((l, i) => core.lineCards[cardKey(o.id, i, naturalSide(o, l))]).filter(Boolean) as LineCard[];
    return { learned: cards.filter((c) => c.box >= 2).length, total: o.lines.length };
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Openings & gambits</h1>
          <div className="muted">Learn the ideas move by move, then drill the lines until they stick. Lines come back for review on a schedule.</div>
        </div>
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
              </div>
              <div className="muted small">{o.summary}</div>
              <div className="progressbar" style={{ marginTop: 'auto' }}>
                <div style={{ width: `${(p.learned / p.total) * 100}%` }} />
              </div>
              <div className="muted small">
                {p.learned}/{p.total} lines learned
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

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <button className="btn small" onClick={() => navigate('openings')}>
            ← All openings
          </button>
          <h1 style={{ marginTop: 8 }}>{o.name}</h1>
          <div className="muted">
            {o.eco} · {o.category} · {o.level}
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
              return (
                <div key={l.lineIndex} className="task">
                  <div className="tick" style={card && card.box >= 2 ? { background: 'var(--good)', borderColor: 'var(--good)', color: 'white' } : {}}>
                    {card && card.box >= 2 ? '✓' : ''}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{l.name}</div>
                    <div className="muted small">
                      {l.sans.length} moves
                      {card ? ` · practised ${card.reps}× · next review ${card.due <= Date.now() ? 'now' : new Date(card.due).toLocaleDateString()}` : ''}
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
        <div style={{ marginTop: 8 }}>
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
              <strong>Exploring your own move.</strong> <span className="muted">The database below shows how masters respond.</span>{' '}
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
        {idx === line.sans.length && !explore && (
          <div className="feedback ok">
            End of the line.{' '}
            <button className="btn small primary" onClick={() => navigate('openings', { id: o.id, line: String(line.lineIndex), mode: 'practice' })}>
              Now drill it from memory →
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

/** In trap lines the user should play the side that sets the trap, never the blunder. */
function naturalSide(o: OpeningDef, line: ParsedLine): 'w' | 'b' {
  const bad = line.sans.findIndex((s) => /\?/.test(s));
  if (bad >= 0) return bad % 2 === 0 ? 'b' : 'w';
  return o.side;
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setMsg({ kind: 'info', text: `You play ${color === 'w' ? 'White' : 'Black'}. Play the moves of the line from memory.` });
    if (!userPlies[0]) autoPlay(0);
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
    recordLineDrill(key, ms, userPlies.filter(Boolean).length);
    if (ms.length === 0) {
      sound.solved();
      fireConfetti(90);
      setMsg({ kind: 'ok', text: 'Perfect! Line completed without mistakes. It will come back for review in a few days.' });
    } else setMsg({ kind: 'fail', text: `Line completed with ${ms.length} mistake${ms.length > 1 ? 's' : ''}. It will come back tomorrow.` });
  }

  function onMove(m: BoardMove) {
    if (finished || !userPlies[idx]) return;
    const uci = m.from + m.to + (m.promotion ?? '');
    const expected = line.ucis[idx];
    if (uci === expected) {
      moveSound(line.sans[idx]);
      setShowAnswer(false);
      const c = line.comments[idx];
      setMsg({ kind: 'ok', text: `✓ ${line.sans[idx]}${c ? ` – ${c}` : ''}` });
      const nextIdx = idx + 1;
      setIdx(nextIdx);
      if (nextIdx >= line.ucis.length) complete(mistakes);
      else if (!userPlies[nextIdx]) autoPlay(nextIdx);
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

  const fen = line.fens[idx];
  const expected = line.ucis[idx];
  const arrows: Arrow[] = showAnswer && expected ? [{ from: expected.slice(0, 2), to: expected.slice(2, 4), color: 'g' }] : [];
  const last = idx > 0 ? ([line.ucis[idx - 1].slice(0, 2), line.ucis[idx - 1].slice(2, 4)] as [string, string]) : null;
  const turn = new Chess(fen).turn();

  return (
    <div className="board-layout">
      <Board
        fen={fen}
        orientation={color}
        movable={!finished && userPlies[idx] && turn === color ? color : null}
        onMove={onMove}
        lastMove={last}
        arrows={arrows}
        shake={shake}
        badge={idx > 0 && userPlies[idx - 1] && !showAnswer ? { square: line.ucis[idx - 1].slice(2, 4), kind: 'correct' } : null}
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
        </div>
        {msg && <div className={`feedback ${msg.kind}`}>{msg.text}</div>}
        <div className="row">
          {!finished && (
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
