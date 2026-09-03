import { describe, expect, it } from 'vitest';
import { PROCESSES, crossSectionNb, expectedCount, processById, thresholdGeV } from './processes';

describe('process cross sections', () => {
  const z = processById('z_mumu');
  const jpsi = processById('jpsi_mumu');
  const inelastic = processById('inelastic');

  it('reproduces the table at its points', () => {
    expect(crossSectionNb(z, 13000)).toBeCloseTo(1.98, 6);
    expect(crossSectionNb(z, 7000)).toBeCloseTo(0.99, 6);
    expect(crossSectionNb(inelastic, 7000) / 1e6).toBeCloseTo(73, 6);
  });

  it('interpolates between points and grows with √s', () => {
    const at10 = crossSectionNb(z, 10000);
    expect(at10).toBeGreaterThan(1.13);
    expect(at10).toBeLessThan(1.98);
    let previous = 0;
    for (let s = 200; s <= 14000; s += 200) {
      const value = crossSectionNb(z, s);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('is zero below the kinematic threshold', () => {
    expect(thresholdGeV(z)).toBeCloseTo(91.19, 1);
    expect(crossSectionNb(z, 80)).toBe(0);
    expect(crossSectionNb(z, 92)).toBeGreaterThan(0);
    expect(crossSectionNb(jpsi, 3)).toBe(0);
  });

  it('extrapolates mildly above the last point', () => {
    expect(crossSectionNb(z, 20000)).toBeGreaterThan(2.12);
    expect(crossSectionNb(z, 20000)).toBeLessThan(3.5);
  });

  it('every process has a source', () => {
    for (const p of PROCESSES) expect(p.source.length).toBeGreaterThan(20);
  });

  it('1.98 nb over 1 fb⁻¹ is about two million Z bosons', () => {
    expect(expectedCount(1.98, 1e43)).toBeCloseTo(1.98e6, 0);
  });
});
