import { describe, expect, it } from 'vitest';
import { Histogram } from './histogram';
import { analyseWindow, backgroundCurve, interpolateBackground } from './window';

describe('mass window analysis', () => {
  it('estimates a flat background and the signal as the excess', () => {
    const h = new Histogram({ min: 0, max: 100, bins: 100 });
    for (let b = 0; b < 100; b++) h.addCounts(b, 10); // flat background, 10 per GeV
    for (let b = 45; b < 55; b++) h.addCounts(b, 20); // 200 signal events in [45, 55)
    const result = analyseWindow(h, { minGeV: 45, maxGeV: 55 });
    expect(result.observed).toBe(300);
    expect(result.background).toBeCloseTo(100, 3);
    expect(result.signal).toBeCloseTo(200, 3);
    expect(result.significance).toBeCloseTo(20, 2);
    expect(result.method).toBe('fit');
    expect(result.sidebands[0]).toEqual({ minGeV: 25, maxGeV: 45 });
    expect(result.sidebands[1]).toEqual({ minGeV: 55, maxGeV: 75 });
  });

  it('recovers a small signal on a steeply falling exponential background', () => {
    const h = new Histogram({ min: 80, max: 200, bins: 2400 });
    const lambda = 0.03; // per GeV
    for (let b = 0; b < 2400; b++) h.addCounts(b, 5000 * Math.exp(-lambda * h.binCenter(b)));
    const result = analyseWindow(h, { minGeV: 121, maxGeV: 129 });
    expect(Math.abs(result.signal) / result.observed).toBeLessThan(0.002);
    for (let b = h.binOf(123); b < h.binOf(127); b++) h.addCounts(b, 5);
    const withSignal = analyseWindow(h, { minGeV: 121, maxGeV: 129 });
    expect(withSignal.signal).toBeCloseTo(400, -1);
  });

  it('follows a background whose slope changes, as an acceptance turn-on makes it', () => {
    const h = new Histogram({ min: 80, max: 200, bins: 2400 });
    for (let b = 0; b < 2400; b++) {
      const m = h.binCenter(b);
      // Power law times a rising acceptance: ln f has clear curvature around 125 GeV.
      h.addCounts(b, 1e12 * m ** -4 * (1 - Math.exp(-(m - 60) / 30)));
    }
    const result = analyseWindow(h, { minGeV: 121, maxGeV: 129 });
    expect(Math.abs(result.signal) / result.observed).toBeLessThan(0.003);
  });

  it('falls back to interpolation when the sidebands are sparse', () => {
    const h = new Histogram({ min: 0, max: 100, bins: 100 });
    h.addCounts(48, 3);
    h.addCounts(50, 9);
    h.addCounts(56, 2);
    const result = analyseWindow(h, { minGeV: 49, maxGeV: 52 });
    expect(result.method).toBe('interpolation');
    expect(result.observed).toBe(9);
  });

  it('falls back to the plain sum when a sideband is empty', () => {
    expect(interpolateBackground(0, 10)).toBe(10);
    expect(interpolateBackground(7, 0)).toBe(7);
    expect(interpolateBackground(10, 10)).toBeCloseTo(20, 9);
  });

  it('never divides by zero background', () => {
    const h = new Histogram({ min: 0, max: 100, bins: 100 });
    h.addCounts(50, 9);
    const result = analyseWindow(h, { minGeV: 49, maxGeV: 52 });
    expect(result.significance).toBe(9);
  });
});

describe('backgroundCurve', () => {
  it('integrates to the fitted background of the window analysis', () => {
    const h = new Histogram({ min: 50, max: 150, bins: 400 });
    // A smooth exponential background with plenty of events, no peak.
    for (let i = 0; i < 400; i++) {
      const m = 50 + (i + 0.5) * 0.25;
      h.fill(m, 1000 * Math.exp(-(m - 50) / 40));
    }
    const window = { minGeV: 86, maxGeV: 96 };
    const curve = backgroundCurve(h, window);
    expect(curve).not.toBeNull();
    let integral = 0;
    for (let m = 86.125; m < 96; m += 0.25) integral += curve!(m);
    const analysis = analyseWindow(h, window);
    expect(analysis.method).toBe('fit');
    expect(integral).toBeCloseTo(analysis.background, -1);
    expect(Math.abs(integral - analysis.background) / analysis.background).toBeLessThan(0.02);
  });
});
