import { describe, expect, it } from 'vitest';
import { PARTICLES } from '../../data/particles';
import { generateEvent } from '../collision/generator';
import { processById } from '../collision/processes';
import { Random } from '../random';
import { DEFAULT_DETECTOR, muonPtResolution, reconstructEventMass, reconstructPairMass } from './detector';
import type { FourVector } from '../fourvector';

function reconstructMany(processId: string, sqrtS: number, ptMin: number, n: number, seed: number): number[] {
  const rng = new Random(seed);
  const process = processById(processId);
  const masses: number[] = [];
  for (let i = 0; i < n; i++) {
    const event = generateEvent(process, sqrtS, rng);
    const m = reconstructPairMass(event.daughters as [FourVector, FourVector], DEFAULT_DETECTOR, { ptMinGeV: ptMin }, rng);
    if (m !== null) masses.push(m);
  }
  return masses.sort((a, b) => a - b);
}

describe('detector model', () => {
  it('resolution is about 1 % at low pT and grows at high pT', () => {
    expect(muonPtResolution(5, DEFAULT_DETECTOR)).toBeCloseTo(0.012, 3);
    expect(muonPtResolution(1000, DEFAULT_DETECTOR)).toBeGreaterThan(0.09);
  });

  it('accepts a sizeable but not complete fraction of Z → μμ', () => {
    const masses = reconstructMany('z_mumu', 13000, 20, 4000, 21);
    const acceptance = masses.length / 4000;
    expect(acceptance).toBeGreaterThan(0.25);
    expect(acceptance).toBeLessThan(0.8);
  });

  it('the reconstructed Z peak sits at the right mass', () => {
    const masses = reconstructMany('z_mumu', 13000, 20, 4000, 22);
    const median = masses[Math.floor(masses.length / 2)]!;
    expect(median).toBeCloseTo(PARTICLES.z.massGeV, 0);
  });

  it('the reconstructed J/ψ peak is narrow', () => {
    const masses = reconstructMany('jpsi_mumu', 13000, 3, 40000, 23);
    // Both muons above 3 GeV keeps only a few per cent of all J/ψ, as in the real experiments.
    expect(masses.length).toBeGreaterThan(40);
    expect(masses.length).toBeLessThan(4000);
    const q1 = masses[Math.floor(masses.length * 0.25)]!;
    const q3 = masses[Math.floor(masses.length * 0.75)]!;
    // Interquartile range of a Gaussian is 1.35 σ; expect σ of a few tens of MeV.
    expect((q3 - q1) / 1.35).toBeLessThan(0.08);
    expect((q3 - q1) / 1.35).toBeGreaterThan(0.01);
  });

  it('a high pT cut removes the J/ψ entirely', () => {
    const masses = reconstructMany('jpsi_mumu', 13000, 50, 2000, 24);
    expect(masses.length).toBe(0);
  });

  it('reconstructs H → γγ with about one per cent mass resolution', () => {
    const rng = new Random(25);
    const process = processById('higgs_gammagamma');
    const masses: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const event = generateEvent(process, 13000, rng);
      const m = reconstructEventMass(event.daughters, event.kinds, DEFAULT_DETECTOR, { ptMinGeV: 30 }, rng);
      if (m !== null) masses.push(m);
    }
    masses.sort((a, b) => a - b);
    expect(masses.length / 4000).toBeGreaterThan(0.2);
    const median = masses[Math.floor(masses.length / 2)]!;
    expect(median).toBeCloseTo(PARTICLES.higgs.massGeV, 0);
    const q1 = masses[Math.floor(masses.length * 0.25)]!;
    const q3 = masses[Math.floor(masses.length * 0.75)]!;
    expect((q3 - q1) / 1.35).toBeLessThan(2.5);
    expect((q3 - q1) / 1.35).toBeGreaterThan(0.5);
  });

  it('reconstructs H → ZZ* → 4ℓ with a peak at the Higgs mass and modest acceptance', () => {
    const rng = new Random(26);
    const process = processById('higgs_fourlepton');
    const masses: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const event = generateEvent(process, 13000, rng);
      expect(event.daughters).toHaveLength(4);
      const m = reconstructEventMass(event.daughters, event.kinds, DEFAULT_DETECTOR, { ptMinGeV: 7 }, rng);
      if (m !== null) masses.push(m);
    }
    masses.sort((a, b) => a - b);
    const acceptance = masses.length / 4000;
    expect(acceptance).toBeGreaterThan(0.1);
    expect(acceptance).toBeLessThan(0.7);
    const median = masses[Math.floor(masses.length / 2)]!;
    expect(median).toBeCloseTo(PARTICLES.higgs.massGeV, 0);
  });
});
