import { describe, expect, it } from 'vitest';
import { EventStore } from '../collision/eventStore';
import { Random } from '../random';
import { buildHistogram } from './builder';
import { fitPeak, nelderMead } from './fit';
import { Histogram } from './histogram';
import { applySelection, defaultSelection } from './selection';
import { defaultRange, variableValue } from './variables';

function storeWithEvents(): EventStore {
  const store = new EventStore({ min: 0, max: 200, bins: 200 });
  const rng = new Random(1);
  const base = { sqrtSGeV: 13000, processIndex: 0, weight: 1 };
  // Opposite-sign pair at 91 GeV, fill 1.
  store.record({ ...base, massGeV: 91, minPtGeV: 30, fill: 1, particles: [
    { kind: 'muon', ptGeV: 45, eta: 0.5, phi: 0.1, charge: 1 },
    { kind: 'muon', ptGeV: 30, eta: -1.0, phi: 3.0, charge: -1 },
  ] }, rng);
  // Same-sign pair at 50 GeV, fill 2, one forward muon.
  store.record({ ...base, massGeV: 50, minPtGeV: 8, fill: 2, particles: [
    { kind: 'muon', ptGeV: 20, eta: 2.4, phi: 1.0, charge: 1 },
    { kind: 'muon', ptGeV: 8, eta: 0.2, phi: -2.0, charge: 1 },
  ] }, rng);
  // Photon pair, fill 2.
  store.record({ ...base, massGeV: 125, minPtGeV: 40, fill: 2, weight: 3, particles: [
    { kind: 'photon', ptGeV: 60, eta: 0.0, phi: 0, charge: 0 },
    { kind: 'photon', ptGeV: 40, eta: 1.5, phi: 2.5, charge: 0 },
  ] }, rng);
  return store;
}

describe('selection', () => {
  it('applies pT, η, charge, mass and fill cuts', () => {
    const store = storeWithEvents();
    expect(applySelection(store, defaultSelection('a', 'all', 0)).passed).toBe(3);
    expect(applySelection(store, defaultSelection('a', 'pt', 10)).passed).toBe(2);
    expect(applySelection(store, { ...defaultSelection('a', 'eta', 0), etaMax: 2.0 }).passed).toBe(2);
    expect(applySelection(store, { ...defaultSelection('a', 'os', 0), charge: 'opposite' }).passed).toBe(2); // photons count as charge 0
    expect(applySelection(store, { ...defaultSelection('a', 'ss', 0), charge: 'same' }).passed).toBe(1);
    expect(applySelection(store, { ...defaultSelection('a', 'm', 0), massMinGeV: 80, massMaxGeV: 100 }).passed).toBe(1);
    expect(applySelection(store, { ...defaultSelection('a', 'f', 0), fills: [2] }).passed).toBe(2);
    expect(applySelection(store, { ...defaultSelection('a', 'lead', 0), leadingPtMinGeV: 50 }).passed).toBe(1);
    expect(applySelection(store, defaultSelection('a', 'all', 0)).weight).toBe(5);
  });
});

describe('variables', () => {
  it('computes kinematic variables from the stored particles', () => {
    const store = storeWithEvents();
    expect(variableValue(store, 0, 'mass')).toBeCloseTo(91, 5);
    expect(variableValue(store, 0, 'leadingPt')).toBeCloseTo(45, 5);
    expect(variableValue(store, 0, 'subleadingPt')).toBeCloseTo(30, 5);
    expect(variableValue(store, 0, 'leadingEta')).toBeCloseTo(0.5, 5);
    expect(variableValue(store, 0, 'deltaEta')).toBeCloseTo(1.5, 5);
    expect(variableValue(store, 0, 'deltaPhi')).toBeCloseTo(2.9, 5);
    expect(variableValue(store, 0, 'sumPt')).toBeCloseTo(75, 5);
    expect(variableValue(store, 1, 'deltaPhi')).toBeCloseTo(3.0, 5);
    expect(defaultRange('deltaPhi', 2, 200).max).toBeCloseTo(Math.PI, 9);
  });

  it('builds a histogram of a variable for a selection', () => {
    const store = storeWithEvents();
    const built = buildHistogram(store, defaultSelection('a', 'all', 0), 'leadingPt', { min: 0, max: 100, bins: 10 });
    expect(built.passed).toBe(3);
    expect(built.histogram.integral(40, 50)).toBe(1);
    expect(built.histogram.integral(60, 70)).toBe(3); // the photon pair has weight 3
  });
});

describe('peak fit', () => {
  it('nelder–mead finds the minimum of a quadratic bowl', () => {
    const r = nelderMead((p) => (p[0]! - 3) ** 2 + (p[1]! + 1) ** 2, [0, 0], [1, 1]);
    expect(r.x[0]).toBeCloseTo(3, 4);
    expect(r.x[1]).toBeCloseTo(-1, 4);
    expect(r.converged).toBe(true);
  });

  it('recovers a Gaussian peak on an exponential background with errors', () => {
    const h = new Histogram({ min: 60, max: 120, bins: 300 });
    const rng = new Random(5);
    const truth = { mean: 91.2, sigma: 1.8, events: 20000 };
    for (let i = 0; i < truth.events; i++) h.fill(truth.mean + truth.sigma * rng.gaussian());
    for (let b = 0; b < 300; b++) h.addCounts(b, rng.poisson(400 * Math.exp(-0.02 * (h.binCenter(b) - 90))));
    const fit = fitPeak(h, { min: 75, max: 107 }, { mean: 90, sigma: 3 });
    expect(fit.converged).toBe(true);
    expect(fit.mean).toBeCloseTo(truth.mean, 1);
    expect(fit.sigma).toBeCloseTo(truth.sigma, 0);
    expect(fit.yield / truth.events).toBeCloseTo(1, 1);
    expect(fit.meanError).toBeGreaterThan(0.005);
    expect(fit.meanError).toBeLessThan(0.1);
    expect(fit.chi2 / fit.ndf).toBeLessThan(2);
  });
});
