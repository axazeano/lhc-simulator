import { describe, expect, it } from 'vitest';
import { PARTICLES } from '../../data/particles';
import { generateHypotheticalResonance } from '../collision/generator';
import { RECORDING_CUTS } from '../collision/run';
import { invariantMass } from '../fourvector';
import { Random } from '../random';
import type { PeakFit } from './fit';
import { HBAR_GEV_S, comparePassports, crossSectionFromYield, estimateWidth, lookElsewhere, matchKnownParticle, simulateResponse, upperTail, zFromUpperTail } from './passport';
import { defaultSelection } from './selection';

function fitLike(mean: number, sigma: number): PeakFit {
  return {
    mean,
    meanError: 0.01,
    sigma,
    sigmaError: 0.02,
    yield: 10000,
    yieldError: 120,
    backgroundUnderPeak: 500,
    chi2: 30,
    ndf: 25,
    background: { amplitude: 1, slope: 0 },
    range: { min: mean - 5, max: mean + 5 },
    converged: true,
  };
}

describe('particle passport', () => {
  it('a hypothetical resonance decays to the right final state at the right mass', () => {
    const rng = new Random(1);
    const e = generateHypotheticalResonance('mumu', 250, 0, 13000, rng);
    expect(e.kinds).toEqual(['muon', 'muon']);
    expect(e.charges[0]! + e.charges[1]!).toBe(0);
    const sum = e.daughters.reduce((s, d) => ({ e: s.e + d.e, px: s.px + d.px, py: s.py + d.py, pz: s.pz + d.pz }), { e: 0, px: 0, py: 0, pz: 0 });
    expect(invariantMass(sum)).toBeCloseTo(250, 5);
  });

  it('simulated response gives a sensible acceptance and resolution for a Z-like particle', () => {
    const r = simulateResponse('mumu', 91.19, 13000, defaultSelection('s', 's', 20), RECORDING_CUTS.mumu, new Random(2));
    expect(r.acceptance).toBeGreaterThan(0.2);
    expect(r.acceptance).toBeLessThan(0.8);
    expect(r.resolutionRel).toBeGreaterThan(0.004);
    expect(r.resolutionRel).toBeLessThan(0.02);
  });

  it('width estimate: a peak as narrow as the resolution gives only an upper limit, a wide one a value and lifetime', () => {
    const narrow = estimateWidth(fitLike(3.097, 0.03), 0.0095);
    expect(narrow.widthGeV).toBeNull();
    expect(narrow.widthUpperLimitGeV).toBeGreaterThan(0);
    expect(narrow.widthUpperLimitGeV).toBeLessThan(0.3);
    const wide = estimateWidth(fitLike(91.19, 1.6), 0.0095);
    expect(wide.widthGeV).not.toBeNull();
    expect(wide.widthGeV!).toBeGreaterThan(2);
    expect(wide.widthGeV!).toBeLessThan(4);
    expect(wide.lifetimeS).toBeCloseTo(HBAR_GEV_S / wide.widthGeV!, 30);
  });

  it('cross section from yield, acceptance and luminosity', () => {
    // 10 000 events at 40 % acceptance from 1 fb⁻¹ = 25 000 events per fb⁻¹ = 25 pb = 0.025 nb.
    const r = crossSectionFromYield(10000, 100, 0.4, 1e43);
    expect(r.nb).toBeCloseTo(0.025, 6);
    expect(r.errorNb).toBeCloseTo(0.00025, 6);
  });

  it('matches a measured mass to the known particle and grades the passport', () => {
    const known = matchKnownParticle(91.0, 0.05, 'mumu', 13000);
    expect(known?.id).toBe('z');
    expect(known?.crossSectionNb).toBeCloseTo(1.98, 6);
    expect(known?.branchingFraction).toBeCloseTo(0.0337, 6);
    expect(matchKnownParticle(200, 0.1, 'mumu', 13000)).toBeNull();
    const verdict = comparePassports(
      {
        massGeV: 91.2,
        massErrorGeV: 0.02,
        width: estimateWidth(fitLike(91.2, 1.6), 0.0095),
        chargeInferred: 0,
        crossSection: { nb: 1.7, errorNb: 0.1 },
      },
      known!,
    );
    expect(verdict).toEqual({ mass: 'match', width: 'match', charge: 'match', crossSection: 'match' });
    const wrong = comparePassports(
      { massGeV: 92.5, massErrorGeV: 0.02, width: estimateWidth(fitLike(92.5, 0.8), 0.0095), chargeInferred: 1, crossSection: { nb: 0.1, errorNb: 0.01 } },
      known!,
    );
    expect(wrong.mass).toBe('mismatch');
    expect(wrong.charge).toBe('mismatch');
    expect(wrong.crossSection).toBe('mismatch');
    expect(PARTICLES.z.decays.length).toBeGreaterThan(3);
  });
});

describe('look-elsewhere effect', () => {
  it('normal tail and its inverse agree', () => {
    expect(upperTail(0)).toBeCloseTo(0.5, 6);
    expect(upperTail(1.96)).toBeCloseTo(0.025, 3);
    expect(upperTail(5)).toBeCloseTo(2.87e-7, 8);
    expect(zFromUpperTail(0.025)).toBeCloseTo(1.96, 2);
    expect(zFromUpperTail(2.87e-7)).toBeCloseTo(5, 1);
  });

  it('a 3σ local bump found in 500 windows is not even 1σ globally; 6σ local survives', () => {
    const weak = lookElsewhere(3, 2000, 4);
    expect(weak.trials).toBe(500);
    expect(weak.globalSignificance).toBeLessThan(1.5);
    const strong = lookElsewhere(6.5, 2000, 4);
    expect(strong.globalSignificance).toBeGreaterThan(5);
    expect(strong.globalSignificance).toBeLessThan(6.5);
    const huge = lookElsewhere(32, 2000, 200);
    expect(huge.globalSignificance).toBeCloseTo(32, 6);
  });
});
