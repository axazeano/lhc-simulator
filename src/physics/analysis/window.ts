import type { Histogram } from './histogram';

/**
 * The classic counting experiment: count events in a mass window, estimate the background
 * from equal-width sidebands on both sides, and quote S/√B.
 *
 * The background under the window is interpolated assuming it falls (or rises) exponentially
 * across the three regions, which is exact for an exponential spectrum and close for the
 * power laws met here. A straight average of the two sidebands would overestimate a convex
 * background by about a per cent, enough to swallow a Higgs signal that is a few per cent
 * of the background.
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

/**
 * Background expected in a window of width W from sidebands of width W/2 on each side,
 * assuming an exponential shape. With x = (R/L)^(1/3) the window holds L·x·(1 + x).
 * Falls back to L + R (flat interpolation) when either sideband is empty.
 */
export function interpolateBackground(left: number, right: number): number {
  if (left <= 0 || right <= 0) return left + right;
  const x = Math.cbrt(right / left);
  return left * x * (1 + x);
}

export function analyseWindow(histogram: Histogram, window: MassWindow): WindowAnalysis {
  const width = window.maxGeV - window.minGeV;
  const half = width / 2;
  const left: MassWindow = { minGeV: window.minGeV - half, maxGeV: window.minGeV };
  const right: MassWindow = { minGeV: window.maxGeV, maxGeV: window.maxGeV + half };
  const observed = histogram.integral(window.minGeV, window.maxGeV);
  const leftCount = histogram.integral(left.minGeV, left.maxGeV);
  const rightCount = histogram.integral(right.minGeV, right.maxGeV);
  const background = interpolateBackground(leftCount, rightCount);
  const signal = observed - background;
  const significance = signal / Math.sqrt(Math.max(background, 1));
  return { window, sidebands: [left, right], observed, background, signal, significance };
}
