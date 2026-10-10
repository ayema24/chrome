import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import Board, { type Arrow, type BoardMove } from '../components/Board';
import EvalBar from '../components/EvalBar';
import EvalGraph from '../components/EvalGraph';
import MoveList, { NavButtons } from '../components/MoveList';
import Explorer from '../components/Explorer';
import { getEngine, isCancelled, type PvLine } from '../lib/engine';
import { lineToEval, formatEval, CLASS_LABEL, TAG_LABEL, type Eval } from '../lib/analysis';
import { START_FEN, parsePgn, isValidFen, uciLineToSan, formatLine, tryUci } from '../lib/chess';
import { useCore, useGames, upsertGame, getGames, type GameRecord } from '../lib/store';
import { analyseGameRecord, useAnalyzer, enqueueAnalysis } from '../lib/analyzer';
import { importPgnText } from '../lib/db';
import { navigate, setPending, takePending } from '../lib/router';
import { moveSound } from '../lib/sound';
import { nameOpening } from '../lib/openings';

export default function Analysis({ params }: { params: Record<string, string> }) {
  const core = useCore();
  const games = useGames();
  const analyzer = useAnalyzer();
  const record = params.game ? games.find((g) => g.id === params.game) ?? null : null;

  const [startFen, setStartFen] = useState(START_FEN);
  const [mainline, setMainline] = useState<Move[]>([]);
  const [line, setLine] = useState<Move[]>([]); // current line (mainline or a variation)
  const [idx, setIdx] = useState(0);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [engineOn, setEngineOn] = useState(true);
  const [lines, setLines] = useState<PvLine[]>([]);
  const [depth, setDepth] = useState(0);
  const [tab, setTab] = useState<'review' | 'explorer' | 'load'>('review');
  const [loadText, setLoadText] = useState('');
  const [loadError, setLoadError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const loadedKey = useRef('');

  // ------------------------------------------------------------- loading
  useEffect(() => {
    const pending = takePending<{ fen?: string }>();
    const key = `${params.game ?? ''}|${params.fen ?? ''}|${pending?.fen ?? ''}`;
    if (key === loadedKey.current && !pending) return;
    loadedKey.current = key;
    if (record) {
      const p = parsePgn(record.pgn);
      if (p) {
        setStartFen(p.startFen);
        setMainline(p.moves);
        setLine(p.moves);
        setIdx(0);
        setOrientation(record.userColor ?? 'w');
        setTab('review');
      }
      return;
    }
    const fen = pending?.fen ?? params.fen;
    if (fen && isValidFen(fen)) {
      setStartFen(fen);
      setMainline([]);
      setLine([]);
      setIdx(0);
      setOrientation(fen.split(' ')[1] as 'w' | 'b');
    } else if (!params.game) setTab((t) => (t === 'review' ? 'load' : t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.game, params.fen, record?.id]);

  const fen = idx === 0 ? startFen : line[idx - 1]?.after ?? startFen;
  const isMain = line === mainline || (line.length <= mainline.length && line.every((m, i) => m.san === mainline[i]?.san));
  const analysis = record?.analysis && isMain ? record.analysis : null;
  const moveReview = analysis && idx > 0 ? analysis.moves[idx - 1] : null;

  // --------------------------------------------------------- live engine
  useEffect(() => {
    if (!engineOn) {
      setLines([]);
      return;
    }
    const engine = getEngine();
    engine.stopAll();
    setLines([]);
    setDepth(0);
    const c = new Chess(fen);
    if (c.isGameOver()) return;
    let alive = true;
    const t = setTimeout(() => {
      engine
        .search(fen, {
          depth: 22,
          multipv: 3,
          onInfo: (ls) => {
            if (!alive) return;
            setLines(ls);
            setDepth(ls[0]?.depth ?? 0);
          },
        })
        .then((r) => alive && setLines(r.lines))
        .catch((e) => {
          if (!isCancelled(e)) console.warn(e);
        });
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
      engine.stopAll();
    };
  }, [fen, engineOn]);

  // Click sound when stepping forward through the game
  const prevIdx = useRef(idx);
  useEffect(() => {
    if (idx === prevIdx.current + 1 && line[idx - 1]) moveSound(line[idx - 1].san);
    prevIdx.current = idx;
  }, [idx, line]);

  const liveEval: Eval | null = lines[0] ? lineToEval(lines[0], fen) : analysis ? analysis.evals[idx] : null;

  // -------------------------------------------------------------- moves
  function playMove(m: BoardMove | string) {
    const uci = typeof m === 'string' ? m : m.from + m.to + (m.promotion ?? '');
    const r = tryUci(fen, uci);
    if (!r) return;
    const next = line[idx];
    if (next && next.from + next.to + (next.promotion ?? '') === uci) {
      setIdx(idx + 1);
      return;
    }
    const newLine = [...line.slice(0, idx), r.move];
    setLine(newLine);
    setIdx(idx + 1);
  }

  function loadFromText() {
    setLoadError('');
    const text = loadText.trim();
    if (!text) return;
    if (isValidFen(text)) {
      setStartFen(text);
      setMainline([]);
      setLine([]);
      setIdx(0);
      setOrientation(text.split(' ')[1] as 'w' | 'b');
      navigate('analysis', { fen: text });
      setTab('review');
      return;
    }
    const recs = importPgnText(text, core.settings.lichessUser || core.settings.chesscomUser || undefined);
    if (recs.length === 0) {
      setLoadError('Could not read that as PGN or FEN.');
      return;
    }
    for (const r of recs) upsertGame(r);
    navigate('analysis', { game: recs[0].id });
  }

  async function runAnalysis() {
    if (!record) return;
    setProgress(0);
    try {
      await analyseGameRecord(getGames().find((g) => g.id === record.id) ?? record, (p) => setProgress(p));
    } catch (e) {
      console.error(e);
    }
    setProgress(null);
  }

  function setUserColor(c: 'w' | 'b' | null) {
    if (!record) return;
    upsertGame({ ...record, userColor: c });
  }

  // ------------------------------------------------------------- render
  const arrows: Arrow[] = [];
  if (engineOn && lines[0]?.pv[0]) arrows.push({ from: lines[0].pv[0].slice(0, 2), to: lines[0].pv[0].slice(2, 4), color: 'b' });
  if (moveReview?.best && moveReview.best !== moveReview.uci && ['inaccuracy', 'mistake', 'blunder'].includes(moveReview.cls)) {
    arrows.push({ from: moveReview.best.slice(0, 2), to: moveReview.best.slice(2, 4), color: 'g' });
  }
  const lastMove = idx > 0 ? ([line[idx - 1].from, line[idx - 1].to] as [string, string]) : null;
  const opening = useMemo(() => nameOpening(line.slice(0, Math.max(idx, 1)).map((m) => m.after)), [line, idx]);
  const queued = record && analyzer.currentId === record.id;

  return (
    <div className="board-layout">
      <div>
        {record && (
          <div className="player-strip">
            <span>
              {orientation === 'w' ? record.black : record.white}
            </span>
            <span className="muted">{record.result}</span>
          </div>
        )}
        <div className="board-col">
          <EvalBar ev={liveEval} orientation={orientation} />
          <Board
            fen={fen}
            orientation={orientation}
            movable="both"
            onMove={playMove}
            lastMove={lastMove}
            arrows={arrows}
            theme={core.settings.boardTheme}
            showCoords={core.settings.showCoords}
            badge={moveReview && idx > 0 ? { square: line[idx - 1].to, kind: moveReview.cls } : null}
          />
        </div>
        {record && (
          <div className="player-strip">
            <span>{orientation === 'w' ? record.white : record.black}</span>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <NavButtons index={idx} max={line.length} onChange={setIdx} />
        </div>
        {analysis && (
          <div style={{ marginTop: 10 }}>
            <EvalGraph evals={analysis.evals} moves={analysis.moves} current={idx} onSelect={(i) => setIdx(i)} />
          </div>
        )}
      </div>

      <div className="side-col">
        <div className="card">
          <div className="row">
            <strong>{opening ?? (record ? `${record.white} – ${record.black}` : 'Analysis board')}</strong>
            <span className="spacer" />
            <button className="btn small" onClick={() => setOrientation(orientation === 'w' ? 'b' : 'w')}>
              ⇅
            </button>
            <label className="check small">
              <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} /> Engine
            </label>
          </div>
          {engineOn && (
            <div className="engine-lines" style={{ marginTop: 8 }}>
              <div className="muted small">Stockfish 18 · depth {depth}</div>
              {lines.map((l) => {
                const ev = lineToEval(l, fen);
                const sans = uciLineToSan(fen, l.pv, 10);
                return (
                  <div key={l.multipv} className="engine-line" onClick={() => playMove(l.pv[0])} title="Play this move">
                    <span className="ev">{formatEval(ev)}</span>
                    <span>{formatLine(fen, sans)}</span>
                  </div>
                );
              })}
              {new Chess(fen).isGameOver() && <div className="muted small">Game over.</div>}
            </div>
          )}
        </div>

        <div className="seg">
          {(['review', 'explorer', 'load'] as const).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'review' ? 'Moves & review' : t === 'explorer' ? 'Database' : 'Load PGN / FEN'}
            </button>
          ))}
        </div>

        {tab === 'review' && (
          <>
            {record && !analysis && isMain && (
              <div className="card">
                {progress !== null || queued ? (
                  <>
                    <div className="small">Analysing… {Math.round((progress ?? analyzer.progress) * 100)}%</div>
                    <div className="progressbar" style={{ marginTop: 6 }}>
                      <div style={{ width: `${(progress ?? analyzer.progress) * 100}%` }} />
                    </div>
                  </>
                ) : (
                  <div className="row">
                    <span className="small">Get a full review: accuracy, mistakes explained, and your errors added to your training deck.</span>
                    <button className="btn primary" onClick={runAnalysis}>
                      Analyse game
                    </button>
                  </div>
                )}
              </div>
            )}
            {record && (
              <div className="row small">
                <span className="muted">I played:</span>
                <div className="seg">
                  {([['w', 'White'], ['b', 'Black'], [null, 'Neither']] as const).map(([c, l]) => (
                    <button key={l} className={record.userColor === c ? 'active' : ''} onClick={() => setUserColor(c)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {analysis && (
              <div className="card">
                <div className="grid-2" style={{ gap: 8 }}>
                  {(['w', 'b'] as const).map((c) => (
                    <div key={c}>
                      <div className="muted small">{c === 'w' ? record!.white : record!.black}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{analysis.accuracy[c].toFixed(1)}%</div>
                      <div className="small">
                        <span className="warn">{analysis.counts[c].inaccuracy} ?!</span> · <span style={{ color: '#e8873a' }}>{analysis.counts[c].mistake} ?</span> ·{' '}
                        <span className="bad">{analysis.counts[c].blunder} ??</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {moveReview && (
              <div className={`feedback ${['mistake', 'blunder'].includes(moveReview.cls) ? 'fail' : moveReview.cls === 'inaccuracy' ? '' : 'ok'}`}>
                <div className="row" style={{ marginBottom: 4 }}>
                  <span className={`cls-badge ${moveReview.cls}`}>{CLASS_LABEL[moveReview.cls]}</span>
                  <strong>{moveReview.san}</strong>
                  <span className="muted small">{formatEval(moveReview.evalAfter)}</span>
                  {moveReview.tags
                    .filter((t) => t !== 'positional')
                    .map((t) => (
                      <span className="pill" key={t}>
                        {TAG_LABEL[t]}
                      </span>
                    ))}
                </div>
                <div className="small">{moveReview.explanation}</div>
              </div>
            )}
            {!isMain && (
              <div className="notice row">
                <span className="small">You’re exploring a variation.</span>
                <button
                  className="btn small"
                  onClick={() => {
                    setLine(mainline);
                    setIdx(Math.min(idx, mainline.length));
                  }}
                >
                  Back to main line
                </button>
              </div>
            )}
            <MoveList
              moves={line.map((m, i) => ({ san: m.san, cls: analysis?.moves[i]?.cls }))}
              current={idx}
              onSelect={setIdx}
              startsWithBlack={startFen.split(' ')[1] === 'b'}
              startMoveNumber={parseInt(startFen.split(' ')[5] ?? '1', 10)}
            />
            <div className="row">
              <button
                className="btn small"
                onClick={() => {
                  setPending({ fen });
                  navigate('play', {});
                }}
              >
                ♟ Play from here
              </button>
              <button className="btn small" onClick={() => navigator.clipboard?.writeText(fen)}>
                Copy FEN
              </button>
              {record && (
                <button className="btn small" onClick={() => navigator.clipboard?.writeText(record.pgn)}>
                  Copy PGN
                </button>
              )}
              {record?.url && (
                <a className="btn small" href={record.url} target="_blank" rel="noreferrer">
                  Open original
                </a>
              )}
            </div>
          </>
        )}

        {tab === 'explorer' && (
          <div className="card">
            <Explorer fen={fen} onMove={playMove} />
          </div>
        )}

        {tab === 'load' && (
          <div className="card stack" style={{ gap: 8 }}>
            <label className="field">
              Paste a PGN (one or many games) or a FEN
              <textarea rows={8} value={loadText} onChange={(e) => setLoadText(e.target.value)} placeholder={'[Event "..."]\n1. e4 e5 2. Nf3 ...'} />
            </label>
            {loadError && <div className="error">{loadError}</div>}
            <div className="row">
              <button className="btn primary" onClick={loadFromText}>
                Load
              </button>
              <button className="btn" onClick={() => navigate('games')}>
                Pick from my games
              </button>
              <button
                className="btn"
                onClick={() => {
                  setStartFen(START_FEN);
                  setMainline([]);
                  setLine([]);
                  setIdx(0);
                  navigate('analysis', {});
                  setTab('review');
                }}
              >
                Empty board
              </button>
            </div>
            {games.length > 0 && <BatchHint games={games} />}
          </div>
        )}
      </div>
    </div>
  );
}

function BatchHint({ games }: { games: GameRecord[] }) {
  const pending = games.filter((g) => g.userColor && !g.analysis);
  if (!pending.length) return null;
  return (
    <div className="notice row">
      <span className="small">{pending.length} of your games haven’t been analysed yet.</span>
      <button className="btn small" onClick={() => enqueueAnalysis(pending.map((g) => g.id))}>
        Analyse all in background
      </button>
    </div>
  );
}
