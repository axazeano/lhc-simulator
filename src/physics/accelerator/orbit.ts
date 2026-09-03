/**
 * Beam-loss rule for the game.
 *
 * In a synchrotron a particle whose momentum does not match the dipole field follows a closed
 * orbit displaced by Δx = D · δ, where δ = Δp/p is the relative momentum deviation and D the
 * dispersion function. When the displacement exceeds the aperture, the beam hits the wall.
 * https://en.wikipedia.org/wiki/Dispersion_(accelerator_physics)
 *
 * Simplification: a single dispersion value and a single hard aperture for the whole ring.
 */

/** Relative momentum deviation δ = (p − p_field) / p_field. */
export function momentumDeviation(momentumGeV: number, matchedMomentumGeV: number): number {
  return (momentumGeV - matchedMomentumGeV) / matchedMomentumGeV;
}

/** Closed-orbit displacement Δx = D · δ, in m. */
export function closedOrbitOffset(momentumDeviationValue: number, dispersionM: number): number {
  return dispersionM * momentumDeviationValue;
}

export function isBeamLost(orbitOffsetM: number, apertureHalfWidthM: number): boolean {
  return Math.abs(orbitOffsetM) > apertureHalfWidthM;
}
