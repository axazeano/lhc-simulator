import { describe, expect, it } from 'vitest';
import { CollisionRun, DIMUON_HISTOGRAM, buildTemplate, smoothCounts } from './run';
import { Histogram } from '../analysis/histogram';
import { analyseWindow } from '../analysis/window';
import { DEFAULT_DETECTOR } from '../detector/detector';
import { Random } from '../random';
import { processById } from './processes';

import { DEFAULT_CUTS } from './run';
const CUTS = DEFAULT_CUTS;
const INVERSE_NANOBARN_M2 = 1e37;

describe('collision run', () => {
  it('counts inelastic collisions and produces a J/ψ peak from 30 nb⁻¹ at 13 TeV', () => {
    const run = new CollisionRun(1);
    run.collect(30 * INVERSE_NANOBARN_M2, 13000, CUTS);
    expect(run.collisions).toBeCloseTo(79.5e6 * 30, -6);
    const peak = run.histogram.integral(3.0, 3.2);
    const side = run.histogram.integral(3.4, 3.6);
    expect(peak).toBeGreaterThan(3 * side);
    expect(run.visibleByProcess['jpsi_mumu']).toBeGreaterThan(100);
  });

  it('uses individual simulation for rare processes', () => {
    const run = new CollisionRun(2);
    // 1 nb⁻¹: about two Z bosons expected, thousands of J/ψ.
    run.collect(INVERSE_NANOBARN_M2, 13000, CUTS);
    expect(run.simulatedEvents).toBeGreaterThan(0);
    expect(run.simulatedEvents).toBeLessThan(200);
  });

  it('visible counts scale with luminosity', () => {
    const a = new CollisionRun(3);
    a.collect(10 * INVERSE_NANOBARN_M2, 13000, CUTS);
    const b = new CollisionRun(3);
    b.collect(10 * INVERSE_NANOBARN_M2, 13000, CUTS);
    b.collect(10 * INVERSE_NANOBARN_M2, 13000, CUTS);
    expect(b.histogram.entries / a.histogram.entries).toBeCloseTo(2, 0);
    expect(b.integratedLuminosityM2).toBeCloseTo(2 * a.integratedLuminosityM2, 6);
  });

  it('produces no Z bosons below the Z threshold', () => {
    const run = new CollisionRun(4);
    run.collect(100 * INVERSE_NANOBARN_M2, 80, CUTS);
    expect(run.visibleByProcess['z_mumu'] ?? 0).toBe(0);
  });

  it('reset clears the data but not the settings', () => {
    const run = new CollisionRun(5);
    run.collect(INVERSE_NANOBARN_M2, 13000, CUTS);
    run.reset();
    expect(run.histogram.entries).toBe(0);
    expect(run.snapshot().collisions).toBe(0);
  });

  it('fills the diphoton and four-lepton channels from 10 fb⁻¹ at 13 TeV', () => {
    const run = new CollisionRun(6);
    run.collect(10 * 1e43, 13000, CUTS);
    const gg = analyseWindow(run.histograms.gammagamma, { minGeV: 121, maxGeV: 129 });
    // A visible bump over a large background, a few sigma from 10 fb⁻¹ as in 2012.
    expect(gg.background).toBeGreaterThan(5000);
    expect(gg.signal).toBeGreaterThan(200);
    expect(gg.significance).toBeGreaterThan(2.5);
    const fl = run.histograms.fourlepton;
    expect(fl.integral(118, 132)).toBeGreaterThan(10);
    expect(run.visibleByProcess['higgs_fourlepton']).toBeGreaterThan(5);
    expect(run.snapshot().entriesByChannel.fourlepton).toBeGreaterThan(10);
  });

  it('resetChannel clears one channel only', () => {
    const run = new CollisionRun(7);
    run.collect(1e40, 13000, CUTS);
    run.resetChannel('gammagamma');
    expect(run.histograms.gammagamma.entries).toBe(0);
    expect(run.histograms.mumu.entries).toBeGreaterThan(0);
  });

  it('smoothing preserves the total and fills neighbouring bins', () => {
    const h = new Histogram({ min: 0, max: 100, bins: 1000 });
    h.addCounts(500, 1000);
    const smoothed = smoothCounts(h, 0.01); // σ = 0.01 · 50 GeV / 0.1 GeV = 5 bins
    let total = 0;
    for (let b = 0; b < smoothed.length; b++) total += smoothed[b]!;
    expect(total).toBeCloseTo(1000, 6);
    expect(smoothed[500]).toBeLessThan(1000);
    expect(smoothed[495]).toBeGreaterThan(0);
    expect(smoothed[480]).toBe(0);
  });

  it('the Z template has no empty bins across the peak region', () => {
    const template = buildTemplate(processById('z_mumu'), 13000, { ptMinGeV: 20 }, DEFAULT_DETECTOR, DIMUON_HISTOGRAM, new Random(9));
    const h = new Histogram(DIMUON_HISTOGRAM);
    let total = 0;
    for (let b = h.binOf(85); b <= h.binOf(97); b++) {
      expect(template.fractions[b], `bin ${b}`).toBeGreaterThan(0);
      total += template.fractions[b]!;
    }
    expect(total).toBeGreaterThan(0.6);
    expect(template.acceptance).toBeGreaterThan(0.2);
  });
});
