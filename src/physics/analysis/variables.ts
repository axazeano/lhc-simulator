import { MAX_PARTICLES, type EventStore } from '../collision/eventStore';

/** Quantities that can be histogrammed for a recorded event. */
export type Variable = 'mass' | 'leadingPt' | 'subleadingPt' | 'leadingEta' | 'deltaPhi' | 'deltaEta' | 'sumPt';

export const VARIABLES: readonly Variable[] = ['mass', 'leadingPt', 'subleadingPt', 'leadingEta', 'deltaPhi', 'deltaEta', 'sumPt'];

/** Suggested number of bins: fine for the mass, where peaks are narrow, coarse for kinematic shapes. */
export function defaultBins(variable: Variable): number {
  return variable === 'mass' ? 200 : 50;
}

/** Suggested plotting range for a variable given the channel's mass spec. */
export function defaultRange(variable: Variable, massMin: number, massMax: number): { min: number; max: number } {
  switch (variable) {
    case 'mass':
      return { min: massMin, max: massMax };
    case 'leadingPt':
    case 'subleadingPt':
      return { min: 0, max: Math.min(200, massMax) };
    case 'sumPt':
      return { min: 0, max: Math.min(300, 2 * massMax) };
    case 'leadingEta':
      return { min: -2.5, max: 2.5 };
    case 'deltaPhi':
      return { min: 0, max: Math.PI };
    case 'deltaEta':
      return { min: 0, max: 5 };
  }
}

/** Value of the variable for record i, reading the store's columns directly. */
export function variableValue(store: EventStore, i: number, variable: Variable): number {
  const c = store.columns;
  if (variable === 'mass') return c.mass[i]!;
  const n = c.nParticles[i]!;
  const base = i * MAX_PARTICLES;
  if (n === 0) return NaN;
  // Find leading and subleading particles.
  let lead = -1;
  let sub = -1;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const j = base + k;
    const pt = c.pt[j]!;
    sum += pt;
    if (lead < 0 || pt > c.pt[lead]!) {
      sub = lead;
      lead = j;
    } else if (sub < 0 || pt > c.pt[sub]!) {
      sub = j;
    }
  }
  switch (variable) {
    case 'leadingPt':
      return c.pt[lead]!;
    case 'subleadingPt':
      return sub >= 0 ? c.pt[sub]! : NaN;
    case 'leadingEta':
      return c.eta[lead]!;
    case 'sumPt':
      return sum;
    case 'deltaPhi': {
      if (sub < 0) return NaN;
      let d = Math.abs(c.phi[lead]! - c.phi[sub]!);
      if (d > Math.PI) d = 2 * Math.PI - d;
      return d;
    }
    case 'deltaEta':
      return sub >= 0 ? Math.abs(c.eta[lead]! - c.eta[sub]!) : NaN;
    default:
      return NaN;
  }
}
