import { DETECTOR } from '../../data/detector';
import { add, invariantMass, pseudorapidity, transverseMomentum, type FourVector } from '../fourvector';
import type { ParticleKind } from '../collision/generator';
import type { Random } from '../random';

/**
 * A minimal detector: a cylinder covering |η| < ηmax, with Gaussian momentum or energy
 * smearing and a flat reconstruction efficiency per particle. No geometry, no material,
 * no pile-up. Electrons are treated like muons.
 */

export interface DetectorModel {
  etaMax: number;
  /** Charged leptons: σ(pT)/pT = constant ⊕ slope · pT */
  muonPtResolutionConstant: number;
  muonPtResolutionSlope: number;
  /** Photons: σ(E)/E, constant. */
  photonEnergyResolution: number;
  /** Reconstruction efficiency per particle, any kind. */
  efficiency: number;
}

export const DEFAULT_DETECTOR: DetectorModel = {
  etaMax: DETECTOR.etaMax,
  muonPtResolutionConstant: DETECTOR.muonPtResolutionConstant,
  muonPtResolutionSlope: DETECTOR.muonPtResolutionSlope,
  photonEnergyResolution: DETECTOR.photonEnergyResolution,
  efficiency: DETECTOR.muonEfficiency,
};

export interface SelectionCuts {
  /** Minimum transverse momentum for each final-state particle, in GeV. */
  ptMinGeV: number;
}

export function muonPtResolution(ptGeV: number, detector: DetectorModel): number {
  return Math.hypot(detector.muonPtResolutionConstant, detector.muonPtResolutionSlope * ptGeV);
}

export function resolutionFor(kind: ParticleKind, ptGeV: number, detector: DetectorModel): number {
  return kind === 'photon' ? detector.photonEnergyResolution : muonPtResolution(ptGeV, detector);
}

/** Smear and select one particle. Returns null when it is outside acceptance, lost, or below the cut. */
export function reconstructParticle(
  truth: FourVector,
  kind: ParticleKind,
  detector: DetectorModel,
  cuts: SelectionCuts,
  rng: Random,
): FourVector | null {
  const eta = pseudorapidity(truth);
  if (Math.abs(eta) > detector.etaMax) return null;
  if (rng.next() > detector.efficiency) return null;
  const pt = transverseMomentum(truth);
  const scale = 1 + resolutionFor(kind, pt, detector) * rng.gaussian();
  if (scale <= 0) return null;
  const measured: FourVector = {
    e: truth.e * scale,
    px: truth.px * scale,
    py: truth.py * scale,
    pz: truth.pz * scale,
  };
  if (transverseMomentum(measured) < cuts.ptMinGeV) return null;
  return measured;
}

/** Reconstructed invariant mass of the whole final state, or null if any particle was lost. */
export function reconstructEventMass(
  daughters: readonly FourVector[],
  kinds: readonly ParticleKind[],
  detector: DetectorModel,
  cuts: SelectionCuts,
  rng: Random,
): number | null {
  let sum: FourVector = { e: 0, px: 0, py: 0, pz: 0 };
  for (let i = 0; i < daughters.length; i++) {
    const measured = reconstructParticle(daughters[i]!, kinds[i] ?? 'muon', detector, cuts, rng);
    if (!measured) return null;
    sum = add(sum, measured);
  }
  return invariantMass(sum);
}

/** Convenience for two-body final states. */
export function reconstructPairMass(
  daughters: readonly [FourVector, FourVector],
  detector: DetectorModel,
  cuts: SelectionCuts,
  rng: Random,
  kind: ParticleKind = 'muon',
): number | null {
  return reconstructEventMass(daughters, [kind, kind], detector, cuts, rng);
}
