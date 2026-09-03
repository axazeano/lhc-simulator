/**
 * Tiny synthesised sound cues through Web Audio, no assets. Every cue is a short sequence of
 * tones; the player can mute them, and the choice is remembered in the browser.
 */

export type Cue = 'inject' | 'lost' | 'complete' | 'fiveSigma' | 'click';

const STORAGE_KEY = 'lhc-simulator.sound';

let context: AudioContext | null = null;
let muted = loadMuted();

function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'off' : 'on');
  } catch {
    // ignore
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === 'suspended') void context.resume();
  return context;
}

interface Note {
  frequency: number;
  /** Seconds after the cue starts. */
  at: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

const CUES: Record<Cue, Note[]> = {
  click: [{ frequency: 660, at: 0, duration: 0.04, type: 'square', gain: 0.03 }],
  inject: [
    { frequency: 440, at: 0, duration: 0.09, type: 'triangle' },
    { frequency: 660, at: 0.1, duration: 0.14, type: 'triangle' },
  ],
  lost: [
    { frequency: 220, at: 0, duration: 0.18, type: 'sawtooth', gain: 0.08 },
    { frequency: 150, at: 0.16, duration: 0.3, type: 'sawtooth', gain: 0.08 },
  ],
  complete: [
    { frequency: 523, at: 0, duration: 0.12 },
    { frequency: 659, at: 0.12, duration: 0.12 },
    { frequency: 784, at: 0.24, duration: 0.12 },
    { frequency: 1047, at: 0.36, duration: 0.3 },
  ],
  fiveSigma: [
    { frequency: 880, at: 0, duration: 0.1 },
    { frequency: 1320, at: 0.1, duration: 0.35 },
  ],
};

export function play(cue: Cue): void {
  if (muted) return;
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const note of CUES[cue]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type ?? 'sine';
    osc.frequency.value = note.frequency;
    const level = note.gain ?? 0.06;
    gain.gain.setValueAtTime(0, now + note.at);
    gain.gain.linearRampToValueAtTime(level, now + note.at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.duration + 0.02);
  }
}
