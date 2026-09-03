import { PARTICLES, PARTICLE_IDS, type ParticleData, type ParticleId } from '../../data/particles';
import { generateHypotheticalResonance } from '../collision/generator';
import type { Channel } from '../collision/channels';
import { PROCESSES, crossSectionNb } from '../collision/processes';
import { reconstructRecord } from '../collision/eventPool';
import type { RecordedParticle } from '../collision/eventStore';
import { DEFAULT_DETECTOR, type DetectorModel, type SelectionCuts } from '../detector/detector';
import type { Random } from '../random';
import type { PeakFit } from './fit';
import type { Selection } from './selection';

/**
 * The particle passport: what can be measured about a peak, how, and how it compares with a
 * known particle. Everything here is what an analyst would do after finding a bump.
 */

/** ħ in GeV·s, PDG 2024. */
export const HBAR_GEV_S = 6.582119569e-25;

export interface ResonanceResponse {
  /** Fraction of decays of such a particle that pass the selection. */
  acceptance: number;
  /** Relative mass resolution σ_m / m for a zero-width particle. */
  resolutionRel: number;
}

/** Does a reconstructed event pass the analysis selection? Mirrors `applySelection` for one event. */
export function eventPasses(particles: RecordedParticle[], massGeV: number, selection: Selection): boolean {
  let minPt = Infinity;
  let leading = 0;
  let charge = 0;
  for (const p of particles) {
    if (p.ptGeV < minPt) minPt = p.ptGeV;
    if (p.ptGeV > leading) leading = p.ptGeV;
    if (selection.etaMax !== null && Math.abs(p.eta) > selection.etaMax) return false;
    charge += p.charge;
  }
  if (minPt < selection.ptMinGeV) return false;
  if (selection.leadingPtMinGeV !== null && leading < selection.leadingPtMinGeV) return false;
  if (selection.massMinGeV !== null && massGeV < selection.massMinGeV) return false;
  if (selection.massMaxGeV !== null && massGeV >= selection.massMaxGeV) return false;
  if (particles.length > 0) {
    if (selection.charge === 'opposite' && charge !== 0) return false;
    if (selection.charge === 'same' && charge === 0) return false;
  }
  return true;
}

/**
 * Simulate a zero-width particle of the given mass decaying to the channel's final state and
 * pass it through the detector and the selection: gives the acceptance and the mass
 * resolution the analyst needs. This is the "Monte Carlo" step of a real analysis.
 */
export function simulateResponse(
  channel: Channel,
  massGeV: number,
  sqrtSGeV: number,
  selection: Selection,
  recordingCuts: SelectionCuts,
  rng: Random,
  samples = 4000,
  detector: DetectorModel = DEFAULT_DETECTOR,
): ResonanceResponse {
  let accepted = 0;
  let sumSq = 0;
  for (let i = 0; i < samples; i++) {
    const event = generateHypotheticalResonance(channel, massGeV, 0, sqrtSGeV, rng);
    const record = reconstructRecord(event.daughters, event.kinds, event.charges, detector, recordingCuts, rng);
    if (!record) continue;
    if (!eventPasses(record.particles, record.massGeV, selection)) continue;
    accepted += 1;
    sumSq += ((record.massGeV - massGeV) / massGeV) ** 2;
  }
  return { acceptance: accepted / samples, resolutionRel: accepted > 0 ? Math.sqrt(sumSq / accepted) : 0 };
}

export interface WidthEstimate {
  /** Intrinsic full width Γ in GeV, or null when the peak is no wider than the resolution. */
  widthGeV: number | null;
  widthErrorGeV: number;
  /** Upper limit on Γ when the width is consistent with zero. */
  widthUpperLimitGeV: number;
  /** Lifetime τ = ħ/Γ in seconds, or null. */
  lifetimeS: number | null;
}

/**
 * Intrinsic width from the fitted Gaussian σ and the detector resolution, subtracted in
 * quadrature and converted to a full width at half maximum. Approximate: a Breit–Wigner folded
 * with a Gaussian is not a Gaussian, but for the lesson (Z is wide, J/ψ is not) it is enough.
 */
export function estimateWidth(fit: PeakFit, resolutionRel: number): WidthEstimate {
  const sigmaRes = resolutionRel * fit.mean;
  const excess = fit.sigma * fit.sigma - sigmaRes * sigmaRes;
  const sigmaErr = Number.isFinite(fit.sigmaError) ? fit.sigmaError : fit.sigma * 0.1;
  const fwhm = 2.3548;
  // Propagate: d(Γ)/d(σ_fit) = fwhm · σ_fit / sqrt(excess).
  if (excess > 0 && Math.sqrt(excess) > 2 * sigmaErr) {
    const width = fwhm * Math.sqrt(excess);
    const error = (fwhm * fit.sigma * sigmaErr) / Math.sqrt(excess);
    return { widthGeV: width, widthErrorGeV: error, widthUpperLimitGeV: width + 2 * error, lifetimeS: HBAR_GEV_S / width };
  }
  const upper = fwhm * Math.sqrt(Math.max(0, excess) + (2 * sigmaErr) ** 2 + (0.2 * sigmaRes) ** 2);
  return { widthGeV: null, widthErrorGeV: 0, widthUpperLimitGeV: upper, lifetimeS: null };
}

/** σ·BR into the selected final state in nb, from the fitted yield, the acceptance and the luminosity. */
export function crossSectionFromYield(yieldEvents: number, yieldError: number, acceptance: number, integratedLuminosityM2: number): { nb: number; errorNb: number } {
  const invNb = integratedLuminosityM2 / 1e37;
  if (acceptance <= 0 || invNb <= 0) return { nb: 0, errorNb: 0 };
  return { nb: yieldEvents / (acceptance * invNb), errorNb: yieldError / (acceptance * invNb) };
}

export interface KnownPassport {
  id: ParticleId;
  data: ParticleData;
  /** σ·BR into this channel at the given √s, from the process table, in nb; null if not tabulated. */
  crossSectionNb: number | null;
  branchingFraction: number | null;
}

/** The known particle whose mass lies within the tolerance of the measured one, or null. */
export function matchKnownParticle(massGeV: number, massErrorGeV: number, channel: Channel, sqrtSGeV: number): KnownPassport | null {
  let best: KnownPassport | null = null;
  let bestDistance = Infinity;
  for (const id of PARTICLE_IDS) {
    const data = PARTICLES[id];
    if (id === 'muon') continue;
    const tolerance = Math.max(3 * massErrorGeV, 0.02 * data.massGeV, data.widthGeV);
    const distance = Math.abs(data.massGeV - massGeV);
    if (distance > tolerance || distance >= bestDistance) continue;
    const process = PROCESSES.find((p) => p.kind === 'resonance' && p.particle === id && p.finalState === channel);
    const decay = data.decays.find((d) => d.channel === channel);
    best = {
      id,
      data,
      crossSectionNb: process ? crossSectionNb(process, sqrtSGeV) : null,
      branchingFraction: decay ? decay.fraction : null,
    };
    bestDistance = distance;
  }
  return best;
}

export type Verdict = 'match' | 'mismatch' | 'inconclusive';

export interface PassportComparison {
  mass: Verdict;
  width: Verdict;
  charge: Verdict;
  crossSection: Verdict;
}

export interface MeasuredPassport {
  massGeV: number;
  massErrorGeV: number;
  width: WidthEstimate;
  /** Charge of the decaying object as inferred from the products: 0 when opposite-sign pairs dominate. */
  chargeInferred: number | null;
  crossSection: { nb: number; errorNb: number };
}

export function comparePassports(measured: MeasuredPassport, known: KnownPassport): PassportComparison {
  const massTolerance = Math.max(2 * measured.massErrorGeV, 0.005 * known.data.massGeV, known.data.widthGeV / 2);
  const mass: Verdict = Math.abs(measured.massGeV - known.data.massGeV) <= massTolerance ? 'match' : 'mismatch';
  let width: Verdict;
  if (measured.width.widthGeV === null) {
    width = known.data.widthGeV <= measured.width.widthUpperLimitGeV ? 'match' : 'mismatch';
  } else {
    const ratio = measured.width.widthGeV / known.data.widthGeV;
    width = ratio > 0.5 && ratio < 2 ? 'match' : Math.abs(measured.width.widthGeV - known.data.widthGeV) <= 3 * measured.width.widthErrorGeV ? 'match' : 'mismatch';
  }
  const charge: Verdict = measured.chargeInferred === null ? 'inconclusive' : measured.chargeInferred === known.data.charge ? 'match' : 'mismatch';
  let crossSection: Verdict = 'inconclusive';
  if (known.crossSectionNb !== null && measured.crossSection.nb > 0) {
    const ratio = measured.crossSection.nb / known.crossSectionNb;
    crossSection = ratio > 0.5 && ratio < 2 ? 'match' : 'mismatch';
  }
  return { mass, width, charge, crossSection };
}
