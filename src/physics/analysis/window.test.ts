import { describe, expect, it } from 'vitest';
import { Histogram } from './histogram';
import { analyseWindow } from './window';

describe('mass window analysis', () => {
  it('estimates the background from the sidebands and the signal as the excess', () => {
    const h = new Histogram({ min: 0, max: 100, bins: 100 });
    for (let b = 0; b < 100; b++) h.addCounts(b, 10); // flat background, 10 per GeV
    for (let b = 45; b < 55; b++) h.addCounts(b, 20); // 200 signal events in [45, 55)
    const result = analyseWindow(h, { minGeV: 45, maxGeV: 55 });
    expect(result.observed).toBe(300);
    expect(result.background).toBe(100);
    expect(result.signal).toBe(200);
    expect(result.significance).toBeCloseTo(20, 6);
    expect(result.sidebands[0]).toEqual({ minGeV: 40, maxGeV: 45 });
    expect(result.sidebands[1]).toEqual({ minGeV: 55, maxGeV: 60 });
  });

  it('never divides by zero background', () => {
    const h = new Histogram({ min: 0, max: 100, bins: 100 });
    h.addCounts(50, 9);
    const result = analyseWindow(h, { minGeV: 49, maxGeV: 52 });
    expect(result.significance).toBe(9);
  });
});
