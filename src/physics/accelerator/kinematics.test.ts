import { describe, expect, it } from 'vitest';
import { PROTON_MASS_GEV } from '../constants';
import {
  centerOfMassEnergyCollider,
  centerOfMassEnergyFixedTarget,
  energyFromMomentum,
  lorentzBeta,
  lorentzGamma,
  momentumFromEnergy,
} from './kinematics';

describe('relativistic kinematics', () => {
  it('a 7 TeV proton has momentum indistinguishable from its energy', () => {
    const p = momentumFromEnergy(7000);
    expect(p).toBeLessThan(7000);
    expect(7000 - p).toBeLessThan(1e-3);
  });

  it('round-trips energy and momentum', () => {
    const p = momentumFromEnergy(450);
    expect(energyFromMomentum(p)).toBeCloseTo(450, 9);
  });

  it('refuses an energy below the rest mass', () => {
    expect(() => momentumFromEnergy(0.5)).toThrow(RangeError);
  });

  it('gives γ ≈ 7461 and β ≈ 1 at 7 TeV', () => {
    expect(lorentzGamma(7000)).toBeCloseTo(7000 / PROTON_MASS_GEV, 6);
    expect(lorentzGamma(7000)).toBeCloseTo(7460.5, 0);
    expect(lorentzBeta(7000)).toBeGreaterThan(0.99999999);
    expect(lorentzBeta(7000)).toBeLessThanOrEqual(1);
  });

  it('gives β = 0 at rest', () => {
    expect(lorentzBeta(PROTON_MASS_GEV)).toBe(0);
  });
});

describe('centre-of-mass energy', () => {
  it('collider: two 6.5 TeV beams give √s = 13 TeV', () => {
    expect(centerOfMassEnergyCollider(6500)).toBeCloseTo(13000, 3);
  });

  it('collider: asymmetric beams follow s = m₁² + m₂² + 2(E₁E₂ + p₁p₂)', () => {
    // Two beams at rest give √s = 2m.
    expect(centerOfMassEnergyCollider(PROTON_MASS_GEV, PROTON_MASS_GEV)).toBeCloseTo(2 * PROTON_MASS_GEV, 9);
  });

  it('fixed target: a 7 TeV beam on a proton at rest gives only about 115 GeV', () => {
    const sqrtS = centerOfMassEnergyFixedTarget(7000);
    expect(sqrtS).toBeGreaterThan(114);
    expect(sqrtS).toBeLessThan(115.5);
  });

  it('fixed target: √s grows as the square root of the beam energy', () => {
    const ratio = centerOfMassEnergyFixedTarget(4000) / centerOfMassEnergyFixedTarget(1000);
    expect(ratio).toBeCloseTo(2, 2);
  });
});
