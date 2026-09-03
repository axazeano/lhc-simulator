import type { Histogram } from './histogram';

/**
 * Peak fit: a Gaussian on top of an exponential background, fitted to a histogram range by
 * minimising the Neyman χ² (variance = counts, floored at one) with the Nelder–Mead simplex.
 * Uncertainties come from the curvature of χ² at the minimum. The model is deliberately the
 * textbook one: the peak position gives the mass, the width the resolution plus the natural
 * width, the area the yield.
 */

export interface PeakFit {
  /** Peak position, in the histogram's units. */
  mean: number;
  meanError: number;
  /** Gaussian σ. */
  sigma: number;
  sigmaError: number;
  /** Events under the Gaussian. */
  yield: number;
  yieldError: number;
  /** Background events under the peak within ±2σ. */
  backgroundUnderPeak: number;
  chi2: number;
  ndf: number;
  /** Background parameters: counts per bin at the range centre and slope per unit. */
  background: { amplitude: number; slope: number };
  range: { min: number; max: number };
  converged: boolean;
}

export interface PeakGuess {
  mean: number;
  sigma: number;
}

function model(p: number[], x: number, centre: number): number {
  const [amp, mean, sigma, bkg, slope] = p as [number, number, number, number, number];
  const g = amp * Math.exp(-((x - mean) ** 2) / (2 * sigma * sigma));
  return g + bkg * Math.exp(slope * (x - centre));
}

/** Nelder–Mead minimisation of f from x0; returns the best point. */
export function nelderMead(f: (p: number[]) => number, x0: number[], scale: number[], iterations = 4000, tolerance = 1e-9): { x: number[]; value: number; converged: boolean } {
  const n = x0.length;
  const simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const v = x0.slice();
    v[i]! += scale[i]!;
    simplex.push(v);
  }
  let values = simplex.map(f);
  let converged = false;
  for (let it = 0; it < iterations; it++) {
    const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
    const sorted = order.map((i) => simplex[i]!);
    const sortedValues = order.map((i) => values[i]!);
    simplex.splice(0, n + 1, ...sorted);
    values = sortedValues;
    const best = values[0]!;
    const worst = values[n]!;
    if (Math.abs(worst - best) <= tolerance * (Math.abs(best) + 1e-12)) {
      converged = true;
      break;
    }
    const centroid = Array.from({ length: n }, (_, j) => simplex.slice(0, n).reduce((s, v) => s + v[j]!, 0) / n);
    const reflect = centroid.map((c, j) => c + (c - simplex[n]![j]!));
    const fr = f(reflect);
    if (fr < values[0]!) {
      const expand = centroid.map((c, j) => c + 2 * (c - simplex[n]![j]!));
      const fe = f(expand);
      if (fe < fr) {
        simplex[n] = expand;
        values[n] = fe;
      } else {
        simplex[n] = reflect;
        values[n] = fr;
      }
    } else if (fr < values[n - 1]!) {
      simplex[n] = reflect;
      values[n] = fr;
    } else {
      const contract = centroid.map((c, j) => c + 0.5 * (simplex[n]![j]! - c));
      const fc = f(contract);
      if (fc < values[n]!) {
        simplex[n] = contract;
        values[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i]!.map((v, j) => simplex[0]![j]! + 0.5 * (v - simplex[0]![j]!));
          values[i] = f(simplex[i]!);
        }
      }
    }
  }
  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  return { x: simplex[order[0]!]!, value: values[order[0]!]!, converged };
}

export function fitPeak(histogram: Histogram, range: { min: number; max: number }, guess: PeakGuess): PeakFit {
  const first = Math.max(0, histogram.binOf(range.min));
  const last = Math.min(histogram.spec.bins - 1, histogram.binOf(range.max - 1e-9));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let b = first; b <= last; b++) {
    xs.push(histogram.binCenter(b));
    ys.push(histogram.counts[b]!);
  }
  const centre = (range.min + range.max) / 2;
  const chi2 = (p: number[]) => {
    if (p[2]! <= 0 || p[0]! < 0 || p[3]! < 0) return 1e30;
    let sum = 0;
    for (let i = 0; i < xs.length; i++) {
      const expected = model(p, xs[i]!, centre);
      const variance = Math.max(1, ys[i]!);
      sum += (ys[i]! - expected) ** 2 / variance;
    }
    return sum;
  };
  // Initial guesses: background from the range edges, peak height from the bin at the guess.
  const edgeLeft = Math.max(1, ys[0]! );
  const edgeRight = Math.max(1, ys[ys.length - 1]!);
  const slope0 = Math.log(edgeRight / edgeLeft) / Math.max(1e-9, range.max - range.min);
  const bkg0 = Math.sqrt(edgeLeft * edgeRight);
  const peakBin = Math.max(0, Math.min(ys.length - 1, Math.round((guess.mean - range.min) / histogram.width) - 0));
  const amp0 = Math.max(1, ys[peakBin]! - bkg0);
  const x0 = [amp0, guess.mean, guess.sigma, bkg0, slope0];
  const scale = [amp0 * 0.3, guess.sigma * 0.5, guess.sigma * 0.3, bkg0 * 0.3 + 1, 0.01];
  const result = nelderMead(chi2, x0, scale);
  const p = result.x;
  const [amp, mean, sigma, bkg, slope] = p as [number, number, number, number, number];
  const width = histogram.width;
  const yieldValue = (amp * sigma * Math.sqrt(2 * Math.PI)) / width;

  // Errors from the numerical Hessian of χ²: covariance = 2 H⁻¹.
  const errors = parameterErrors(chi2, p, scale.map((s) => s * 0.05));
  const ampErr = errors[0]!;
  const sigmaErr = errors[2]!;
  const yieldErr = yieldValue * Math.hypot(amp > 0 ? ampErr / amp : 0, sigma > 0 ? sigmaErr / sigma : 0);
  let bkgUnder = 0;
  for (let i = 0; i < xs.length; i++) {
    if (Math.abs(xs[i]! - mean) <= 2 * sigma) bkgUnder += bkg * Math.exp(slope * (xs[i]! - centre));
  }
  return {
    mean,
    meanError: errors[1]!,
    sigma,
    sigmaError: sigmaErr,
    yield: yieldValue,
    yieldError: yieldErr,
    backgroundUnderPeak: bkgUnder,
    chi2: result.value,
    ndf: Math.max(1, xs.length - 5),
    background: { amplitude: bkg, slope },
    range,
    converged: result.converged,
  };
}

/** Diagonal errors from a finite-difference Hessian of χ²; returns Infinity where the curvature is not positive. */
function parameterErrors(chi2: (p: number[]) => number, p: number[], steps: number[]): number[] {
  const f0 = chi2(p);
  return p.map((_, i) => {
    const h = Math.max(1e-9, Math.abs(steps[i]!));
    const plus = p.slice();
    plus[i]! += h;
    const minus = p.slice();
    minus[i]! -= h;
    const second = (chi2(plus) - 2 * f0 + chi2(minus)) / (h * h);
    return second > 0 ? Math.sqrt(2 / second) : Infinity;
  });
}
