import { PARTICLES } from '../../data/particles';
import { add, boostToFrameOf, fromPtRapidityPhiM, type FourVector } from '../fourvector';
import type { Random } from '../random';
import type { ProcessDefinition } from './processes';

/**
 * Toy event generator. Produces the four-vectors of the final-state particles of a resonance
 * or continuum object decaying into two muons, two photons, or four leptons via ZZ*.
 *
 * Simplifications, all deliberate:
 * - The parent's rapidity is Gaussian with a width growing as ln(√s/M), clipped to the
 *   kinematic limit. Real distributions are flatter in the centre.
 * - The parent's transverse momentum follows dN/dpT ∝ pT (1 + pT²/p0²)^-n, the shape used to
 *   fit quarkonium and Z spectra, with p0 growing with the mass.
 * - Decays are isotropic in the parent rest frame; angular correlations are ignored.
 * - Resonance masses follow a non-relativistic Breit–Wigner.
 * - In the ZZ* chain the first Z is on shell when the mass allows, the second is spread
 *   uniformly over the remaining phase space.
 */

export type ParticleKind = 'muon' | 'electron' | 'photon';

export interface GeneratedEvent {
  processId: string;
  /** True mass of the decaying object. */
  massGeV: number;
  daughters: FourVector[];
  kinds: ParticleKind[];
}

const MUON_MASS = PARTICLES.muon.massGeV;
const Z_MASS = PARTICLES.z.massGeV;
const Z_WIDTH = PARTICLES.z.widthGeV;
/** Lowest dilepton mass in the ZZ* chain, in GeV. */
const MIN_PAIR_MASS = 12;

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
  throw new Error(`Process ${process.id} does not produce a final state`);
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

/** Isotropic two-body decay of `parent` (mass M) into two particles of masses m1 and m2, boosted to the lab. */
export function decayTwoBody(
  parent: FourVector,
  massGeV: number,
  m1: number,
  m2: number,
  rng: Random,
): [FourVector, FourVector] {
  const m2sum = (m1 + m2) ** 2;
  const m2diff = (m1 - m2) ** 2;
  const M2 = massGeV * massGeV;
  const pStar = Math.sqrt(Math.max(0, (M2 - m2sum) * (M2 - m2diff))) / (2 * massGeV);
  const cosTheta = rng.uniform(-1, 1);
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  const phi = rng.uniform(0, 2 * Math.PI);
  const px = pStar * sinTheta * Math.cos(phi);
  const py = pStar * sinTheta * Math.sin(phi);
  const pz = pStar * cosTheta;
  const d1 = boostToFrameOf({ e: Math.hypot(pStar, m1), px, py, pz }, parent);
  const d2 = boostToFrameOf({ e: Math.hypot(pStar, m2), px: -px, py: -py, pz: -pz }, parent);
  return [d1, d2];
}

/** Masses of the two Z (or Z*) in an X → ZZ* → 4ℓ chain for a parent of mass M. */
export function sampleZPairMasses(massGeV: number, rng: Random): [number, number] {
  const clampBreitWigner = (upper: number) => {
    let m = rng.breitWigner(Z_MASS, Z_WIDTH);
    if (m < Z_MASS - 5 * Z_WIDTH) m = Z_MASS - 5 * Z_WIDTH;
    if (m > upper) m = upper;
    return m;
  };
  // The first pair may take everything but the minimum mass of the second.
  const available = massGeV - MIN_PAIR_MASS;
  const m1 = available > Z_MASS - 3 * Z_WIDTH ? clampBreitWigner(available) : rng.uniform(MIN_PAIR_MASS, available);
  const remaining = massGeV - m1;
  const m2 = remaining > Z_MASS + 3 * Z_WIDTH ? clampBreitWigner(remaining) : rng.uniform(MIN_PAIR_MASS, remaining);
  return [m1, m2];
}

function decayToFinalState(
  process: ProcessDefinition,
  parent: FourVector,
  massGeV: number,
  rng: Random,
): { daughters: FourVector[]; kinds: ParticleKind[] } {
  switch (process.finalState) {
    case 'mumu': {
      const daughters = decayTwoBody(parent, massGeV, MUON_MASS, MUON_MASS, rng);
      return { daughters, kinds: ['muon', 'muon'] };
    }
    case 'gammagamma': {
      const daughters = decayTwoBody(parent, massGeV, 0, 0, rng);
      return { daughters, kinds: ['photon', 'photon'] };
    }
    case 'fourlepton': {
      const [m1, m2] = sampleZPairMasses(massGeV, rng);
      const [z1, z2] = decayTwoBody(parent, massGeV, m1, m2, rng);
      const [l1, l2] = decayTwoBody(z1, m1, MUON_MASS, MUON_MASS, rng);
      const [l3, l4] = decayTwoBody(z2, m2, MUON_MASS, MUON_MASS, rng);
      return { daughters: [l1, l2, l3, l4], kinds: ['muon', 'muon', 'muon', 'muon'] };
    }
    default:
      throw new Error(`Process ${process.id} has no final state`);
  }
}

export function generateEvent(process: ProcessDefinition, sqrtSGeV: number, rng: Random): GeneratedEvent {
  const massGeV = sampleParentMass(process, rng);
  const parent = sampleParent(massGeV, sqrtSGeV, rng);
  const { daughters, kinds } = decayToFinalState(process, parent, massGeV, rng);
  return { processId: process.id, massGeV, daughters, kinds };
}

export interface WeightedEvent extends GeneratedEvent {
  /** Importance weight; averages to one over many events. */
  weight: number;
}

/**
 * Same physics as `generateEvent`, but the parent pT is drawn from a harder spectrum
 * (p0 stretched by `ptStretch`) and, for continua, the mass from a flatter power law; each
 * event carries the ratio of the true to the sampling density as a weight. Used to build
 * templates efficiently when selection cuts remove most of the soft events.
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
  const { daughters, kinds } = decayToFinalState(process, parent, massGeV, rng);
  return { processId: process.id, massGeV, daughters, kinds, weight };
}

/** Sanity helper: the daughters must add up to the parent. */
export function parentOf(event: GeneratedEvent): FourVector {
  return event.daughters.reduce((sum, d) => add(sum, d), { e: 0, px: 0, py: 0, pz: 0 });
}
