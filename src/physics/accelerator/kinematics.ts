import { PROTON_MASS_GEV } from '../constants';

/**
 * Relativistic kinematics in natural units: energies in GeV, momenta in GeV/c, masses in GeV/c².
 * E² = p²c² + m²c⁴, see https://en.wikipedia.org/wiki/Energy%E2%80%93momentum_relation
 */

export function momentumFromEnergy(energyGeV: number, massGeV = PROTON_MASS_GEV): number {
  if (energyGeV < massGeV) {
    throw new RangeError(`Total energy ${energyGeV} GeV is below the rest mass ${massGeV} GeV`);
  }
  return Math.sqrt(energyGeV * energyGeV - massGeV * massGeV);
}

export function energyFromMomentum(momentumGeV: number, massGeV = PROTON_MASS_GEV): number {
  return Math.hypot(momentumGeV, massGeV);
}

/** Lorentz factor γ = E / m. */
export function lorentzGamma(energyGeV: number, massGeV = PROTON_MASS_GEV): number {
  return energyGeV / massGeV;
}

/** Velocity as a fraction of c: β = p / E. */
export function lorentzBeta(energyGeV: number, massGeV = PROTON_MASS_GEV): number {
  return momentumFromEnergy(energyGeV, massGeV) / energyGeV;
}

/**
 * Centre-of-mass energy √s for two head-on beams.
 * s = m₁² + m₂² + 2(E₁E₂ + p₁p₂). For equal beams this is 2E to high accuracy.
 * https://en.wikipedia.org/wiki/Mandelstam_variables
 */
export function centerOfMassEnergyCollider(
  energy1GeV: number,
  energy2GeV: number = energy1GeV,
  mass1GeV = PROTON_MASS_GEV,
  mass2GeV = mass1GeV,
): number {
  const p1 = momentumFromEnergy(energy1GeV, mass1GeV);
  const p2 = momentumFromEnergy(energy2GeV, mass2GeV);
  return Math.sqrt(mass1GeV * mass1GeV + mass2GeV * mass2GeV + 2 * (energy1GeV * energy2GeV + p1 * p2));
}

/**
 * Centre-of-mass energy √s for a beam hitting a target at rest.
 * s = m_beam² + m_target² + 2 E_beam m_target. Grows only as the square root of the beam energy,
 * which is why the LHC is a collider.
 */
export function centerOfMassEnergyFixedTarget(
  beamEnergyGeV: number,
  beamMassGeV = PROTON_MASS_GEV,
  targetMassGeV = PROTON_MASS_GEV,
): number {
  return Math.sqrt(beamMassGeV * beamMassGeV + targetMassGeV * targetMassGeV + 2 * beamEnergyGeV * targetMassGeV);
}
