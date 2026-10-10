// Personal cross-device sync through a secret GitHub Gist.
// The token and gist id live only in this browser (localStorage), never in the
// synced data. Every sync is pull → merge → push, so training on two devices
// never overwrites anything.
import { useSyncExternalStore } from 'react';
import { applySynced, getCore, getGames, onLocalChange, DEFAULT_SETTINGS, type CoreData, type GameRecord } from './store';

const TOKEN_KEY = 'cc-sync-token';
const GIST_KEY = 'cc-sync-gist';
const FILE = 'chess-coach-sync.b64';
const DESCRIPTION = 'Chess Coach sync (private data – do not edit)';
const API = 'https://api.github.com';

export interface SyncData {
  app: 'chess-coach';
  v: 1;
  savedAt: number;
  core: CoreData;
  games: GameRecord[];
}

// ------------------------------------------------------------------ merge

function unionBy<T>(a: T[], b: T[], key: (x: T) => string, prefer?: (x: T, y: T) => T): T[] {
  const m = new Map<string, T>();
  for (const x of a) m.set(key(x), x);
  for (const y of b) {
    const k = key(y);
    const x = m.get(k);
    m.set(k, x && prefer ? prefer(x, y) : (x ?? y));
  }
  return [...m.values()];
}

function maxRecord(a: Record<string, number> = {}, b: Record<string, number> = {}): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? -Infinity, v);
  return out;
}

/** Merges two copies of the data without losing either side's training. */
export function mergeData(local: { core: CoreData; games: GameRecord[] }, remote: { core: CoreData; games: GameRecord[] }) {
  const L = local.core;
  const R = remote.core;
  const newer = (L.updatedAt ?? 0) >= (R.updatedAt ?? 0) ? L : R;

  const puzzleAttempts = unionBy(L.puzzleAttempts, R.puzzleAttempts, (x) => `${x.t}|${x.id}`).sort((a, b) => a.t - b.t);
  const playResults = unionBy(L.playResults, R.playResults, (x) => `${x.t}|${x.gameId}`).sort((a, b) => a.t - b.t);
  const lineCards: CoreData['lineCards'] = { ...R.lineCards };
  for (const [k, c] of Object.entries(L.lineCards)) {
    const r = lineCards[k];
    if (!r || c.lastPracticed >= r.lastPracticed) lineCards[k] = c;
  }
  const deletedGames = [...new Set([...(L.deletedGames ?? []), ...(R.deletedGames ?? [])])];
  const gone = new Set(deletedGames);

  const core: CoreData = {
    ...newer,
    // Settings follow the most recently edited device, but credentials stay local.
    settings: { ...DEFAULT_SETTINGS, ...newer.settings, lichessToken: L.settings.lichessToken },
    createdAt: Math.min(L.createdAt, R.createdAt),
    puzzleAttempts,
    puzzleRating: puzzleAttempts.length ? puzzleAttempts[puzzleAttempts.length - 1].ratingAfter : newer.puzzleRating,
    playResults,
    playRating: playResults.length ? playResults[playResults.length - 1].ratingAfter : newer.playRating,
    lineCards,
    drillResults: unionBy(L.drillResults, R.drillResults, (x) => `${x.t}|${x.key}`).sort((a, b) => a.t - b.t),
    endgameResults: unionBy(L.endgameResults, R.endgameResults, (x) => `${x.t}|${x.id}`).sort((a, b) => a.t - b.t),
    mistakeDeck: unionBy(L.mistakeDeck, R.mistakeDeck, (x) => x.puzzle.id, (x, y) => (y.attempts > x.attempts ? y : x)).filter(
      (m) => !gone.has(m.gameId),
    ),
    lessonsViewed: maxRecord(L.lessonsViewed, R.lessonsViewed),
    rushBest: maxRecord(L.rushBest, R.rushBest),
    visionBest: maxRecord(L.visionBest, R.visionBest),
    guessScores: maxRecord(L.guessScores, R.guessScores),
    deletedGames,
    updatedAt: Math.max(L.updatedAt ?? 0, R.updatedAt ?? 0),
  };

  const games = unionBy(local.games, remote.games, (g) => g.id, (x, y) => {
    if (x.analysis && !y.analysis) return x;
    if (y.analysis && !x.analysis) return y;
    return (y.analysis?.analysedAt ?? 0) > (x.analysis?.analysedAt ?? 0) ? y : x;
  }).filter((g) => !gone.has(g.id));

  return { core, games };
}

// --------------------------------------------------------------- encoding

async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gunzipBase64(b64: string): Promise<string> {
  const bin = atob(b64.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ------------------------------------------------------------- GitHub API

async function gh(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) throw new Error('GitHub rejected the token. Create a new one with the “gist” permission.');
  if (res.status === 403 || res.status === 404) {
    const body = await res.text().catch(() => '');
    throw new Error(res.status === 404 ? 'Sync gist not found (or the token lacks the “gist” permission).' : `GitHub refused the request: ${body.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  return res;
}

async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const res = await gh(`/gists?per_page=100&page=${page}`, token);
    const list = (await res.json()) as { id: string; description: string; files: Record<string, unknown> }[];
    const hit = list.find((g) => g.files && FILE in g.files);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

async function readGist(token: string, id: string): Promise<SyncData | null> {
  const res = await gh(`/gists/${id}`, token);
  const gist = (await res.json()) as { files: Record<string, { content?: string; truncated?: boolean; raw_url: string }> };
  const f = gist.files[FILE];
  if (!f) return null;
  let content = f.content ?? '';
  if (f.truncated || !content) content = await (await fetch(f.raw_url)).text();
  if (!content.trim()) return null;
  const data = JSON.parse(await gunzipBase64(content)) as SyncData;
  return data.app === 'chess-coach' ? data : null;
}

async function writeGist(token: string, id: string | null, data: SyncData): Promise<string> {
  const content = await gzipBase64(JSON.stringify(data));
  const body = JSON.stringify({ description: DESCRIPTION, public: false, files: { [FILE]: { content } } });
  const res = id ? await gh(`/gists/${id}`, token, { method: 'PATCH', body }) : await gh('/gists', token, { method: 'POST', body });
  return ((await res.json()) as { id: string }).id;
}

// ----------------------------------------------------------- sync engine

export interface SyncStatus {
  configured: boolean;
  state: 'idle' | 'syncing' | 'error' | 'off';
  lastSync: number | null;
  error: string | null;
  gistId: string | null;
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

let status: SyncStatus = {
  configured: !!readLocal(TOKEN_KEY),
  state: readLocal(TOKEN_KEY) ? 'idle' : 'off',
  lastSync: Number(readLocal('cc-sync-last')) || null,
  error: null,
  gistId: readLocal(GIST_KEY),
};
const listeners = new Set<() => void>();
function set(p: Partial<SyncStatus>) {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
}
export function useSync(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

let running: Promise<void> | null = null;
let again = false;

/** Pull, merge, apply locally and push. Safe to call often. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const token = readLocal(TOKEN_KEY);
    if (!token) return;
    set({ state: 'syncing', error: null });
    try {
      let id = readLocal(GIST_KEY) ?? (await findGist(token));
      const remote = id ? await readGist(token, id) : null;
      // Merge with the latest local data (read after the network call so edits made meanwhile survive).
      let merged = { core: getCore(), games: getGames() };
      if (remote) {
        merged = mergeData(merged, remote);
        applySynced(merged.core, merged.games);
      }
      // Never upload credentials.
      const upload: SyncData = {
        app: 'chess-coach',
        v: 1,
        savedAt: Date.now(),
        core: { ...merged.core, settings: { ...merged.core.settings, lichessToken: '' } },
        games: merged.games,
      };
      id = await writeGist(token, id, upload);
      writeLocal(GIST_KEY, id);
      writeLocal('cc-sync-last', String(Date.now()));
      set({ state: 'idle', lastSync: Date.now(), gistId: id });
    } catch (e) {
      const msg = e instanceof TypeError ? 'Couldn’t reach GitHub – are you online?' : (e as Error).message || 'Sync failed';
      set({ state: 'error', error: msg });
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

export async function connectSync(token: string): Promise<void> {
  writeLocal(TOKEN_KEY, token.trim());
  writeLocal(GIST_KEY, null);
  set({ configured: true, state: 'idle', gistId: null, error: null });
  await syncNow();
}

export function disconnectSync() {
  writeLocal(TOKEN_KEY, null);
  writeLocal(GIST_KEY, null);
  set({ configured: false, state: 'off', gistId: null, error: null });
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Starts automatic sync: on launch, after changes (debounced), and when the app regains focus. */
export function startAutoSync() {
  if (status.configured) void syncNow();
  onLocalChange(() => {
    if (!status.configured) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 8000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && status.configured && Date.now() - (status.lastSync ?? 0) > 60000) void syncNow();
    if (document.visibilityState === 'hidden' && timer && status.configured) {
      clearTimeout(timer);
      timer = null;
      void syncNow();
    }
  });
  window.addEventListener('online', () => status.configured && void syncNow());
}

export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Chess%20Coach%20sync';
