import { DETECTOR } from '../../data/detector';
import { add, invariantMass, pseudorapidity, transverseMomentum, type FourVector } from '../fourvector';
import type { Random } from '../random';

/**
 * A minimal detector: a cylinder covering |η| < ηmax, with Gaussian momentum smearing and
 * a flat reconstruction efficiency per particle. No geometry, no material, no pile-up.
 */

export interface DetectorModel {
  etaMax: number;
  /** σ(pT)/pT = constant ⊕ slope · pT */
  muonPtResolutionConstant: number;
  muonPtResolutionSlope: number;
  muonEfficiency: number;
}

export const DEFAULT_DETECTOR: DetectorModel = {
  etaMax: DETECTOR.etaMax,
  muonPtResolutionConstant: DETECTOR.muonPtResolutionConstant,
  muonPtResolutionSlope: DETECTOR.muonPtResolutionSlope,
  muonEfficiency: DETECTOR.muonEfficiency,
};

export interface SelectionCuts {
  /** Minimum transverse momentum for each muon, in GeV. */
  muonPtMinGeV: number;
}

export function muonPtResolution(ptGeV: number, detector: DetectorModel): number {
  return Math.hypot(detector.muonPtResolutionConstant, detector.muonPtResolutionSlope * ptGeV);
}

/** Smear and select one muon. Returns null when it is outside acceptance, lost, or below the cut. */
export function reconstructMuon(
  truth: FourVector,
  detector: DetectorModel,
  cuts: SelectionCuts,
  rng: Random,
): FourVector | null {
  const eta = pseudorapidity(truth);
  if (Math.abs(eta) > detector.etaMax) return null;
  if (rng.next() > detector.muonEfficiency) return null;
  const pt = transverseMomentum(truth);
  const scale = 1 + muonPtResolution(pt, detector) * rng.gaussian();
  if (scale <= 0) return null;
  const measured: FourVector = {
    e: truth.e * scale,
    px: truth.px * scale,
    py: truth.py * scale,
    pz: truth.pz * scale,
  };
  if (transverseMomentum(measured) < cuts.muonPtMinGeV) return null;
  return measured;
}

/** Reconstructed dimuon invariant mass, or null if either muon was not reconstructed. */
export function reconstructPairMass(
  daughters: readonly [FourVector, FourVector],
  detector: DetectorModel,
  cuts: SelectionCuts,
  rng: Random,
): number | null {
  const m1 = reconstructMuon(daughters[0], detector, cuts, rng);
  if (!m1) return null;
  const m2 = reconstructMuon(daughters[1], detector, cuts, rng);
  if (!m2) return null;
  return invariantMass(add(m1, m2));
}
