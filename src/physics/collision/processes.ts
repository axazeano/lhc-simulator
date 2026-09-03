import raw from '../../data/processes.json';
import { PARTICLES, type ParticleId } from '../../data/particles';

/**
 * Physics processes the simulator can produce, with cross sections tabulated against √s.
 * Between table points the cross section is interpolated linearly in log σ vs log √s,
 * which follows the slow power-law growth of hadronic cross sections well.
 * Below the first table point it falls linearly to zero at the kinematic threshold.
 */

export type FinalState = 'mumu' | 'gammagamma' | 'fourlepton';
export type ProcessKind = 'inelastic' | 'resonance' | 'continuum';

export interface ProcessDefinition {
  id: string;
  kind: ProcessKind;
  particle?: ParticleId;
  /** Mass and width for resonances that are not in the particle table (hidden particles). */
  massGeV?: number;
  widthGeV?: number;
  /** True for particles the game invented; they must never be revealed by the process id. */
  hidden?: boolean;
  finalState?: FinalState;
  massRangeGeV?: [number, number];
  powerLawIndex?: number;
  crossSectionNb: number[];
  source: string;
}

/** Mass of a resonance process, from the particle table or the definition itself. */
export function resonanceMassGeV(process: ProcessDefinition): number {
  if (process.massGeV !== undefined) return process.massGeV;
  if (process.particle) return PARTICLES[process.particle].massGeV;
  throw new Error(`Process ${process.id} has no mass`);
}

export function resonanceWidthGeV(process: ProcessDefinition): number {
  if (process.widthGeV !== undefined) return process.widthGeV;
  if (process.particle) return PARTICLES[process.particle].widthGeV;
  return 0;
}

interface RawProcess {
  id: string;
  kind: string;
  particle?: string;
  finalState?: string;
  massRangeGeV?: number[];
  powerLawIndex?: number;
  crossSectionNb: number[];
  source: string;
}

export const SQRT_S_TABLE_GEV: readonly number[] = raw.sqrtSGeV;

export const PROCESSES: readonly ProcessDefinition[] = (raw.processes as RawProcess[]).map((p) => {
  const def: ProcessDefinition = {
    id: p.id,
    kind: p.kind as ProcessKind,
    crossSectionNb: p.crossSectionNb,
    source: p.source,
  };
  if (p.particle) def.particle = p.particle as ParticleId;
  if (p.finalState) def.finalState = p.finalState as FinalState;
  if (p.massRangeGeV) def.massRangeGeV = [p.massRangeGeV[0]!, p.massRangeGeV[1]!];
  if (p.powerLawIndex !== undefined) def.powerLawIndex = p.powerLawIndex;
  if (def.crossSectionNb.length !== SQRT_S_TABLE_GEV.length) {
    throw new Error(`Process ${p.id}: expected ${SQRT_S_TABLE_GEV.length} cross-section points`);
  }
  return def;
});

export function processById(id: string): ProcessDefinition {
  const process = PROCESSES.find((p) => p.id === id);
  if (!process) throw new Error(`Unknown process ${id}`);
  return process;
}

/** Minimum √s at which the process can occur, in GeV. */
export function thresholdGeV(process: ProcessDefinition): number {
  if (process.kind === 'resonance') return resonanceMassGeV(process);
  if (process.kind === 'continuum' && process.massRangeGeV) return process.massRangeGeV[0];
  return 2 * 0.938;
}

/** Cross section in nanobarn at the given √s. */
export function crossSectionNb(process: ProcessDefinition, sqrtSGeV: number): number {
  const table = SQRT_S_TABLE_GEV;
  const values = process.crossSectionNb;
  const threshold = thresholdGeV(process);
  if (sqrtSGeV <= threshold) return 0;
  const first = table[0]!;
  if (sqrtSGeV <= first) {
    return (values[0]! * (sqrtSGeV - threshold)) / (first - threshold);
  }
  const last = table.length - 1;
  if (sqrtSGeV >= table[last]!) {
    return extrapolateLog(table[last - 2]!, values[last - 2]!, table[last]!, values[last]!, sqrtSGeV);
  }
  for (let i = 0; i < last; i++) {
    const x0 = table[i]!;
    const x1 = table[i + 1]!;
    if (sqrtSGeV >= x0 && sqrtSGeV <= x1) {
      return extrapolateLog(x0, values[i]!, x1, values[i + 1]!, sqrtSGeV);
    }
  }
  return values[last]!;
}

function extrapolateLog(x0: number, y0: number, x1: number, y1: number, x: number): number {
  if (y0 <= 0 || y1 <= 0) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  const t = (Math.log(x) - Math.log(x0)) / (Math.log(x1) - Math.log(x0));
  return Math.exp(Math.log(y0) + t * (Math.log(y1) - Math.log(y0)));
}

export const NANOBARN_M2 = 1e-37;

/** Expected number of events for a cross section in nb and an integrated luminosity in m⁻². */
export function expectedCount(crossSectionNbValue: number, integratedLuminosityM2: number): number {
  return crossSectionNbValue * NANOBARN_M2 * integratedLuminosityM2;
}
