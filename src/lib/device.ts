import { useEffect, useState, useSyncExternalStore } from 'react';

/** Matches the phone layout breakpoint in app.css. */
export const MOBILE_QUERY = '(max-width: 820px)';

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);

/** True when running as an installed app (home-screen icon) rather than in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ------------------------------------------------------------------ install
// Chrome/Edge/Samsung Internet fire `beforeinstallprompt` when the app can be
// installed; we keep it so an "Install app" button can show the real prompt.
// iOS Safari never fires it, so there we show "Share → Add to Home Screen".

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function installPromptListener() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export type InstallState = 'installed' | 'prompt' | 'ios' | 'unsupported';

function installState(): InstallState {
  if (installed || isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIos()) return 'ios';
  return 'unsupported';
}

export function useInstall() {
  const state = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    installState,
  );
  async function install() {
    if (!deferred) return;
    const e = deferred;
    deferred = null;
    await e.prompt();
    await e.userChoice.catch(() => null);
    emit();
  }
  return { state, install };
}
