import { Histogram, type HistogramSpec } from '../analysis/histogram';
import { reconstructParticle, type DetectorModel, type SelectionCuts } from '../detector/detector';
import { add, azimuth, fromPtRapidityPhiM, invariantMass, pseudorapidity, rapidity, transverseMomentum, type FourVector } from '../fourvector';
import type { RecordedParticle } from './eventStore';
import type { Random } from '../random';
import { PARTICLES } from '../../data/particles';
import { BREIT_WIGNER_REACH, decayForProcess, generateWeightedEvent, powerLawMassDensity } from './generator';
import type { ProcessDefinition } from './processes';

/**
 * A pool describes the reconstructed events of one process at one √s, recorded at the
 * channel's lowest threshold. Frequent processes are sampled from the pool instead of being
 * simulated one by one.
 *
 * The pool keeps two things:
 * - a smoothed mass density built from a large importance-sampled Monte Carlo run, from which
 *   fresh masses are drawn every time, so the finite Monte Carlo sample never freezes into
 *   the data;
 * - the reconstructed events themselves, from which the smallest pT of a drawn event is taken
 *   (an event from the same mass bin), so the correlation between mass and pT is kept for
 *   the offline threshold.
 */

export interface PoolEvent {
  massGeV: number;
  minPtGeV: number;
  weight: number;
  particles: RecordedParticle[];
  /** Kinematics of the (reconstructed) parent, so a fresh decay can be thrown for a draw. */
  parent: { ptGeV: number; rapidity: number; phi: number };
}

/** A contiguous range of mass bins with its own sampling table. */
export interface Region {
  /** First bin (inclusive) and last bin (exclusive). */
  start: number;
  end: number;
  /** Cumulative density over the bins of the region. */
  cumulative: Float64Array;
  /** Share of the whole density that falls in this region. */
  fraction: number;
}

export interface EventPool {
  spec: HistogramSpec;
  process: ProcessDefinition;
  detector: DetectorModel;
  recordingCuts: SelectionCuts;
  events: PoolEvent[];
  /** Fraction of generated events (weighted) that pass acceptance at the recording threshold. */
  acceptance: number;
  /** Smoothed, normalised mass density per bin. */
  density: Float64Array;
  /** Events at or above the channel's unprescaled mass. */
  high: Region;
  /** Events below it, the bulk that gets prescaled. */
  low: Region;
  /** CSR index of pool events by mass bin: events of bin b are binIndex[binStart[b] .. binStart[b+1]). */
  binStart: Int32Array;
  binIndex: Int32Array;
  /** For each bin, the slice of binIndex (start, end) wide enough around it to hold a pT sample. */
  ptSliceStart: Int32Array;
  ptSliceEnd: Int32Array;
}

const POOL_MIN_ACCEPTED = 12000;
const POOL_MAX_SAMPLES = 400000;
const CONTINUUM_MIN_ACCEPTED = 20000;
/** Pool events a pT draw chooses from: bins around the mass are widened until this many are available. */
const PT_SAMPLE_SIZE = 300;
/**
 * Share of 'mixed' draws taken uniformly over the mass region rather than from the density.
 * Small, so that most records carry nearly the same weight (low variance in every bin), yet
 * enough to keep the sparse tails populated.
 */
const UNIFORM_SHARE = 0.15;

/** Reconstruct every particle; returns the mass, the smallest pT and the measured particles, or null if any is lost. */
export function reconstructRecord(
  daughters: readonly FourVector[],
  kinds: readonly ('muon' | 'electron' | 'photon')[],
  charges: readonly number[],
  detector: DetectorModel,
  cuts: SelectionCuts,
  rng: Random,
): { massGeV: number; minPtGeV: number; vectors: FourVector[]; particles: RecordedParticle[] } | null {
  let sum: FourVector = { e: 0, px: 0, py: 0, pz: 0 };
  let minPt = Infinity;
  const vectors: FourVector[] = [];
  const particles: RecordedParticle[] = [];
  for (let i = 0; i < daughters.length; i++) {
    const kind = kinds[i] ?? 'muon';
    const measured = reconstructParticle(daughters[i]!, kind, detector, cuts, rng);
    if (!measured) return null;
    vectors.push(measured);
    sum = add(sum, measured);
    const pt = transverseMomentum(measured);
    if (pt < minPt) minPt = pt;
    particles.push({ kind, ptGeV: pt, eta: pseudorapidity(measured), phi: azimuth(measured), charge: charges[i] ?? 0 });
  }
  return { massGeV: invariantMass(sum), minPtGeV: minPt, vectors, particles };
}

export function buildEventPool(
  process: ProcessDefinition,
  sqrtSGeV: number,
  recordingCuts: SelectionCuts,
  detector: DetectorModel,
  spec: HistogramSpec,
  rng: Random,
  unprescaledFromGeV = 0,
  maxSamples = POOL_MAX_SAMPLES,
): EventPool {
  const isContinuum = process.kind === 'continuum';
  const target = isContinuum ? CONTINUUM_MIN_ACCEPTED : POOL_MIN_ACCEPTED;
  const events: PoolEvent[] = [];
  const raw = new Histogram(spec);
  // True (generated) masses, all events and accepted ones, for the acceptance fit.
  const generated = new Histogram(spec);
  const acceptedTrue = new Histogram(spec);
  let samples = 0;
  let acceptedWeight = 0;
  let resolutionSum = 0;
  while (samples < maxSamples && events.length < target) {
    samples += 1;
    const event = generateWeightedEvent(process, sqrtSGeV, rng);
    generated.fill(event.massGeV, event.weight);
    const record = reconstructRecord(event.daughters, event.kinds, event.charges, detector, recordingCuts, rng);
    if (!record) continue;
    const parentVector = record.vectors.reduce((sum, v) => add(sum, v), { e: 0, px: 0, py: 0, pz: 0 });
    events.push({
      massGeV: record.massGeV,
      minPtGeV: record.minPtGeV,
      weight: event.weight,
      particles: record.particles,
      parent: { ptGeV: transverseMomentum(parentVector), rapidity: rapidity(parentVector), phi: azimuth(parentVector) },
    });
    raw.fill(record.massGeV, event.weight);
    acceptedTrue.fill(event.massGeV, event.weight);
    acceptedWeight += event.weight;
    resolutionSum += event.weight * ((record.massGeV - event.massGeV) / event.massGeV) ** 2;
  }
  const resolution = acceptedWeight > 0 ? Math.sqrt(resolutionSum / acceptedWeight) : 0.01;
  let smoothed: Float64Array;
  if (isContinuum && process.massRangeGeV && process.powerLawIndex !== undefined) {
    smoothed = continuumDensity(raw, generated, process.massRangeGeV[0], process.massRangeGeV[1], process.powerLawIndex);
  } else if (process.kind === 'resonance' && process.particle) {
    const particle = PARTICLES[process.particle];
    smoothed = resonanceDensity(acceptedTrue, generated, particle.massGeV, particle.widthGeV, resolution, spec);
  } else {
    smoothed = Float64Array.from(raw.counts);
  }
  let total = 0;
  for (let b = 0; b < smoothed.length; b++) total += smoothed[b]!;
  const density = new Float64Array(spec.bins);
  if (total > 0) for (let b = 0; b < spec.bins; b++) density[b] = smoothed[b]! / total;

  const splitBin = Math.max(0, Math.min(spec.bins, Math.ceil((unprescaledFromGeV - spec.min) / raw.width)));
  const region = (start: number, end: number): Region => {
    const cumulative = new Float64Array(Math.max(0, end - start));
    let running = 0;
    for (let b = start; b < end; b++) {
      running += density[b]!;
      cumulative[b - start] = running;
    }
    return { start, end, cumulative, fraction: running };
  };

  // Index events by bin (CSR).
  const counts = new Int32Array(spec.bins + 1);
  const binOf = (m: number) => Math.min(spec.bins - 1, Math.max(0, Math.floor((m - spec.min) / raw.width)));
  for (const e of events) {
    const b = binOf(e.massGeV) + 1;
    counts[b] = counts[b]! + 1;
  }
  const binStart = new Int32Array(spec.bins + 1);
  for (let b = 0; b < spec.bins; b++) binStart[b + 1] = binStart[b]! + counts[b + 1]!;
  const fill = new Int32Array(spec.bins);
  const binIndex = new Int32Array(events.length);
  for (let i = 0; i < events.length; i++) {
    const b = binOf(events[i]!.massGeV);
    binIndex[binStart[b]! + fill[b]!] = i;
    fill[b] = fill[b]! + 1;
  }

  // pT sampling neighbourhoods: widen around each bin until enough pool events are inside,
  // because the pT distribution changes slowly with mass while single bins hold only a few events.
  const ptSliceStart = new Int32Array(spec.bins);
  const ptSliceEnd = new Int32Array(spec.bins);
  for (let b = 0; b < spec.bins; b++) {
    let lo = b;
    let hi = b;
    while (binStart[hi + 1]! - binStart[lo]! < PT_SAMPLE_SIZE && (lo > 0 || hi < spec.bins - 1)) {
      if (lo > 0) lo -= 1;
      if (hi < spec.bins - 1) hi += 1;
    }
    ptSliceStart[b] = binStart[lo]!;
    ptSliceEnd[b] = binStart[hi + 1]!;
  }

  return {
    spec,
    process,
    detector,
    recordingCuts,
    events,
    acceptance: samples > 0 ? acceptedWeight / samples : 0,
    density,
    high: region(splitBin, spec.bins),
    low: region(0, splitBin),
    binStart,
    binIndex,
    ptSliceStart,
    ptSliceEnd,
  };
}

/**
 * Continuum density: the known power law of the process times the detector acceptance, with
 * the acceptance fitted as a smooth cubic in ln m to the ratio of accepted to generated
 * events. A finite Monte Carlo sample would otherwise leave per-cent ripples in the
 * background, comparable to a Higgs signal.
 */
export function continuumDensity(accepted: Histogram, generated: Histogram, lo: number, hi: number, index: number): Float64Array {
  const { spec } = accepted;
  // Weighted least squares of ln(accepted/generated) on 1, x, x², x³ with x = ln m.
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  for (let b = 0; b < spec.bins; b++) {
    const g = generated.counts[b]!;
    const a = accepted.counts[b]!;
    if (g <= 0 || a <= 0) continue;
    xs.push(Math.log(accepted.binCenter(b)));
    ys.push(Math.log(a / g));
    ws.push(g);
  }
  const coefficients = fitPolynomial(xs, ys, ws, 3);
  const out = new Float64Array(spec.bins);
  for (let b = 0; b < spec.bins; b++) {
    const m = accepted.binCenter(b);
    if (m < lo || m > hi) continue;
    const x = Math.log(m);
    const logAcc = coefficients.reduce((sum, c, k) => sum + c * x ** k, 0);
    out[b] = powerLawMassDensity(m, lo, hi, index) * Math.exp(logAcc);
  }
  return out;
}

/**
 * Resonance density: the truncated Breit–Wigner of the particle times a smooth fitted
 * acceptance, convolved with the detector's Gaussian mass resolution (estimated from the
 * Monte Carlo sample). Everything but two smooth fits is analytic, so the tails carry no
 * sampling noise.
 */
export function resonanceDensity(
  acceptedTrue: Histogram,
  generated: Histogram,
  massGeV: number,
  widthGeV: number,
  resolution: number,
  spec: HistogramSpec,
): Float64Array {
  // Acceptance as a smooth function of the true mass.
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  for (let b = 0; b < spec.bins; b++) {
    const g = generated.counts[b]!;
    const a = acceptedTrue.counts[b]!;
    if (g <= 0 || a <= 0) continue;
    xs.push(Math.log(generated.binCenter(b)));
    ys.push(Math.log(a / g));
    ws.push(g);
  }
  // Acceptance changes slowly across a resonance: a straight line in ln m is enough and does not wiggle in the tails.
  const coefficients = fitPolynomial(xs, ys, ws, xs.length >= 6 ? 1 : 0);
  const acceptanceAt = (m: number) => {
    const x = Math.log(m);
    return Math.exp(coefficients.reduce((sum, c, k) => sum + c * x ** k, 0));
  };

  // True-mass grid over the generated range.
  const reach = BREIT_WIGNER_REACH * widthGeV;
  const lo = Math.max(spec.min, massGeV - reach);
  const hi = Math.min(spec.max, massGeV + reach);
  const width = (spec.max - spec.min) / spec.bins;
  const points = Math.max(1, Math.min(2000, Math.ceil((hi - lo) / width)));
  const step = points > 1 ? (hi - lo) / points : 0;
  const halfWidth = widthGeV / 2;
  const out = new Float64Array(spec.bins);
  for (let k = 0; k < points; k++) {
    const mTrue = points > 1 ? lo + (k + 0.5) * step : massGeV;
    const bw = widthGeV > 0 ? 1 / ((mTrue - massGeV) ** 2 + halfWidth * halfWidth) : 1;
    const strength = bw * acceptanceAt(mTrue);
    const sigma = Math.max(resolution * mTrue, width * 0.5);
    const from = Math.max(0, Math.floor((mTrue - 5 * sigma - spec.min) / width));
    const to = Math.min(spec.bins - 1, Math.ceil((mTrue + 5 * sigma - spec.min) / width));
    for (let b = from; b <= to; b++) {
      const d = spec.min + (b + 0.5) * width - mTrue;
      out[b]! += strength * Math.exp(-(d * d) / (2 * sigma * sigma));
    }
  }
  return out;
}

/** Weighted least-squares polynomial fit; returns coefficients c₀..c_degree. Falls back to a constant. */
export function fitPolynomial(xs: number[], ys: number[], ws: number[], degree: number): number[] {
  const n = degree + 1;
  if (xs.length < n) {
    let sw = 0;
    let sy = 0;
    for (let i = 0; i < xs.length; i++) {
      sw += ws[i]!;
      sy += ws[i]! * ys[i]!;
    }
    return [sw > 0 ? sy / sw : 0, ...Array.from({ length: degree }, () => 0)];
  }
  // Centre x for numerical stability.
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const A: number[][] = Array.from({ length: n }, () => Array.from({ length: n + 1 }, () => 0));
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]! - xMean;
    const w = ws[i]!;
    const powers = Array.from({ length: 2 * n }, (_, k) => x ** k);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) A[r]![c]! += w * powers[r + c]!;
      A[r]![n]! += w * ys[i]! * powers[r]!;
    }
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[pivot]![col]!)) pivot = r;
    [A[col], A[pivot]] = [A[pivot]!, A[col]!];
    const p = A[col]![col]!;
    if (Math.abs(p) < 1e-18) return [ys.reduce((a, b) => a + b, 0) / ys.length, ...Array.from({ length: degree }, () => 0)];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r]![col]! / p;
      for (let c = col; c <= n; c++) A[r]![c]! -= f * A[col]![c]!;
    }
  }
  const centred = Array.from({ length: n }, (_, r) => A[r]![n]! / A[r]![r]!);
  // Expand the polynomial in (x − xMean) back to powers of x.
  const out = Array.from({ length: n }, () => 0);
  for (let k = 0; k < n; k++) {
    // c_k (x − μ)^k = c_k Σ_j C(k, j) x^j (−μ)^(k−j)
    for (let j = 0; j <= k; j++) out[j]! += centred[k]! * binomial(k, j) * (-xMean) ** (k - j);
  }
  return out;
}

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Draw one event from a region of the pool: a fresh mass from the smoothed density and a pT
 * from a nearby pool event.
 * - 'proportional': the mass follows the density; the event stands for one real event.
 * - 'mixed': most draws follow the density, a small share is uniform over the region, and the
 *   returned weight corrects for it. Tails then keep getting records even when most of the
 *   distribution sits in a peak, while the bulk of the records keep nearly equal weights.
 */
export function drawFromPool(
  pool: EventPool,
  rng: Random,
  region: Region = pool.high,
  mode: 'proportional' | 'mixed' = 'proportional',
): PoolEvent | null {
  const n = region.cumulative.length;
  if (n === 0 || region.fraction <= 0) return null;
  let bin: number;
  let weight = 1;
  if (mode === 'mixed' && rng.next() < UNIFORM_SHARE) {
    bin = region.start + Math.min(n - 1, Math.floor(rng.next() * n));
  } else {
    const target = rng.next() * region.fraction;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (region.cumulative[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    bin = region.start + lo;
  }
  if (mode === 'mixed') {
    const p = pool.density[bin]! / region.fraction;
    const u = 1 / n;
    weight = p / ((1 - UNIFORM_SHARE) * p + UNIFORM_SHARE * u);
  }
  const width = (pool.spec.max - pool.spec.min) / pool.spec.bins;
  const massGeV = pool.spec.min + (bin + rng.next()) * width;
  const template = nearbyEvent(pool, bin, rng);
  if (!template) return { massGeV, minPtGeV: 0, weight, particles: [], parent: { ptGeV: 0, rapidity: 0, phi: 0 } };
  // Throw a fresh decay of a parent like the template's, at the drawn mass, through the detector,
  // so that every record has its own particles. Fall back to the template's particles if the
  // fresh decay keeps failing the acceptance.
  const fresh = redecay(pool, template, massGeV, rng) ?? jitterParticles(template.particles, rng);
  return {
    massGeV,
    minPtGeV: fresh.minPtGeV,
    weight,
    particles: fresh.particles,
    parent: template.parent,
  };
}

/**
 * When a fresh decay keeps failing the acceptance (soft, low-mass pairs), reuse the template's
 * particles with a small extra smearing, so that no two records share exactly the same
 * kinematics. The smearing is a few per cent in pT and a few hundredths in angle: well below
 * anything the analysis resolves, but enough to keep histograms of angles continuous.
 */
function jitterParticles(particles: RecordedParticle[], rng: Random): { minPtGeV: number; particles: RecordedParticle[] } {
  let minPt = Infinity;
  const out = particles.map((p) => {
    const ptGeV = p.ptGeV * (1 + 0.03 * rng.gaussian());
    let phi = p.phi + 0.15 * rng.gaussian();
    if (phi > Math.PI) phi -= 2 * Math.PI;
    if (phi < -Math.PI) phi += 2 * Math.PI;
    if (ptGeV < minPt) minPt = ptGeV;
    return { kind: p.kind, ptGeV, eta: p.eta + 0.05 * rng.gaussian(), phi, charge: p.charge };
  });
  return { minPtGeV: Number.isFinite(minPt) ? minPt : 0, particles: out };
}

const REDECAY_TRIES = 2;

function redecay(pool: EventPool, template: PoolEvent, massGeV: number, rng: Random): { minPtGeV: number; particles: RecordedParticle[] } | null {
  for (let attempt = 0; attempt < REDECAY_TRIES; attempt++) {
    const phi = rng.uniform(0, 2 * Math.PI);
    const parent = fromPtRapidityPhiM(template.parent.ptGeV, template.parent.rapidity, phi, massGeV);
    const decay = decayForProcess(pool.process, parent, massGeV, rng);
    const record = reconstructRecord(decay.daughters, decay.kinds, decay.charges, pool.detector, pool.recordingCuts, rng);
    if (record) return { minPtGeV: record.minPtGeV, particles: record.particles };
  }
  return null;
}

/** A random pool event from the neighbourhood of the given bin, lending its particles to a fresh draw. */
function nearbyEvent(pool: EventPool, bin: number, rng: Random): PoolEvent | null {
  const start = pool.ptSliceStart[bin]!;
  const end = pool.ptSliceEnd[bin]!;
  if (end <= start) return null;
  return pool.events[pool.binIndex[start + Math.floor(rng.next() * (end - start))]!]!;
}

/**
 * Spread every bin into a Gaussian whose width is `fraction` of the bin's mass, at least
 * 0.7 bins. The total is preserved.
 */
export function smoothCounts(histogram: Histogram, fraction: number): Float64Array {
  const { spec, counts, width } = histogram;
  const out = new Float64Array(spec.bins);
  for (let b = 0; b < spec.bins; b++) {
    const c = counts[b]!;
    if (c <= 0) continue;
    const sigma = Math.max(0.7, (fraction * histogram.binCenter(b)) / width);
    const reach = Math.ceil(3 * sigma);
    const lo = Math.max(0, b - reach);
    const hi = Math.min(spec.bins - 1, b + reach);
    let norm = 0;
    for (let j = lo; j <= hi; j++) norm += Math.exp(-((j - b) ** 2) / (2 * sigma * sigma));
    for (let j = lo; j <= hi; j++) out[j]! += (c * Math.exp(-((j - b) ** 2) / (2 * sigma * sigma))) / norm;
  }
  return out;
}

/**
 * Two-scale smoothing: a narrow kernel where the distribution is dense (the peak) blended
 * into a wide kernel where it is sparse (the tails). The total is preserved.
 */
export function smoothAdaptive(histogram: Histogram, fraction: number, tailFactor: number): Float64Array {
  const narrow = smoothCounts(histogram, fraction);
  const wide = smoothCounts(histogram, fraction * tailFactor);
  let max = 0;
  for (let b = 0; b < narrow.length; b++) if (narrow[b]! > max) max = narrow[b]!;
  if (max <= 0) return narrow;
  const out = new Float64Array(narrow.length);
  const dense = 0.05 * max;
  let total = 0;
  let sumIn = 0;
  for (let b = 0; b < narrow.length; b++) {
    const w = Math.min(1, narrow[b]! / dense);
    out[b] = w * narrow[b]! + (1 - w) * wide[b]!;
    total += out[b]!;
    sumIn += histogram.counts[b]!;
  }
  if (total > 0) for (let b = 0; b < out.length; b++) out[b]! *= sumIn / total;
  return out;
}
