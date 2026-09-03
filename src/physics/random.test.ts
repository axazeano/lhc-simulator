import { describe, expect, it } from 'vitest';
import { Random } from './random';

function stats(values: number[]): { mean: number; std: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

describe('seeded random numbers', () => {
  it('is reproducible for the same seed', () => {
    const a = new Random(7);
    const b = new Random(7);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('uniform values lie in [0, 1) with mean ½', () => {
    const rng = new Random(1);
    const values = Array.from({ length: 20000 }, () => rng.next());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(stats(values).mean).toBeCloseTo(0.5, 1);
  });

  it('gaussian has mean 0 and standard deviation 1', () => {
    const rng = new Random(2);
    const { mean, std } = stats(Array.from({ length: 20000 }, () => rng.gaussian()));
    expect(mean).toBeCloseTo(0, 1);
    expect(std).toBeCloseTo(1, 1);
  });

  it('poisson reproduces its mean in both regimes', () => {
    const rng = new Random(3);
    const small = stats(Array.from({ length: 20000 }, () => rng.poisson(4)));
    const large = stats(Array.from({ length: 5000 }, () => rng.poisson(400)));
    expect(small.mean).toBeCloseTo(4, 0);
    expect(small.std).toBeCloseTo(2, 0);
    expect(large.mean / 400).toBeCloseTo(1, 1);
    expect(large.std / 20).toBeCloseTo(1, 0);
  });

  it('poisson of zero is zero', () => {
    expect(new Random(4).poisson(0)).toBe(0);
  });

  it('power law stays inside its range and prefers small values', () => {
    const rng = new Random(5);
    const values = Array.from({ length: 20000 }, () => rng.powerLaw(2, 200, 3.5));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...values)).toBeLessThanOrEqual(200);
    const below5 = values.filter((v) => v < 5).length / values.length;
    expect(below5).toBeGreaterThan(0.85);
  });

  it('breit–wigner is centred on the mass', () => {
    const rng = new Random(6);
    const values = Array.from({ length: 20001 }, () => rng.breitWigner(91.19, 2.5)).sort((a, b) => a - b);
    expect(values[10000]).toBeCloseTo(91.19, 0);
  });

  it('truncated breit–wigner stays inside its interval and matches the full one in the core', () => {
    const rng = new Random(8);
    const values = Array.from({ length: 20000 }, () => rng.breitWignerTruncated(91.19, 2.5, 66, 116));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(66);
    expect(Math.max(...values)).toBeLessThanOrEqual(116);
    // Nothing piles up at the edges: fewer than 0.2 % within 0.1 GeV of either cut.
    const atEdges = values.filter((v) => v < 66.1 || v > 115.9).length / values.length;
    expect(atEdges).toBeLessThan(0.002);
    const core = values.filter((v) => Math.abs(v - 91.19) < 1.25).length / values.length;
    expect(core).toBeGreaterThan(0.45);
    expect(core).toBeLessThan(0.6);
  });
});
