import { describe, expect, it } from 'vitest';
import { LHC } from '../../data/lhc';
import { lorentzBeta, lorentzGamma } from './kinematics';
import {
  beamSizeAtIP,
  expectedEvents,
  geometricEmittance,
  integratedLuminosityFb,
  luminosityCm2S,
  luminosityM2S,
} from './luminosity';
import { LHC_DESIGN_BEAM } from './machine';

describe('luminosity', () => {
  const gamma = lorentzGamma(7000);
  const beta = lorentzBeta(7000);

  it('the beam at the IP is about 17 µm wide with design parameters', () => {
    const emittance = geometricEmittance(LHC.normalizedEmittanceM, gamma, beta);
    const sigma = beamSizeAtIP(emittance, LHC.designBetaStarM);
    expect(sigma * 1e6).toBeGreaterThan(15);
    expect(sigma * 1e6).toBeLessThan(18);
  });

  it('design parameters reproduce the nominal 1e34 cm⁻² s⁻¹', () => {
    const lum = luminosityCm2S(LHC_DESIGN_BEAM, LHC.revolutionFrequencyHz, gamma, beta);
    expect(lum).toBeGreaterThan(0.8e34);
    expect(lum).toBeLessThan(1.2e34);
  });

  it('luminosity scales as N² and linearly with the number of bunches', () => {
    const base = luminosityM2S(LHC_DESIGN_BEAM, LHC.revolutionFrequencyHz, gamma, beta);
    const doubleN = luminosityM2S(
      { ...LHC_DESIGN_BEAM, protonsPerBunch: 2 * LHC_DESIGN_BEAM.protonsPerBunch },
      LHC.revolutionFrequencyHz,
      gamma,
      beta,
    );
    const halfBunches = luminosityM2S(
      { ...LHC_DESIGN_BEAM, bunches: LHC_DESIGN_BEAM.bunches / 2 },
      LHC.revolutionFrequencyHz,
      gamma,
      beta,
    );
    expect(doubleN / base).toBeCloseTo(4, 9);
    expect(halfBunches / base).toBeCloseTo(0.5, 9);
  });

  it('smaller β* gives proportionally more luminosity', () => {
    const base = luminosityM2S(LHC_DESIGN_BEAM, LHC.revolutionFrequencyHz, gamma, beta);
    const squeezed = luminosityM2S(
      { ...LHC_DESIGN_BEAM, betaStarM: LHC_DESIGN_BEAM.betaStarM / 2 },
      LHC.revolutionFrequencyHz,
      gamma,
      beta,
    );
    expect(squeezed / base).toBeCloseTo(2, 9);
  });

  it('1e34 cm⁻² s⁻¹ for 1e5 seconds integrates to 1 fb⁻¹', () => {
    expect(integratedLuminosityFb(1e38, 1e5)).toBeCloseTo(1, 9);
  });

  it('a 1.9 nb process yields 1.9 million events per fb⁻¹', () => {
    expect(expectedEvents(1.9e-9, 1)).toBeCloseTo(1.9e6, 0);
  });
});
