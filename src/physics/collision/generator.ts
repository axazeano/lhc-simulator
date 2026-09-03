import { PARTICLES } from '../../data/particles';
import {
  add,
  boostToFrameOf,
  fromPtRapidityPhiM,
  type FourVector,
} from '../fourvector';
import type { Random } from '../random';
import type { ProcessDefinition } from './processes';

/**
 * Toy event generator. Produces the four-vectors of the two final-state particles of a
 * resonance or continuum pair.
 *
 * Simplifications, all deliberate:
 * - The parent's rapidity is Gaussian with a width growing as ln(√s/M), clipped to the
 *   kinematic limit. Real distributions are flatter in the centre.
 * - The parent's transverse momentum follows dN/dpT ∝ pT (1 + pT²/p0²)^-n, the shape used to
 *   fit quarkonium and Z spectra, with p0 growing with the mass.
 * - The decay is isotropic in the parent rest frame; angular correlations are ignored.
 * - The resonance mass follows a non-relativistic Breit–Wigner.
 */

export interface GeneratedEvent {
  processId: string;
  /** True mass of the decaying object. */
  massGeV: number;
  daughters: [FourVector, FourVector];
}

const MUON_MASS = PARTICLES.muon.massGeV;

export function sampleParentMass(process: ProcessDefinition, rng: Random): number {
  if (process.kind === 'resonance' && process.particle) {
    const particle = PARTICLES[process.particle];
    let mass = rng.breitWigner(particle.massGeV, particle.widthGeV);
    // Keep the tails physical: no negative masses, no sampling far beyond the peak.
    const limit = 10 * particle.widthGeV;
    if (mass < particle.massGeV - limit) mass = particle.massGeV - limit;
    if (mass > particle.massGeV + limit) mass = particle.massGeV + limit;
    return Math.max(mass, 2 * MUON_MASS + 1e-6);
  }
  if (process.kind === 'continuum' && process.massRangeGeV && process.powerLawIndex !== undefined) {
    return rng.powerLaw(process.massRangeGeV[0], process.massRangeGeV[1], process.powerLawIndex);
  }
  throw new Error(`Process ${process.id} does not produce a two-body final state`);
}

/** Power-law index of the parent pT spectrum. */
export const PT_INDEX = 3.5;

/** Scale p0 of the parent pT spectrum, growing with the mass. */
export function ptScale(massGeV: number): number {
  return 2.5 + 0.2 * massGeV;
}

export function sampleRapidity(massGeV: number, sqrtSGeV: number, rng: Random): number {
  const yMax = Math.max(0.1, Math.log(sqrtSGeV / massGeV));
  const ySigma = Math.max(0.3, 0.45 * yMax);
  let y = rng.gaussian() * ySigma;
  if (y > yMax) y = yMax;
  if (y < -yMax) y = -yMax;
  return y;
}

export function sampleParent(massGeV: number, sqrtSGeV: number, rng: Random): FourVector {
  const y = sampleRapidity(massGeV, sqrtSGeV, rng);
  const pt = samplePowerLawPt(ptScale(massGeV), PT_INDEX, rng);
  const phi = rng.uniform(0, 2 * Math.PI);
  return fromPtRapidityPhiM(pt, y, phi, massGeV);
}

/** pT with dN/dpT ∝ pT (1 + pT²/p0²)^-n, sampled by inverting the CDF in pT². */
export function samplePowerLawPt(p0: number, n: number, rng: Random): number {
  let u = rng.next();
  if (u === 1) u = 0.999999;
  return p0 * Math.sqrt((1 - u) ** (1 / (1 - n)) - 1);
}

/** Normalised density of the pT spectrum above: ∫₀^∞ = 1. */
export function powerLawPtDensity(pt: number, p0: number, n: number): number {
  return ((2 * (n - 1)) / (p0 * p0)) * pt * (1 + (pt * pt) / (p0 * p0)) ** -n;
}

/** Normalised density of dN/dm ∝ m^-k on [lo, hi]. */
export function powerLawMassDensity(m: number, lo: number, hi: number, k: number): number {
  const a = 1 - k;
  return (a * m ** -k) / (hi ** a - lo ** a);
}

export interface WeightedEvent extends GeneratedEvent {
  /** Importance weight; averages to one over many events. */
  weight: number;
}

/**
 * Same physics as `generateEvent`, but the parent pT is drawn from a harder spectrum
 * (p0 stretched by `ptStretch`) and each event carries the ratio of the true to the sampling
 * density as a weight. Used to build templates efficiently when selection cuts remove most
 * of the soft events.
 */
export function generateWeightedEvent(
  process: ProcessDefinition,
  sqrtSGeV: number,
  rng: Random,
  ptStretch = 3,
  continuumSamplingIndex = 1.2,
): WeightedEvent {
  let massGeV: number;
  let weight = 1;
  if (process.kind === 'continuum' && process.massRangeGeV && process.powerLawIndex !== undefined) {
    // Sample the mass from a much flatter power law so the template covers the high-mass tail,
    // and weight by the ratio of the true to the sampling density.
    const [lo, hi] = process.massRangeGeV;
    massGeV = rng.powerLaw(lo, hi, continuumSamplingIndex);
    weight =
      powerLawMassDensity(massGeV, lo, hi, process.powerLawIndex) /
      powerLawMassDensity(massGeV, lo, hi, continuumSamplingIndex);
  } else {
    massGeV = sampleParentMass(process, rng);
  }
  const p0 = ptScale(massGeV);
  const pt = samplePowerLawPt(p0 * ptStretch, PT_INDEX, rng);
  weight *= powerLawPtDensity(pt, p0, PT_INDEX) / powerLawPtDensity(pt, p0 * ptStretch, PT_INDEX);
  const y = sampleRapidity(massGeV, sqrtSGeV, rng);
  const phi = rng.uniform(0, 2 * Math.PI);
  const parent = fromPtRapidityPhiM(pt, y, phi, massGeV);
  const daughters = decayTwoBody(parent, massGeV, MUON_MASS, rng);
  return { processId: process.id, massGeV, daughters, weight };
}

/** Isotropic two-body decay of `parent` into two particles of mass m, boosted to the lab. */
export function decayTwoBody(parent: FourVector, massGeV: number, daughterMassGeV: number, rng: Random): [FourVector, FourVector] {
  const halfMass = massGeV / 2;
  const pStar = Math.sqrt(Math.max(0, halfMass * halfMass - daughterMassGeV * daughterMassGeV));
  const cosTheta = rng.uniform(-1, 1);
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  const phi = rng.uniform(0, 2 * Math.PI);
  const px = pStar * sinTheta * Math.cos(phi);
  const py = pStar * sinTheta * Math.sin(phi);
  const pz = pStar * cosTheta;
  const eStar = Math.hypot(pStar, daughterMassGeV);
  const d1 = boostToFrameOf({ e: eStar, px, py, pz }, parent);
  const d2 = boostToFrameOf({ e: eStar, px: -px, py: -py, pz: -pz }, parent);
  return [d1, d2];
}

export function generateEvent(process: ProcessDefinition, sqrtSGeV: number, rng: Random): GeneratedEvent {
  const massGeV = sampleParentMass(process, rng);
  const parent = sampleParent(massGeV, sqrtSGeV, rng);
  const daughters = decayTwoBody(parent, massGeV, MUON_MASS, rng);
  return { processId: process.id, massGeV, daughters };
}

/** Sanity helper: the daughters must add up to the parent. */
export function parentOf(event: GeneratedEvent): FourVector {
  return add(event.daughters[0], event.daughters[1]);
}
