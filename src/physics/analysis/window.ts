import type { Histogram } from './histogram';

/**
 * The classic counting experiment: count events in a mass window, estimate the background
 * from equal-width sidebands on both sides, and quote S/√B.
 * https://en.wikipedia.org/wiki/Statistical_significance
 */

export interface MassWindow {
  minGeV: number;
  maxGeV: number;
}

export interface WindowAnalysis {
  window: MassWindow;
  sidebands: [MassWindow, MassWindow];
  observed: number;
  background: number;
  signal: number;
  /** S / √B, with B floored at one event so a single count never claims infinite significance. */
  significance: number;
}

export function analyseWindow(histogram: Histogram, window: MassWindow): WindowAnalysis {
  const width = window.maxGeV - window.minGeV;
  const half = width / 2;
  const left: MassWindow = { minGeV: window.minGeV - half, maxGeV: window.minGeV };
  const right: MassWindow = { minGeV: window.maxGeV, maxGeV: window.maxGeV + half };
  const observed = histogram.integral(window.minGeV, window.maxGeV);
  const background = histogram.integral(left.minGeV, left.maxGeV) + histogram.integral(right.minGeV, right.maxGeV);
  const signal = observed - background;
  const significance = signal / Math.sqrt(Math.max(background, 1));
  return { window, sidebands: [left, right], observed, background, signal, significance };
}
