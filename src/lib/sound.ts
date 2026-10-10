import { getCore } from './store';

let ctx: AudioContext | null = null;

function beep(freq: number, dur: number, type: OscillatorType = 'triangle', gain = 0.08) {
  if (!getCore().settings.sound) return;
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {
    /* audio unavailable */
  }
}

export const sound = {
  move: () => beep(520, 0.07),
  capture: () => beep(300, 0.1, 'square', 0.05),
  check: () => beep(760, 0.12, 'sawtooth', 0.04),
  good: () => {
    beep(660, 0.09);
    setTimeout(() => beep(880, 0.12), 90);
  },
  bad: () => beep(180, 0.25, 'sawtooth', 0.05),
  end: () => {
    beep(440, 0.12);
    setTimeout(() => beep(330, 0.2), 120);
  },
};

export function moveSound(san: string) {
  if (san.includes('+') || san.includes('#')) sound.check();
  else if (san.includes('x')) sound.capture();
  else sound.move();
}
