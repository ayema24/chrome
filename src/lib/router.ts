import { useSyncExternalStore } from 'react';

export type Page = 'home' | 'play' | 'puzzles' | 'openings' | 'analysis' | 'games' | 'scan' | 'progress' | 'settings';

export interface Route {
  page: Page;
  params: Record<string, string>;
}

const PAGES: Page[] = ['home', 'play', 'puzzles', 'openings', 'analysis', 'games', 'scan', 'progress', 'settings'];

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const page = (PAGES.includes(path as Page) ? path : 'home') as Page;
  return { page, params: Object.fromEntries(new URLSearchParams(query)) };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  listeners.forEach((l) => l());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function navigate(page: Page | string, params: Record<string, string> = {}) {
  // Insight actions use a few virtual pages.
  let p = page;
  let extra: Record<string, string> = {};
  if (page === 'endgames') {
    p = 'puzzles';
    extra = { mode: 'endgames' };
  } else if (page === 'mistakes') {
    p = 'puzzles';
    extra = { mode: 'mistakes' };
  } else if (page === 'database') p = 'games';
  const q = new URLSearchParams({ ...extra, ...params }).toString();
  window.location.hash = `/${p}${q ? `?${q}` : ''}`;
  window.scrollTo({ top: 0 });
}

// Hand-off of data between pages (e.g. "analyse this position").
let pending: unknown = null;
export function setPending(v: unknown) {
  pending = v;
}
export function takePending<T>(): T | null {
  const v = pending as T | null;
  pending = null;
  return v;
}
