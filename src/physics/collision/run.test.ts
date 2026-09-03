import { describe, expect, it } from 'vitest';
import { analyseWindow } from '../analysis/window';
import { DEFAULT_DETECTOR } from '../detector/detector';
import { Random } from '../random';
import { buildEventPool, drawFromPool, fitPolynomial } from './eventPool';
import { EventStore } from './eventStore';
import { PROCESSES, processById } from './processes';
import { CollisionRun, DEFAULT_CUTS, DIMUON_HISTOGRAM, RECORDING_CUTS } from './run';

const INVERSE_NANOBARN_M2 = 1e37;

describe('collision run', () => {
  it('counts inelastic collisions and produces a J/ψ peak from 30 nb⁻¹ at 13 TeV', () => {
    const run = new CollisionRun(1);
    run.collect(30 * INVERSE_NANOBARN_M2, 13000);
    expect(run.collisions).toBeCloseTo(79.5e6 * 30, -6);
    const h = run.histogramFor('mumu');
    const peak = h.integral(3.0, 3.2);
    const side = h.integral(3.4, 3.6);
    expect(peak).toBeGreaterThan(3 * side);
    expect(run.snapshot().visibleByProcess['jpsi_mumu']).toBeGreaterThan(100);
  });

  it('records rare processes one by one and frequent ones prescaled', () => {
    const run = new CollisionRun(2);
    run.collect(INVERSE_NANOBARN_M2, 13000); // about two Z bosons, thousands of J/ψ
    expect(run.simulatedEvents).toBeGreaterThan(0);
    expect(run.simulatedEvents).toBeLessThan(200);
    // About seven J/ψ pass the detector at 1 nb⁻¹, each recorded as a real event.
    expect(run.stores.mumu.size).toBeGreaterThan(3);
    expect(run.stores.mumu.representedEvents).toBeGreaterThan(0.5 * run.stores.mumu.size);
    const heavy = new CollisionRun(20);
    heavy.collect(1000 * INVERSE_NANOBARN_M2, 13000); // millions of J/ψ: prescaled
    expect(heavy.stores.mumu.representedEvents).toBeGreaterThan(5 * heavy.stores.mumu.size);
  });

  it('represented counts scale with luminosity', () => {
    const a = new CollisionRun(3);
    a.collect(10 * INVERSE_NANOBARN_M2, 13000);
    const b = new CollisionRun(3);
    b.collect(10 * INVERSE_NANOBARN_M2, 13000);
    b.collect(10 * INVERSE_NANOBARN_M2, 13000);
    expect(b.histogramFor('mumu').entries / a.histogramFor('mumu').entries).toBeCloseTo(2, 0);
    expect(b.integratedLuminosityM2).toBeCloseTo(2 * a.integratedLuminosityM2, 6);
  });

  it('produces no Z bosons below the Z threshold', () => {
    const run = new CollisionRun(4);
    run.collect(100 * INVERSE_NANOBARN_M2, 80);
    expect(run.snapshot().visibleByProcess['z_mumu'] ?? 0).toBe(0);
  });

  it('reset clears the data', () => {
    const run = new CollisionRun(5);
    run.collect(INVERSE_NANOBARN_M2, 13000);
    run.reset();
    expect(run.histogramFor('mumu').entries).toBe(0);
    expect(run.snapshot().collisions).toBe(0);
  });

  it('fills the diphoton and four-lepton channels from 30 fb⁻¹ at 13 TeV', () => {
    const run = new CollisionRun(6);
    for (let i = 0; i < 300; i++) run.collect(0.1 * 1e43, 13000); // 30 fb⁻¹ in app-sized steps
    const gg = analyseWindow(run.histogramFor('gammagamma'), { minGeV: 121, maxGeV: 129 });
    // About 1400 signal events on 55 000 background: a clear excess, as in 2015–2016.
    expect(gg.background).toBeGreaterThan(20000);
    expect(gg.signal).toBeGreaterThan(500);
    expect(gg.significance).toBeGreaterThan(2.5);
    const fl = run.histogramFor('fourlepton');
    expect(fl.integral(118, 132)).toBeGreaterThan(10);
    expect(run.snapshot().visibleByProcess['higgs_fourlepton']).toBeGreaterThan(5);
    expect(run.snapshot().entriesByChannel.fourlepton).toBeGreaterThan(10);
  });

  it('resetChannel clears one channel only', () => {
    const run = new CollisionRun(7);
    run.collect(1e40, 13000);
    run.resetChannel('gammagamma');
    expect(run.histogramFor('gammagamma').entries).toBe(0);
    expect(run.histogramFor('mumu').entries).toBeGreaterThan(0);
  });

  it('offline analysis: raising the threshold removes events without losing the data', () => {
    const run = new CollisionRun(8);
    run.collect(200 * INVERSE_NANOBARN_M2, 13000);
    const loose = run.histogramFor('mumu', { ptMinGeV: 3 }).integral(3.0, 3.2);
    const tight = run.histogramFor('mumu', { ptMinGeV: 5 }).integral(3.0, 3.2);
    expect(tight).toBeLessThan(loose);
    expect(tight).toBeGreaterThan(0);
    // Back to the loose threshold: the same data, nothing was discarded.
    expect(run.histogramFor('mumu', { ptMinGeV: 3 }).integral(3.0, 3.2)).toBe(loose);
  });

  it('high-mass events are recorded one by one while the low-mass bulk is prescaled', () => {
    const run = new CollisionRun(21);
    run.collect(5 * INVERSE_NANOBARN_M2, 13000); // ~10 Z bosons visible, thousands of J/ψ
    const store = run.stores.mumu;
    const byProcess = store.countByProcess(3);
    const z = byProcess.get(PROCESSES.findIndex((p) => p.id === 'z_mumu')) ?? 0;
    expect(z).toBeGreaterThan(0);
    expect(Number.isInteger(Math.round(z * 1e6) / 1e6)).toBe(true);
  });

  it('the Z peak in the mumu channel is smooth at very high statistics', () => {
    const run = new CollisionRun(9);
    for (let i = 0; i < 40; i++) run.collect(5e42, 14000); // 200 fb⁻¹ in app-sized steps
    const h = run.histogramFor('mumu', DEFAULT_CUTS.mumu);
    // Away from the peak itself the tails must be smooth: no 1 GeV slice stands out from its neighbours.
    for (let m = 66; m < 120; m += 1) {
      if (m >= 85 && m <= 97) continue;
      const here = h.integral(m, m + 1);
      const around = (h.integral(m - 3, m) + h.integral(m + 1, m + 4)) / 6;
      if (around > 1000) expect(here / around, `at ${m} GeV`).toBeLessThan(1.35);
    }
  });
});

describe('event pool', () => {
  it('draws in proportion to weight and jitters the mass', () => {
    const pool = buildEventPool(processById('z_mumu'), 13000, RECORDING_CUTS.mumu, DEFAULT_DETECTOR, DIMUON_HISTOGRAM, new Random(10), 60);
    expect(pool.high.fraction).toBeGreaterThan(0.95);
    expect(pool.events.length).toBeGreaterThan(1000);
    expect(pool.acceptance).toBeGreaterThan(0.1);
    const rng = new Random(11);
    const drawn = Array.from({ length: 2000 }, () => drawFromPool(pool, rng)!);
    const masses = drawn.map((d) => d.massGeV).sort((a, b) => a - b);
    expect(masses[1000]).toBeCloseTo(91.19, 0);
    expect(new Set(masses).size).toBeGreaterThan(1990);
    // Drawn events carry a realistic minimum pT: above the recording threshold, mostly tens of GeV.
    const pts = drawn.map((d) => d.minPtGeV);
    expect(Math.min(...pts)).toBeGreaterThanOrEqual(RECORDING_CUTS.mumu.ptMinGeV);
    expect(pts.filter((p) => p > 20).length / pts.length).toBeGreaterThan(0.5);
  });
});

describe('event store', () => {
  it('thinning keeps the represented total and never touches single events first', () => {
    const store = new EventStore({ min: 0, max: 100, bins: 100 }, 1000);
    const rng = new Random(12);
    for (let i = 0; i < 900; i++) store.record({ massGeV: 50, minPtGeV: 5, sqrtSGeV: 13000, processIndex: 1, weight: 10 }, rng);
    for (let i = 0; i < 100; i++) store.record({ massGeV: 20, minPtGeV: 5, sqrtSGeV: 13000, processIndex: 2, weight: 1 }, rng);
    const before = store.representedEvents;
    store.record({ massGeV: 50, minPtGeV: 5, sqrtSGeV: 13000, processIndex: 1, weight: 10 }, rng);
    expect(store.size).toBeLessThan(1000);
    expect(store.representedEvents / (before + 10)).toBeCloseTo(1, 0);
    expect(store.histogram(0).integral(20, 21)).toBe(100);
  });

  it('applies the analysis threshold to the recorded minimum pT', () => {
    const store = new EventStore({ min: 0, max: 100, bins: 100 });
    const rng = new Random(13);
    store.record({ massGeV: 10, minPtGeV: 4, sqrtSGeV: 900, processIndex: 0, weight: 1 }, rng);
    store.record({ massGeV: 10, minPtGeV: 12, sqrtSGeV: 900, processIndex: 0, weight: 1 }, rng);
    expect(store.histogram(3).entries).toBe(2);
    expect(store.histogram(10).entries).toBe(1);
    expect(store.histogram(20).entries).toBe(0);
  });

  it('the fitted continuum density is smooth to well under a per cent', () => {
    const pool = buildEventPool(processById('continuum_gammagamma'), 13000, RECORDING_CUTS.gammagamma, DEFAULT_DETECTOR, { min: 80, max: 200, bins: 2400 }, new Random(14));
    // Compare each 4 GeV slice with the geometric mean of its neighbours: an exponential-like density passes exactly.
    const slice = (m: number) => {
      let s = 0;
      for (let b = Math.round((m - 80) / 0.05); b < Math.round((m + 4 - 80) / 0.05); b++) s += pool.density[b]!;
      return s;
    };
    for (let m = 100; m < 160; m += 4) {
      const here = slice(m);
      const expected = Math.sqrt(slice(m - 4) * slice(m + 4));
      expect(Math.abs(here / expected - 1)).toBeLessThan(0.005);
    }
  });
});

describe('polynomial fit', () => {
  it('recovers a cubic exactly', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const ys = xs.map((x) => 2 - x + 0.5 * x * x - 0.1 * x * x * x);
    const c = fitPolynomial(xs, ys, xs.map(() => 1), 3);
    expect(c[0]).toBeCloseTo(2, 6);
    expect(c[1]).toBeCloseTo(-1, 6);
    expect(c[2]).toBeCloseTo(0.5, 6);
    expect(c[3]).toBeCloseTo(-0.1, 6);
  });

  it('the Z pool density has analytic Breit–Wigner tails', () => {
    const pool = buildEventPool(processById('z_mumu'), 13000, RECORDING_CUTS.mumu, DEFAULT_DETECTOR, DIMUON_HISTOGRAM, new Random(15), 60);
    const perGeV = (m: number) => {
      let s = 0;
      for (let b = Math.round((m - 2) / 0.02); b < Math.round((m + 1 - 2) / 0.02); b++) s += pool.density[b]!;
      return s;
    };
    const peak = perGeV(91);
    // Breit–Wigner: at Δ = 15 GeV the density is (Γ/2)² / (Δ² + (Γ/2)²) ≈ 0.7 % of the peak, within a factor of two for acceptance.
    const ratio = perGeV(76) / peak;
    expect(ratio).toBeGreaterThan(0.003);
    expect(ratio).toBeLessThan(0.015);
    // Tails vary smoothly: far from the peak consecutive GeV slices differ by 10–20 %, as a Breit–Wigner does.
    for (let m = 68; m < 80; m++) {
      const ratio = perGeV(m + 1) / perGeV(m);
      expect(ratio, `at ${m} GeV`).toBeGreaterThan(1.02);
      expect(ratio, `at ${m} GeV`).toBeLessThan(1.3);
    }
  });

  it('thinning never inflates a bin that holds a single record', () => {
    const store = new EventStore({ min: 0, max: 100, bins: 100 }, 1000);
    const rng = new Random(17);
    // One heavy lone record in bin 90, the rest crowded into bin 10.
    store.record({ massGeV: 90.5, minPtGeV: 5, sqrtSGeV: 900, processIndex: 1, weight: 100 }, rng);
    for (let i = 0; i < 999; i++) store.record({ massGeV: 10.5, minPtGeV: 5, sqrtSGeV: 900, processIndex: 1, weight: 4 }, rng);
    for (let round = 0; round < 5; round++) store.thin(rng);
    const h = store.histogram(0);
    expect(h.integral(90, 91)).toBe(100);
    expect(h.integral(10, 11)).toBeCloseTo(999 * 4, 1);
  });

  it('thinning is stratified: every bin keeps about half of its prescaled records', () => {
    const store = new EventStore({ min: 0, max: 100, bins: 100 }, 2000);
    const rng = new Random(16);
    for (let i = 0; i < 2000; i++) store.record({ massGeV: (i % 100) + 0.5, minPtGeV: 5, sqrtSGeV: 900, processIndex: 1, weight: 4 }, rng);
    store.record({ massGeV: 50.5, minPtGeV: 5, sqrtSGeV: 900, processIndex: 1, weight: 4 }, rng); // triggers thinning
    const h = store.histogram(0);
    // Every bin held 20 records of weight 4 when the store filled; bin 50 then received one more.
    for (let b = 0; b < 100; b++) expect(h.counts[b]).toBeCloseTo(b === 50 ? 84 : 80, 1);
    expect(store.representedEvents).toBeCloseTo(2001 * 4, -1);
  });
});
