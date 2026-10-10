// Synthesised sound effects (no audio files needed). Browsers keep audio
// suspended until the user interacts with the page, so the context is
// created/resumed on the first tap or key press.
import { getCore } from './store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (!getCore().settings.sound) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
      // 0.4 s of white noise reused for clicks and thumps
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    master!.gain.value = (getCore().settings.volume ?? 70) / 100;
    return ctx;
  } catch {
    return null;
  }
}

/** Unlock audio on the first user gesture (required by browsers). */
export function installAudioUnlock() {
  const unlock = () => {
    audio();
    if (ctx?.state === 'running') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** A short filtered noise burst – the "wood" of a piece landing. */
function click(at: number, opts: { freq?: number; q?: number; gain?: number; dur?: number } = {}) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = opts.freq ?? 1800;
  bp.Q.value = opts.q ?? 1.2;
  const g = c.createGain();
  const dur = opts.dur ?? 0.07;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.9, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  src.connect(bp).connect(g).connect(master!);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/** A low sine "thump" that gives the click body. */
function thump(at: number, freq = 160, gain = 0.5, dur = 0.09) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.6, at);
  o.frequency.exponentialRampToValueAtTime(freq, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** A soft bell-like tone for musical cues. */
function tone(at: number, freq: number, dur = 0.25, gain = 0.18, type: OscillatorType = 'sine') {
  const c = ctx!;
  const o = c.createOscillator();
  const o2 = c.createOscillator();
  o.type = type;
  o2.type = 'sine';
  o.frequency.value = freq;
  o2.frequency.value = freq * 2.01; // gentle overtone
  const g = c.createGain();
  const g2 = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  g2.gain.value = 0.25;
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(master!);
  o.start(at);
  o2.start(at);
  o.stop(at + dur + 0.05);
  o2.stop(at + dur + 0.05);
}

function play(fn: (t: number) => void) {
  const c = audio();
  if (!c) return;
  try {
    fn(c.currentTime + 0.005);
  } catch {
    /* ignore */
  }
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

export const sound = {
  move: () =>
    play((t) => {
      click(t, { freq: 1900, gain: 0.8 });
      thump(t, 170, 0.35);
    }),
  capture: () =>
    play((t) => {
      click(t, { freq: 1500, gain: 1, dur: 0.09 });
      thump(t, 120, 0.55, 0.12);
      click(t + 0.035, { freq: 2600, gain: 0.5, dur: 0.05 });
    }),
  castle: () =>
    play((t) => {
      click(t, { freq: 1900, gain: 0.7 });
      thump(t, 170, 0.3);
      click(t + 0.11, { freq: 1700, gain: 0.8 });
      thump(t + 0.11, 150, 0.3);
    }),
  check: () =>
    play((t) => {
      click(t, { freq: 1900, gain: 0.8 });
      thump(t, 170, 0.35);
      tone(t + 0.02, NOTE(88), 0.22, 0.12, 'triangle');
    }),
  promote: () =>
    play((t) => {
      click(t, { freq: 1900, gain: 0.7 });
      [72, 76, 79, 84].forEach((n, i) => tone(t + 0.04 + i * 0.07, NOTE(n), 0.25, 0.12));
    }),
  start: () => play((t) => [67, 72].forEach((n, i) => tone(t + i * 0.12, NOTE(n), 0.35, 0.14))),
  win: () => play((t) => [72, 76, 79, 84, 88].forEach((n, i) => tone(t + i * 0.1, NOTE(n), i === 4 ? 0.8 : 0.3, 0.15))),
  lose: () => play((t) => [69, 65, 62, 57].forEach((n, i) => tone(t + i * 0.16, NOTE(n), i === 3 ? 0.7 : 0.3, 0.13, 'triangle'))),
  draw: () => play((t) => [67, 67].forEach((n, i) => tone(t + i * 0.18, NOTE(n), 0.35, 0.13))),
  good: () => play((t) => [79, 84].forEach((n, i) => tone(t + i * 0.08, NOTE(n), 0.3, 0.14))),
  solved: () => play((t) => [72, 79, 84, 91].forEach((n, i) => tone(t + i * 0.07, NOTE(n), i === 3 ? 0.6 : 0.25, 0.13))),
  bad: () =>
    play((t) => {
      tone(t, NOTE(50), 0.28, 0.16, 'sawtooth');
      tone(t + 0.12, NOTE(46), 0.3, 0.14, 'sawtooth');
    }),
  alert: () => play((t) => tone(t, NOTE(57), 0.35, 0.12, 'triangle')),
  /** Kept for older call sites: game over. */
  end: () => play((t) => [67, 64, 60].forEach((n, i) => tone(t + i * 0.14, NOTE(n), 0.35, 0.12))),
};

export function moveSound(san: string) {
  if (san.includes('#')) sound.check();
  else if (san.includes('=')) sound.promote();
  else if (san.includes('+')) sound.check();
  else if (san.startsWith('O-O')) sound.castle();
  else if (san.includes('x')) sound.capture();
  else sound.move();
}
