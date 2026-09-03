import { describe, expect, it } from 'vitest';
import { PARTICLES } from '../../data/particles';
import { invariantMass, rapidity } from '../fourvector';
import { Random } from '../random';
import { generateEvent, generateWeightedEvent, parentOf, powerLawMassDensity, powerLawPtDensity, samplePowerLawPt, sampleZPairMasses } from './generator';
import { transverseMomentum } from '../fourvector';
import { processById } from './processes';

describe('event generator', () => {
  const z = processById('z_mumu');
  const jpsi = processById('jpsi_mumu');
  const continuum = processById('continuum_mumu');

  it('daughters add up to the parent mass', () => {
    const rng = new Random(11);
    for (let i = 0; i < 200; i++) {
      const event = generateEvent(z, 13000, rng);
      expect(invariantMass(parentOf(event))).toBeCloseTo(event.massGeV, 6);
    }
  });

  it('Z masses centre on the PDG value with the natural width', () => {
    const rng = new Random(12);
    const masses = Array.from({ length: 4001 }, () => generateEvent(z, 13000, rng).massGeV).sort((a, b) => a - b);
    expect(masses[2000]).toBeCloseTo(PARTICLES.z.massGeV, 0);
    // Half of the events lie within ±Γ/2 of the peak for a Breit–Wigner.
    const inside = masses.filter((m) => Math.abs(m - PARTICLES.z.massGeV) < PARTICLES.z.widthGeV / 2).length;
    expect(inside / masses.length).toBeGreaterThan(0.4);
    expect(inside / masses.length).toBeLessThan(0.6);
  });

  it('J/ψ is effectively a delta function', () => {
    const rng = new Random(13);
    for (let i = 0; i < 100; i++) {
      // Within ±40 widths, i.e. under 4 MeV, of a 3.1 GeV peak.
      expect(Math.abs(generateEvent(jpsi, 13000, rng).massGeV - PARTICLES.jpsi.massGeV)).toBeLessThan(0.004);
    }
  });

  it('continuum masses stay inside the configured range', () => {
    const rng = new Random(14);
    for (let i = 0; i < 500; i++) {
      const m = generateEvent(continuum, 13000, rng).massGeV;
      expect(m).toBeGreaterThanOrEqual(2);
      expect(m).toBeLessThanOrEqual(200);
    }
  });

  it('parents respect the kinematic rapidity limit', () => {
    const rng = new Random(15);
    for (let i = 0; i < 500; i++) {
      const event = generateEvent(z, 900, rng);
      const limit = Math.log(900 / event.massGeV);
      expect(Math.abs(rapidity(parentOf(event)))).toBeLessThanOrEqual(limit + 1e-6);
    }
  });

  it('the pT density integrates to one', () => {
    let sum = 0;
    const step = 0.01;
    for (let pt = step / 2; pt < 400; pt += step) sum += powerLawPtDensity(pt, 3, 3.5) * step;
    expect(sum).toBeCloseTo(1, 3);
  });

  it('weighted events reproduce the unweighted high-pT fraction', () => {
    const rng = new Random(16);
    const n = 40000;
    let plain = 0;
    for (let i = 0; i < n; i++) if (samplePowerLawPt(3, 3.5, rng) > 5) plain += 1;
    let weighted = 0;
    for (let i = 0; i < n; i++) {
      const event = generateWeightedEvent(jpsi, 13000, rng);
      if (transverseMomentum(parentOf(event)) > 5) weighted += event.weight;
    }
    const p0 = 2.5 + 0.2 * 3.0969;
    const expected = (1 + 25 / (p0 * p0)) ** -2.5;
    expect(weighted / n).toBeCloseTo(expected, 1);
    expect(plain / n).toBeCloseTo((1 + 25 / 9) ** -2.5, 1);
  });

  it('the mass density integrates to one', () => {
    let sum = 0;
    const step = 0.001;
    for (let m = 2 + step / 2; m < 200; m += step) sum += powerLawMassDensity(m, 2, 200, 3.5) * step;
    expect(sum).toBeCloseTo(1, 3);
  });

  it('weighted continuum events reproduce the true high-mass fraction', () => {
    const rng = new Random(17);
    const n = 40000;
    let weighted = 0;
    let weightSum = 0;
    let above60 = 0;
    for (let i = 0; i < n; i++) {
      const event = generateWeightedEvent(continuum, 13000, rng);
      weightSum += event.weight;
      if (event.massGeV > 60) {
        weighted += event.weight;
        above60 += 1;
      }
    }
    const trueFraction = (60 ** -2.5 - 200 ** -2.5) / (2 ** -2.5 - 200 ** -2.5);
    expect(weightSum / n).toBeCloseTo(1, 1);
    expect(weighted / n).toBeCloseTo(trueFraction, 3);
    // The sampler puts far more events above 60 GeV than the true distribution would.
    expect(above60 / n).toBeGreaterThan(50 * trueFraction);
  });

  it('the ZZ* chain conserves the parent mass and keeps pair masses in range', () => {
    const rng = new Random(18);
    const higgs = processById('higgs_fourlepton');
    for (let i = 0; i < 200; i++) {
      const event = generateEvent(higgs, 13000, rng);
      expect(event.daughters).toHaveLength(4);
      expect(invariantMass(parentOf(event))).toBeCloseTo(event.massGeV, 5);
      const [m1, m2] = sampleZPairMasses(125.2, rng);
      expect(m1 + m2).toBeLessThanOrEqual(125.2 + 1e-9);
      expect(m1).toBeGreaterThanOrEqual(12);
      expect(m2).toBeGreaterThanOrEqual(12);
    }
  });

  it('photons are massless', () => {
    const rng = new Random(19);
    const event = generateEvent(processById('higgs_gammagamma'), 13000, rng);
    expect(event.kinds).toEqual(['photon', 'photon']);
    for (const d of event.daughters) expect(invariantMass(d)).toBeLessThan(1e-3);
  });
});
