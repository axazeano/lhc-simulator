import { MOMENTUM_PER_RIGIDITY_GEV_PER_T_M } from '../constants';

/**
 * Magnetic rigidity Bρ: the product of bending field and bending radius that a particle
 * of momentum p needs to stay on a circular orbit.
 * p [GeV/c] = 0.299792458 · B [T] · ρ [m]  (for unit charge)
 * https://en.wikipedia.org/wiki/Rigidity_(electromagnetism)
 */

/** Bρ in T·m for a singly charged particle. */
export function magneticRigidity(momentumGeV: number): number {
  return momentumGeV / MOMENTUM_PER_RIGIDITY_GEV_PER_T_M;
}

/** Dipole field in tesla needed to bend momentum p on radius ρ. */
export function fieldForMomentum(momentumGeV: number, bendingRadiusM: number): number {
  return magneticRigidity(momentumGeV) / bendingRadiusM;
}

/** Momentum in GeV/c that a field B bends exactly on radius ρ. */
export function momentumForField(fieldT: number, bendingRadiusM: number): number {
  return MOMENTUM_PER_RIGIDITY_GEV_PER_T_M * fieldT * bendingRadiusM;
}
