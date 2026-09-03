import { describe, expect, it } from 'vitest';
import { Histogram } from './histogram';

describe('histogram', () => {
  it('fills, counts and integrates', () => {
    const h = new Histogram({ min: 0, max: 10, bins: 10 });
    h.fill(0.5);
    h.fill(3.2);
    h.fill(3.9);
    h.fill(10); // out of range
    expect(h.entries).toBe(3);
    expect(h.counts[3]).toBe(2);
    expect(h.integral(3, 4)).toBe(2);
    expect(h.integral(0, 10)).toBe(3);
    expect(h.integral(-5, 1)).toBe(1);
  });

  it('rebins a range into drawing columns', () => {
    const h = new Histogram({ min: 0, max: 10, bins: 100 });
    for (let x = 0.05; x < 10; x += 0.1) h.fill(x);
    const columns = h.rebin(0, 10, 5);
    expect(Array.from(columns).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([20, 20, 20, 20, 20]);
  });

  it('shares a bin between narrower columns in proportion to overlap', () => {
    const h = new Histogram({ min: 0, max: 10, bins: 10 });
    h.addCounts(3, 100); // bin [3, 4)
    const columns = h.rebin(3, 4, 4);
    expect(Array.from(columns).map((v) => Math.round(v))).toEqual([25, 25, 25, 25]);
    const straddling = h.rebin(2.5, 4.5, 2); // columns [2.5, 3.5) and [3.5, 4.5)
    expect(Array.from(straddling).map((v) => Math.round(v))).toEqual([50, 50]);
  });

  it('adds counts directly to a bin', () => {
    const h = new Histogram({ min: 0, max: 10, bins: 10 });
    h.addCounts(2, 50);
    h.addCounts(99, 5);
    expect(h.entries).toBe(50);
    expect(h.binCenter(2)).toBe(2.5);
  });
});
