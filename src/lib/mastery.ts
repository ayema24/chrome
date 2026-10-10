// Opening mastery: per-line status from the spaced-repetition cards, rolled up
// per opening.
import { OPENINGS, type OpeningDef } from '../data/openings';
import { linesFor, type ParsedLine } from './openings';
import type { CoreData, LineCard } from './store';

export type LineStatus = 'new' | 'learning' | 'learned' | 'mastered';
export type OpeningStatus = 'new' | 'started' | 'learned' | 'mastered';

/** Perfect drills needed to call a line learned (same day is fine). */
export const LEARNED_BOX = 2;
/** Box reached after at least one on-schedule perfect review. */
export const MASTERED_BOX = 3;

export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  new: 'New',
  learning: 'Learning',
  learned: '🎓 Learned',
  mastered: '🏆 Mastered',
};

export const OPENING_STATUS_LABEL: Record<OpeningStatus, string> = {
  new: 'Not started',
  started: 'In progress',
  learned: '🎓 Learned',
  mastered: '🏆 Mastered',
};

export const cardKey = (openingId: string, lineIndex: number, color: 'w' | 'b') => `${openingId}#${lineIndex}#${color}`;

/** In trap lines the user plays the side that sets the trap, never the blunder. */
export function naturalSide(o: OpeningDef, line: ParsedLine): 'w' | 'b' {
  const bad = line.sans.findIndex((s) => /\?/.test(s));
  if (bad >= 0) return bad % 2 === 0 ? 'b' : 'w';
  return o.side;
}

export function lineStatus(card: LineCard | undefined): LineStatus {
  if (!card) return 'new';
  if (card.box >= MASTERED_BOX) return 'mastered';
  if (card.box >= LEARNED_BOX) return 'learned';
  return 'learning';
}

export function lineCardFor(core: CoreData, o: OpeningDef, line: ParsedLine): LineCard | undefined {
  return core.lineCards[cardKey(o.id, line.lineIndex, naturalSide(o, line))];
}

export interface OpeningProgress {
  status: OpeningStatus;
  total: number;
  learned: number; // learned or mastered
  mastered: number;
  practised: number;
}

export function openingProgress(core: CoreData, o: OpeningDef): OpeningProgress {
  const lines = linesFor(o.id);
  const st = lines.map((l) => lineStatus(lineCardFor(core, o, l)));
  const mastered = st.filter((s) => s === 'mastered').length;
  const learned = st.filter((s) => s === 'mastered' || s === 'learned').length;
  const practised = st.filter((s) => s !== 'new').length;
  const total = lines.length;
  const status: OpeningStatus = mastered === total ? 'mastered' : learned === total ? 'learned' : practised > 0 ? 'started' : 'new';
  return { status, total, learned, mastered, practised };
}

export function allOpeningProgress(core: CoreData): { opening: OpeningDef; progress: OpeningProgress }[] {
  return OPENINGS.map((opening) => ({ opening, progress: openingProgress(core, opening) }));
}

/** What the player needs to do next for this line, in words. */
export function nextStepText(card: LineCard | undefined, now = Date.now()): string {
  const st = lineStatus(card);
  if (!card || st === 'new') return 'Drill it twice without mistakes to learn it.';
  const when = card.due <= now ? 'now' : new Date(card.due).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (st === 'learning') return `${Math.max(1, LEARNED_BOX - card.box)} more perfect drill${LEARNED_BOX - card.box > 1 ? 's' : ''} to learn it.`;
  if (st === 'learned') return `Review it perfectly ${when === 'now' ? 'now' : `on ${when}`} to master it.`;
  return `Mastered. Next check-up ${when === 'now' ? 'is due now' : `on ${when}`}.`;
}
