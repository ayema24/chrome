// Turns raw history (puzzles, games, drills) into weaknesses, strengths,
// progress series and a daily training plan. Everything here is pure and is
// recomputed whenever the store changes, so the coach reacts in real time.
import type { CoreData, GameRecord } from './store';
import { TAG_LABEL, type MistakeTag, whiteWin } from './analysis';
import { themeLabel, TRAINABLE_THEMES } from './motifs';
import { openingFamily } from './openings';
import { OPENINGS } from '../data/openings';
import type { Phase } from './chess';

export const DAY = 86400000;

export interface Action {
  page: 'puzzles' | 'openings' | 'play' | 'analysis' | 'endgames' | 'mistakes' | 'database';
  params?: Record<string, string>;
  label: string;
}

export interface Insight {
  id: string;
  title: string;
  detail: string;
  severity: number; // 0..100
  kind: 'tactics' | 'games' | 'openings' | 'phase' | 'conversion' | 'time' | 'endgame' | 'habit';
  action?: Action;
}

export interface UserGameStats {
  games: number;
  analysed: number;
  avgAccuracy: number | null;
  blundersPerGame: number | null;
  mistakesPerGame: number | null;
  tagsPerGame: Partial<Record<MistakeTag, number>>;
  phaseAccuracy: Partial<Record<Phase, number>>;
  score: number | null; // 0..1
  byColor: { w: { n: number; score: number }; b: { n: number; score: number } };
  openings: { name: string; n: number; score: number; accuracy: number | null }[];
  conversionFails: number;
  winningPositions: number;
}

export function scoreOf(g: GameRecord): number | null {
  if (!g.userColor || g.result === '*') return null;
  if (g.result === '1/2-1/2') return 0.5;
  return (g.result === '1-0') === (g.userColor === 'w') ? 1 : 0;
}

export function userGames(games: GameRecord[], sinceMs = 0): GameRecord[] {
  return games.filter((g) => g.userColor && g.date >= sinceMs);
}

export function gameStats(games: GameRecord[]): UserGameStats {
  const mine = games.filter((g) => g.userColor);
  const analysed = mine.filter((g) => g.analysis);
  const tagCounts: Partial<Record<MistakeTag, number>> = {};
  const phaseAcc: Record<Phase, number[]> = { opening: [], middlegame: [], endgame: [] };
  let acc = 0;
  let blunders = 0;
  let mistakes = 0;
  let conversionFails = 0;
  let winningPositions = 0;
  for (const g of analysed) {
    const c = g.userColor!;
    const a = g.analysis!;
    acc += a.accuracy[c];
    blunders += a.counts[c].blunder;
    mistakes += a.counts[c].mistake;
    for (const m of a.moves) {
      if (m.color !== c) continue;
      phaseAcc[m.phase].push(m.accuracy);
      for (const t of m.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
    const wasWinning = a.evals.some((e) => (c === 'w' ? whiteWin(e) : 100 - whiteWin(e)) >= 85);
    if (wasWinning) {
      winningPositions++;
      if (scoreOf(g) !== 1) conversionFails++;
    }
  }
  const n = analysed.length;
  const tagsPerGame: Partial<Record<MistakeTag, number>> = {};
  for (const [k, v] of Object.entries(tagCounts)) tagsPerGame[k as MistakeTag] = n ? v / n : 0;
  const phaseAccuracy: Partial<Record<Phase, number>> = {};
  for (const [k, v] of Object.entries(phaseAcc)) if (v.length >= 5) phaseAccuracy[k as Phase] = avg(v);

  const scored = mine.map((g) => ({ g, s: scoreOf(g) })).filter((x) => x.s !== null) as { g: GameRecord; s: number }[];
  const byColor = { w: { n: 0, score: 0 }, b: { n: 0, score: 0 } };
  for (const { g, s } of scored) {
    byColor[g.userColor!].n++;
    byColor[g.userColor!].score += s;
  }
  for (const c of ['w', 'b'] as const) if (byColor[c].n) byColor[c].score /= byColor[c].n;

  const openMap = new Map<string, { n: number; score: number; acc: number[] }>();
  for (const { g, s } of scored) {
    const fam = openingFamily(g.opening);
    const e = openMap.get(fam) ?? { n: 0, score: 0, acc: [] };
    e.n++;
    e.score += s;
    if (g.analysis) {
      const c = g.userColor!;
      const open = g.analysis.moves.filter((m) => m.color === c && m.phase === 'opening');
      if (open.length) e.acc.push(avg(open.map((m) => m.accuracy)));
    }
    openMap.set(fam, e);
  }
  const openings = [...openMap.entries()]
    .map(([name, e]) => ({ name, n: e.n, score: e.score / e.n, accuracy: e.acc.length ? avg(e.acc) : null }))
    .sort((a, b) => b.n - a.n);

  return {
    games: mine.length,
    analysed: n,
    avgAccuracy: n ? acc / n : null,
    blundersPerGame: n ? blunders / n : null,
    mistakesPerGame: n ? mistakes / n : null,
    tagsPerGame,
    phaseAccuracy,
    score: scored.length ? scored.reduce((a, b) => a + b.s, 0) / scored.length : null,
    byColor,
    openings,
    conversionFails,
    winningPositions,
  };
}

export function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export interface ThemeStat {
  theme: string;
  attempts: number;
  success: number;
  rate: number;
}

export function themeStats(core: CoreData, sinceMs = 0): ThemeStat[] {
  const map = new Map<string, { a: number; s: number }>();
  for (const at of core.puzzleAttempts) {
    if (at.t < sinceMs) continue;
    for (const t of at.themes) {
      const e = map.get(t) ?? { a: 0, s: 0 };
      e.a++;
      if (at.success) e.s++;
      map.set(t, e);
    }
  }
  return [...map.entries()]
    .map(([theme, e]) => ({ theme, attempts: e.a, success: e.s, rate: e.s / e.a }))
    .sort((a, b) => b.attempts - a.attempts);
}

const TAG_ACTION: Partial<Record<MistakeTag, Action>> = {
  'hung-material': { page: 'puzzles', params: { theme: 'hangingPiece' }, label: 'Train "hanging piece" puzzles' },
  'missed-tactic': { page: 'puzzles', params: { theme: 'fork' }, label: 'Train tactics (forks, pins…)' },
  'missed-punish': { page: 'mistakes', label: 'Replay your missed chances' },
  'missed-mate': { page: 'puzzles', params: { theme: 'mateIn2' }, label: 'Train mating patterns' },
  'allowed-mate': { page: 'puzzles', params: { theme: 'mateIn2' }, label: 'Learn mating patterns (to see them coming)' },
  'endgame-technique': { page: 'endgames', label: 'Practise endgame drills' },
  'opening-error': { page: 'openings', label: 'Drill your repertoire' },
  'time-trouble': { page: 'play', label: 'Play slower games / manage the clock' },
  positional: { page: 'play', label: 'Play with the coach and review plans' },
};

const TAG_THRESHOLD: Partial<Record<MistakeTag, number>> = {
  'hung-material': 0.35,
  'missed-tactic': 0.5,
  'missed-punish': 0.3,
  'missed-mate': 0.1,
  'allowed-mate': 0.1,
  'endgame-technique': 0.4,
  'opening-error': 0.4,
  'time-trouble': 0.3,
  positional: 1.5,
};

/** The coach's current list of weaknesses, most severe first. */
export function computeWeaknesses(core: CoreData, games: GameRecord[], now = Date.now()): Insight[] {
  const out: Insight[] = [];
  const recent = userGames(games, now - 45 * DAY);
  const gs = gameStats(recent.length >= 3 ? recent : userGames(games));

  // 1. Recurring mistakes in real games
  if (gs.analysed >= 2) {
    for (const [tag, perGame] of Object.entries(gs.tagsPerGame) as [MistakeTag, number][]) {
      const thr = TAG_THRESHOLD[tag] ?? 1;
      if (perGame >= thr) {
        out.push({
          id: `tag-${tag}`,
          title: TAG_LABEL[tag],
          detail: `${perGame.toFixed(1)} per game over your last ${gs.analysed} analysed games.`,
          severity: Math.min(100, Math.round((perGame / thr) * 45)),
          kind: tag === 'endgame-technique' ? 'endgame' : tag === 'time-trouble' ? 'time' : 'games',
          action: TAG_ACTION[tag],
        });
      }
    }
    if ((gs.blundersPerGame ?? 0) >= 1) {
      out.push({
        id: 'blunders',
        title: 'Too many blunders',
        detail: `${gs.blundersPerGame!.toFixed(1)} blunders per game. Before every move, check: what does my opponent threaten? Is my piece safe?`,
        severity: Math.min(100, Math.round(gs.blundersPerGame! * 30)),
        kind: 'habit',
        action: { page: 'puzzles', params: { theme: 'hangingPiece' }, label: 'Do a blunder-check drill' },
      });
    }
    // Weakest phase
    const phases = Object.entries(gs.phaseAccuracy) as [Phase, number][];
    if (phases.length >= 2) {
      phases.sort((a, b) => a[1] - b[1]);
      const [worst, wAcc] = phases[0];
      const bestAcc = phases[phases.length - 1][1];
      if (bestAcc - wAcc >= 6) {
        out.push({
          id: `phase-${worst}`,
          title: `Weakest phase: ${worst}`,
          detail: `Your move accuracy is ${wAcc.toFixed(0)}% in the ${worst} vs ${bestAcc.toFixed(0)}% in your best phase.`,
          severity: Math.min(100, Math.round((bestAcc - wAcc) * 3)),
          kind: 'phase',
          action:
            worst === 'opening'
              ? { page: 'openings', label: 'Study your openings' }
              : worst === 'endgame'
                ? { page: 'endgames', label: 'Endgame drills' }
                : { page: 'puzzles', label: 'Calculation puzzles' },
        });
      }
    }
    if (gs.winningPositions >= 3 && gs.conversionFails / gs.winningPositions >= 0.3) {
      out.push({
        id: 'conversion',
        title: 'Converting winning positions',
        detail: `You failed to win ${gs.conversionFails} of ${gs.winningPositions} games where you were clearly winning. Simplify when ahead, trade pieces, avoid counterplay.`,
        severity: Math.round((gs.conversionFails / gs.winningPositions) * 90),
        kind: 'conversion',
        action: { page: 'endgames', label: 'Practise winning won positions' },
      });
    }
    // Openings that score badly
    for (const o of gs.openings) {
      if (o.n >= 3 && o.score < 0.35) {
        out.push({
          id: `opening-${o.name}`,
          title: `Struggling in the ${o.name}`,
          detail: `You score ${(o.score * 100).toFixed(0)}% in ${o.n} games${o.accuracy ? ` with ${o.accuracy.toFixed(0)}% opening accuracy` : ''}.`,
          severity: Math.round((0.5 - o.score) * 120 + o.n * 2),
          kind: 'openings',
          action: { page: 'openings', params: { search: o.name }, label: 'Study this opening' },
        });
      }
    }
    // Colour imbalance
    const { w, b } = gs.byColor;
    if (w.n >= 4 && b.n >= 4 && Math.abs(w.score - b.score) >= 0.2) {
      const weak = w.score < b.score ? 'White' : 'Black';
      out.push({
        id: 'colour',
        title: `Weaker with ${weak}`,
        detail: `You score ${(w.score * 100).toFixed(0)}% with White and ${(b.score * 100).toFixed(0)}% with Black.`,
        severity: Math.round(Math.abs(w.score - b.score) * 100),
        kind: 'openings',
        action: { page: 'openings', label: `Build a repertoire for ${weak}` },
      });
    }
  }

  // 2. Puzzle themes
  const ts = themeStats(core, now - 60 * DAY).filter((t) => TRAINABLE_THEMES.includes(t.theme) && t.attempts >= 4);
  const overall = core.puzzleAttempts.length ? core.puzzleAttempts.filter((a) => a.success).length / core.puzzleAttempts.length : 0;
  for (const t of ts) {
    if (t.rate < Math.min(0.6, overall - 0.1) || t.rate < 0.45) {
      out.push({
        id: `theme-${t.theme}`,
        title: `Tactic blind spot: ${themeLabel(t.theme)}`,
        detail: `You solve ${(t.rate * 100).toFixed(0)}% of ${themeLabel(t.theme).toLowerCase()} puzzles (${t.attempts} tried) vs ${(overall * 100).toFixed(0)}% overall.`,
        severity: Math.round((overall - t.rate) * 100 + 30),
        kind: 'tactics',
        action: { page: 'puzzles', params: { theme: t.theme }, label: `Train ${themeLabel(t.theme)}` },
      });
    }
  }

  // 3. Opening drills that keep failing
  for (const card of Object.values(core.lineCards)) {
    if (card.lapses >= 2 && card.box <= 1) {
      const [oid, li] = card.key.split('#');
      const o = OPENINGS.find((x) => x.id === oid);
      if (!o) continue;
      out.push({
        id: `line-${card.key}`,
        title: `Keep forgetting: ${o.name}`,
        detail: `${o.lines[+li]?.name ?? ''} – missed ${card.lapses} times. It is due for review.`,
        severity: 30 + card.lapses * 8,
        kind: 'openings',
        action: { page: 'openings', params: { id: oid, line: li, mode: 'practice' }, label: 'Drill this line' },
      });
    }
  }

  // 4. Endgame drills failed
  const egFails = new Map<string, number>();
  for (const r of core.endgameResults) egFails.set(r.id, r.success ? 0 : (egFails.get(r.id) ?? 0) + 1);
  const failing = [...egFails.entries()].filter(([, n]) => n >= 2);
  if (failing.length) {
    out.push({
      id: 'endgame-drills',
      title: 'Endgame technique gaps',
      detail: `${failing.length} endgame drill${failing.length > 1 ? 's' : ''} failed repeatedly.`,
      severity: 35 + failing.length * 10,
      kind: 'endgame',
      action: { page: 'endgames', label: 'Retry endgame drills' },
    });
  }

  // 5. Habits: speed in puzzles (rushing)
  const lastAttempts = core.puzzleAttempts.slice(-30);
  if (lastAttempts.length >= 15) {
    const fastFails = lastAttempts.filter((a) => !a.success && a.ms < 6000).length;
    if (fastFails >= 5) {
      out.push({
        id: 'rushing',
        title: 'Rushing your moves',
        detail: `${fastFails} of your last ${lastAttempts.length} puzzles were failed in under 6 seconds. Slow down: checks, captures, threats.`,
        severity: 30 + fastFails * 5,
        kind: 'habit',
        action: { page: 'puzzles', label: 'Solve slowly – no time pressure' },
      });
    }
  }

  return out.sort((a, b) => b.severity - a.severity);
}

export function computeStrengths(core: CoreData, games: GameRecord[]): Insight[] {
  const out: Insight[] = [];
  const ts = themeStats(core).filter((t) => t.attempts >= 6 && t.rate >= 0.8 && TRAINABLE_THEMES.includes(t.theme));
  for (const t of ts.slice(0, 3))
    out.push({ id: `s-${t.theme}`, title: themeLabel(t.theme), detail: `${(t.rate * 100).toFixed(0)}% solved (${t.attempts})`, severity: 0, kind: 'tactics' });
  const gs = gameStats(games);
  const good = gs.openings.filter((o) => o.n >= 3 && o.score >= 0.6).slice(0, 2);
  for (const o of good)
    out.push({ id: `s-op-${o.name}`, title: o.name, detail: `${(o.score * 100).toFixed(0)}% score in ${o.n} games`, severity: 0, kind: 'openings' });
  const ph = Object.entries(gs.phaseAccuracy).sort((a, b) => b[1] - a[1])[0];
  if (ph && ph[1] >= 80) out.push({ id: `s-phase`, title: `Strong ${ph[0]}`, detail: `${ph[1].toFixed(0)}% move accuracy`, severity: 0, kind: 'phase' });
  return out;
}

// --------------------------------------------------------------- progress

export interface Point {
  t: number;
  v: number;
}

export function puzzleRatingSeries(core: CoreData): Point[] {
  const pts: Point[] = [{ t: core.createdAt, v: 1200 }];
  for (const a of core.puzzleAttempts) pts.push({ t: a.t, v: a.ratingAfter });
  return pts;
}

export function playRatingSeries(core: CoreData): Point[] {
  const pts: Point[] = [{ t: core.createdAt, v: 1000 }];
  for (const r of core.playResults) pts.push({ t: r.t, v: r.ratingAfter });
  return pts;
}

export function accuracySeries(games: GameRecord[]): Point[] {
  return games
    .filter((g) => g.userColor && g.analysis)
    .map((g) => ({ t: g.date, v: g.analysis!.accuracy[g.userColor!] }))
    .sort((a, b) => a.t - b.t);
}

export function blunderSeries(games: GameRecord[]): Point[] {
  return games
    .filter((g) => g.userColor && g.analysis)
    .map((g) => ({ t: g.date, v: g.analysis!.counts[g.userColor!].blunder }))
    .sort((a, b) => a.t - b.t);
}

export function rolling(points: Point[], window = 5): Point[] {
  return points.map((p, i) => ({ t: p.t, v: avg(points.slice(Math.max(0, i - window + 1), i + 1).map((x) => x.v)) }));
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DayActivity {
  day: string;
  puzzles: number;
  puzzlesSolved: number;
  games: number;
  drills: number;
  mistakes: number;
  endgames: number;
}

export function activityByDay(core: CoreData, _games: GameRecord[]): Map<string, DayActivity> {
  const m = new Map<string, DayActivity>();
  const get = (t: number) => {
    const k = dayKey(t);
    let e = m.get(k);
    if (!e) m.set(k, (e = { day: k, puzzles: 0, puzzlesSolved: 0, games: 0, drills: 0, mistakes: 0, endgames: 0 }));
    return e;
  };
  for (const a of core.puzzleAttempts) {
    const e = get(a.t);
    if (a.source === 'mistake') e.mistakes++;
    else {
      e.puzzles++;
      if (a.success) e.puzzlesSolved++;
    }
  }
  for (const r of core.playResults) get(r.t).games++;
  for (const d of core.drillResults) get(d.t).drills++;
  for (const r of core.endgameResults) get(r.t).endgames++;
  return m;
}

export function streak(core: CoreData, games: GameRecord[], now = Date.now()): number {
  const act = activityByDay(core, games);
  let n = 0;
  for (let d = 0; d < 400; d++) {
    const e = act.get(dayKey(now - d * DAY));
    const active = e && e.puzzles + e.games + e.drills + e.mistakes + e.endgames > 0;
    if (active) n++;
    else if (d > 0) break; // today may still be empty
  }
  return n;
}

export interface PeriodSummary {
  label: string;
  puzzleRating: number | null;
  puzzleSuccess: number | null;
  accuracy: number | null;
  blunders: number | null;
  playRating: number | null;
  games: number;
}

function ratingAt(series: Point[], t: number): number | null {
  let v: number | null = null;
  for (const p of series) if (p.t <= t) v = p.v;
  return v;
}

/** Compares a recent period with the period before it ("before vs now"). */
export function comparePeriods(core: CoreData, games: GameRecord[], days = 7, now = Date.now()): [PeriodSummary, PeriodSummary] {
  const mk = (from: number, to: number, label: string): PeriodSummary => {
    const att = core.puzzleAttempts.filter((a) => a.t >= from && a.t < to);
    const gs = games.filter((g) => g.userColor && g.analysis && g.date >= from && g.date < to);
    return {
      label,
      puzzleRating: ratingAt(puzzleRatingSeries(core), to),
      puzzleSuccess: att.length ? att.filter((a) => a.success).length / att.length : null,
      accuracy: gs.length ? avg(gs.map((g) => g.analysis!.accuracy[g.userColor!])) : null,
      blunders: gs.length ? avg(gs.map((g) => g.analysis!.counts[g.userColor!].blunder)) : null,
      playRating: ratingAt(playRatingSeries(core), to),
      games: gs.length,
    };
  };
  return [mk(now - 2 * days * DAY, now - days * DAY, `Previous ${days} days`), mk(now - days * DAY, now + 1, `Last ${days} days`)];
}

// ----------------------------------------------------------- training plan

export interface PlanTask {
  id: string;
  title: string;
  detail: string;
  target: number;
  done: number;
  action: Action;
}

export interface WeekFocus {
  week: number;
  title: string;
  goal: string;
}

export const MONTH_PLAN: WeekFocus[] = [
  { week: 1, title: 'Stop giving material away', goal: 'Blunder-check every move. Hanging pieces, forks and simple mates. Choose your repertoire.' },
  { week: 2, title: 'Openings & core patterns', goal: 'Learn your repertoire lines to move 8–10. Pins, skewers, discovered attacks.' },
  { week: 3, title: 'Calculation', goal: 'Longer puzzles (mate in 2–3, sacrifices). Analyse every game you play.' },
  { week: 4, title: 'Endgames & converting', goal: 'Basic mates, king & pawn, rook endgames. Win the won positions.' },
];

export function planDay(core: CoreData, now = Date.now()): number {
  return Math.floor((now - core.planStart) / DAY) + 1;
}

export function currentWeek(core: CoreData, now = Date.now()): WeekFocus {
  const d = planDay(core, now);
  return MONTH_PLAN[Math.min(3, Math.floor((d - 1) / 7))];
}

export function dailyPlan(core: CoreData, games: GameRecord[], weaknesses: Insight[], now = Date.now()): PlanTask[] {
  const today = activityByDay(core, games).get(dayKey(now));
  const week = currentWeek(core, now).week;
  const tasks: PlanTask[] = [];
  const todayAttempts = core.puzzleAttempts.filter((a) => dayKey(a.t) === dayKey(now));

  tasks.push({
    id: 'warmup',
    title: 'Tactics warm-up',
    detail: 'Mixed puzzles at your rating.',
    target: 10,
    done: today?.puzzles ?? 0,
    action: { page: 'puzzles', label: 'Solve puzzles' },
  });

  const tacticWeak = weaknesses.find((w) => w.action?.page === 'puzzles' && w.action.params?.theme);
  const weekTheme = week === 1 ? 'hangingPiece' : week === 2 ? 'pin' : week === 3 ? 'mateIn2' : 'endgame';
  const theme = tacticWeak?.action?.params?.theme ?? weekTheme;
  tasks.push({
    id: 'targeted',
    title: `Targeted: ${themeLabel(theme)}`,
    detail: tacticWeak ? `Your coach picked this from your results: ${tacticWeak.title}.` : `This week's theme.`,
    target: 6,
    done: todayAttempts.filter((a) => a.themes.includes(theme)).length,
    action: { page: 'puzzles', params: { theme }, label: 'Train it' },
  });

  const due = Object.values(core.lineCards).filter((c) => c.due <= now).length;
  const hasRep = core.repertoire.white || core.repertoire.vsE4 || core.repertoire.vsD4;
  tasks.push({
    id: 'openings',
    title: due ? `Review ${due} opening line${due > 1 ? 's' : ''}` : hasRep ? 'Learn a new repertoire line' : 'Pick your repertoire',
    detail: due ? 'Spaced repetition keeps lines fresh.' : 'One opening for White, one against 1.e4 and one against 1.d4.',
    target: Math.max(1, Math.min(due, 4)),
    done: today?.drills ?? 0,
    action: { page: 'openings', params: due ? { mode: 'review' } : {}, label: due ? 'Review' : 'Openings' },
  });

  tasks.push({
    id: 'game',
    title: 'Play a serious game',
    detail: 'Take your time, then review the analysis.',
    target: 1,
    done: today?.games ?? 0,
    action: { page: 'play', label: 'Play' },
  });

  const dueMistakes = core.mistakeDeck.filter((m) => m.due <= now).length;
  if (dueMistakes > 0 || core.mistakeDeck.length > 0) {
    tasks.push({
      id: 'mistakes',
      title: 'Learn from your mistakes',
      detail: `${dueMistakes} position${dueMistakes === 1 ? '' : 's'} from your own games due.`,
      target: Math.max(1, Math.min(5, dueMistakes)),
      done: today?.mistakes ?? 0,
      action: { page: 'mistakes', label: 'Review' },
    });
  }

  if (week === 4 || weaknesses.some((w) => w.kind === 'endgame' || w.kind === 'conversion') || new Date(now).getDay() % 3 === 0) {
    tasks.push({
      id: 'endgame',
      title: 'Endgame drill',
      detail: 'Technique wins games.',
      target: 1,
      done: today?.endgames ?? 0,
      action: { page: 'endgames', label: 'Drill' },
    });
  }
  return tasks;
}
