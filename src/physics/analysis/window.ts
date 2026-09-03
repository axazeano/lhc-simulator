import type { Histogram } from './histogram';

/**
 * The classic counting experiment: count events in a mass window, estimate the background
 * under it from the sidebands, and quote S/√B.
 *
 * The background is fitted to the sidebands (two window widths on each side) with a smooth
 * curve, ln f(m) = a + b·(m − m₀) + c·(m − m₀)², and integrated over the window. A curve with
 * curvature is needed because the background's slope changes across the spectrum, for
 * example where the detector acceptance is still rising; a straight exponential between two
 * narrow sidebands can be off by a few per cent, which is more than a Higgs signal.
 * When the sidebands hold too few events for a fit, the estimate falls back to an
 * exponential interpolation between the two neighbouring sidebands.
 * https://en.wikipedia.org/wiki/Statistical_significance
 */

export interface MassWindow {
  minGeV: number;
  maxGeV: number;
}

export interface WindowAnalysis {
  window: MassWindow;
  /** The regions the background was estimated from. */
  sidebands: [MassWindow, MassWindow];
  observed: number;
  background: number;
  signal: number;
  /** S / √B, with B floored at one event so a single count never claims infinite significance. */
  significance: number;
  /** 'fit' when the smooth curve was used, 'interpolation' for the sparse fallback. */
  method: 'fit' | 'interpolation';
}

/** Sideband width on each side of the window, in window widths. */
const SIDEBAND_WIDTHS = 2;
/** Minimum events in the sidebands for the curve fit; below it the plain interpolation is used. */
const MIN_EVENTS_FOR_FIT = 200;

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

/** Weighted least squares of y on 1, x, x²; returns [a, b, c] or null if singular. */
function fitQuadratic(xs: number[], ys: number[], ws: number[]): [number, number, number] | null {
  const A = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    const w = ws[i]!;
    const y = ys[i]!;
    const p = [1, x, x * x, x * x * x, x * x * x * x];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) A[r]![c]! += w * p[r + c]!;
      A[r]![3]! += w * y * p[r]!;
    }
  }
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[pivot]![col]!)) pivot = r;
    [A[col], A[pivot]] = [A[pivot]!, A[col]!];
    const p = A[col]![col]!;
    if (Math.abs(p) < 1e-12) return null;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = A[r]![col]! / p;
      for (let c = col; c < 4; c++) A[r]![c]! -= f * A[col]![c]!;
    }
  }
  return [A[0]![3]! / A[0]![0]!, A[1]![3]! / A[1]![1]!, A[2]![3]! / A[2]![2]!];
}

export function analyseWindow(histogram: Histogram, window: MassWindow): WindowAnalysis {
  const width = window.maxGeV - window.minGeV;
  const [left, right] = sidebandsOf(histogram, window);
  const observed = histogram.integral(window.minGeV, window.maxGeV);
  const sidebandTotal = histogram.integral(left.minGeV, left.maxGeV) + histogram.integral(right.minGeV, right.maxGeV);

  let background: number | null = null;
  let method: WindowAnalysis['method'] = 'interpolation';
  if (sidebandTotal >= MIN_EVENTS_FOR_FIT) {
    background = fitBackground(histogram, window, left, right);
    if (background !== null) method = 'fit';
  }
  if (background === null) {
    const half = width / 2;
    background = interpolateBackground(
      histogram.integral(window.minGeV - half, window.minGeV),
      histogram.integral(window.maxGeV, window.maxGeV + half),
    );
  }
  const signal = observed - background;
  const significance = signal / Math.sqrt(Math.max(background, 1));
  return { window, sidebands: [left, right], observed, background, signal, significance, method };
}

/** The sidebands used for a window: two window widths on each side, clipped to the histogram. */
export function sidebandsOf(histogram: Histogram, window: MassWindow): [MassWindow, MassWindow] {
  const width = window.maxGeV - window.minGeV;
  const { spec } = histogram;
  return [
    { minGeV: Math.max(spec.min, window.minGeV - SIDEBAND_WIDTHS * width), maxGeV: window.minGeV },
    { minGeV: window.maxGeV, maxGeV: Math.min(spec.max, window.maxGeV + SIDEBAND_WIDTHS * width) },
  ];
}

/**
 * The smooth background fitted to the sidebands, as counts per histogram bin at mass m,
 * for drawing under the data. Null when the sidebands are too sparse for the fit.
 */
export function backgroundCurve(histogram: Histogram, window: MassWindow): ((m: number) => number) | null {
  const [left, right] = sidebandsOf(histogram, window);
  const total = histogram.integral(left.minGeV, left.maxGeV) + histogram.integral(right.minGeV, right.maxGeV);
  if (total < MIN_EVENTS_FOR_FIT) return null;
  const density = fitSidebands(histogram, window, left, right);
  return density ? (m) => density(m) * histogram.width : null;
}

/** Fit ln(density) on the sideband slices with a quadratic; returns the density in events per GeV. */
function fitSidebands(histogram: Histogram, window: MassWindow, left: MassWindow, right: MassWindow): ((m: number) => number) | null {
  const centre = (window.minGeV + window.maxGeV) / 2;
  const scale = window.maxGeV - window.minGeV;
  // Group bins into slices of about a tenth of the window so that every point has counts.
  const slice = Math.max(histogram.width, scale / 10);
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  for (const band of [left, right]) {
    for (let lo = band.minGeV; lo < band.maxGeV - 1e-9; lo += slice) {
      const hi = Math.min(band.maxGeV, lo + slice);
      const count = histogram.integral(lo, hi);
      if (count <= 0) continue;
      const density = count / (hi - lo);
      xs.push(((lo + hi) / 2 - centre) / scale);
      ys.push(Math.log(density));
      // Poisson: the variance of ln(count) is about 1/count.
      ws.push(count);
    }
  }
  if (xs.length < 6) return null;
  const fit = fitQuadratic(xs, ys, ws);
  if (!fit) return null;
  const [a, b, c] = fit;
  return (m: number) => {
    const x = (m - centre) / scale;
    return Math.exp(a + b * x + c * x * x);
  };
}

/** Integrate the fitted sideband density over the window; null when the fit is impossible. */
function fitBackground(histogram: Histogram, window: MassWindow, left: MassWindow, right: MassWindow): number | null {
  const density = fitSidebands(histogram, window, left, right);
  if (!density) return null;
  const steps = 200;
  const h = (window.maxGeV - window.minGeV) / steps;
  let total = 0;
  for (let i = 0; i < steps; i++) total += density(window.minGeV + (i + 0.5) * h) * h;
  return Number.isFinite(total) ? total : null;
}
