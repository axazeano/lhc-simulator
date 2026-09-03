import { describe, expect, it } from 'vitest';
import { crossSectionNb, thresholdGeV } from './processes';
import { HIDDEN_COUNT, generateHiddenParticles, hiddenProcess } from './hidden';
import { CollisionRun } from './run';

describe('hidden particles', () => {
  it('are deterministic for a seed and differ between seeds', () => {
    const a = generateHiddenParticles(7);
    const b = generateHiddenParticles(7);
    const c = generateHiddenParticles(8);
    expect(a).toEqual(b);
    expect(a).toHaveLength(HIDDEN_COUNT);
    expect(a[0]!.massGeV).not.toBe(c[0]!.massGeV);
  });

  it('the heavy one lives above the Z, the light one in the continuum', () => {
    for (let seed = 1; seed < 30; seed++) {
      const [heavy, light] = generateHiddenParticles(seed);
      expect(heavy!.massGeV).toBeGreaterThanOrEqual(300);
      expect(heavy!.massGeV).toBeLessThanOrEqual(1500);
      expect(heavy!.channel).toBe('mumu');
      if (light!.channel === 'mumu') {
        expect(light!.massGeV).toBeGreaterThanOrEqual(14);
        expect(light!.massGeV).toBeLessThanOrEqual(70);
      } else {
        expect(light!.massGeV).toBeGreaterThanOrEqual(90);
      }
    }
  });

  it('a hidden process switches off below its mass and grows with energy', () => {
    const [heavy] = generateHiddenParticles(3);
    const process = hiddenProcess(heavy!);
    expect(process.hidden).toBe(true);
    expect(thresholdGeV(process)).toBe(heavy!.massGeV);
    expect(crossSectionNb(process, 900)).toBeLessThan(crossSectionNb(process, 13000));
    expect(crossSectionNb(process, 13000)).toBeCloseTo(heavy!.crossSectionNbAt13TeV, 12);
    expect(crossSectionNb(process, 14000)).toBeGreaterThan(crossSectionNb(process, 13000));
  });

  it('a run with a hidden particle records it under its own process index', () => {
    const hidden = generateHiddenParticles(5);
    const run = new CollisionRun(11, undefined, hidden.map(hiddenProcess));
    run.collect(3e43, 14000); // 30 fb⁻¹
    const visible = run.snapshot().visibleByProcess;
    expect(visible['hidden-1']).toBeGreaterThan(5);
    const h = run.histogramFor('mumu');
    const m = hidden[0]!.massGeV;
    // A bump: more events within ±3 % of the mass than in an equal band just above it.
    expect(h.integral(m * 0.97, m * 1.03)).toBeGreaterThan(h.integral(m * 1.06, m * 1.12));
  });
});
