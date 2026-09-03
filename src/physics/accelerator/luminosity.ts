import { BARN_M2, INVERSE_FEMTOBARN_M2 } from '../constants';

/**
 * Luminosity of two colliding bunched beams with round Gaussian profiles.
 * L = F · N² · n_b · f_rev / (4π σ_x σ_y), σ = √(ε β*), ε = ε_n / (βγ)
 * https://en.wikipedia.org/wiki/Luminosity_(scattering_theory)
 * https://home.cern/science/accelerators/luminosity
 */

export interface BeamParameters {
  /** Protons per bunch N. */
  protonsPerBunch: number;
  /** Number of bunches per beam n_b. */
  bunches: number;
  /** Normalised transverse emittance ε_n in m·rad. */
  normalizedEmittanceM: number;
  /** Beta function at the interaction point β* in m. */
  betaStarM: number;
  /** Geometric reduction factor F for the crossing angle, 0 < F ≤ 1. */
  crossingFactor: number;
}

/** Geometric emittance ε = ε_n / (βγ), in m·rad. Shrinks as the beam is accelerated. */
export function geometricEmittance(normalizedEmittanceM: number, gamma: number, beta: number): number {
  return normalizedEmittanceM / (beta * gamma);
}

/** RMS transverse beam size at the interaction point, in m. */
export function beamSizeAtIP(geometricEmittanceM: number, betaStarM: number): number {
  return Math.sqrt(geometricEmittanceM * betaStarM);
}

/** Instantaneous luminosity in m⁻² s⁻¹. */
export function luminosityM2S(
  beam: BeamParameters,
  revolutionFrequencyHz: number,
  gamma: number,
  beta: number,
): number {
  const emittance = geometricEmittance(beam.normalizedEmittanceM, gamma, beta);
  const sigma = beamSizeAtIP(emittance, beam.betaStarM);
  return (
    (beam.crossingFactor * beam.protonsPerBunch ** 2 * beam.bunches * revolutionFrequencyHz) /
    (4 * Math.PI * sigma * sigma)
  );
}

/** Instantaneous luminosity in the customary cm⁻² s⁻¹. */
export function luminosityCm2S(
  beam: BeamParameters,
  revolutionFrequencyHz: number,
  gamma: number,
  beta: number,
): number {
  return luminosityM2S(beam, revolutionFrequencyHz, gamma, beta) * 1e-4;
}

/** Integrated luminosity in fb⁻¹ for a constant luminosity over a time interval. */
export function integratedLuminosityFb(luminosityM2SValue: number, seconds: number): number {
  return (luminosityM2SValue * seconds) / INVERSE_FEMTOBARN_M2;
}

/** Expected number of events N = σ · ∫L dt, with σ in barn and ∫L dt in fb⁻¹. */
export function expectedEvents(crossSectionBarn: number, integratedLuminosityFbValue: number): number {
  return crossSectionBarn * BARN_M2 * integratedLuminosityFbValue * INVERSE_FEMTOBARN_M2;
}
