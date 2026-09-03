import { MAX_PARTICLES, type EventStore } from '../collision/eventStore';

/**
 * An analysis selection: the cuts applied offline to the recorded events. Every field is a
 * condition every particle (or the whole event) must satisfy; `null` means no cut.
 */
export interface Selection {
  id: string;
  name: string;
  /** Every particle's pT must be at least this, in GeV. */
  ptMinGeV: number;
  /** Every particle's |η| must be at most this. */
  etaMax: number | null;
  /** Charge requirement on the event: total charge zero (opposite-sign pairs), or same-sign pairs. */
  charge: 'any' | 'opposite' | 'same';
  /** Leading particle pT at least this, in GeV. */
  leadingPtMinGeV: number | null;
  /** Invariant mass window, in GeV. */
  massMinGeV: number | null;
  massMaxGeV: number | null;
  /** Restrict to these data-taking fills; null means all. */
  fills: number[] | null;
}

export function defaultSelection(id: string, name: string, ptMinGeV: number): Selection {
  return { id, name, ptMinGeV, etaMax: null, charge: 'any', leadingPtMinGeV: null, massMinGeV: null, massMaxGeV: null, fills: null };
}

/**
 * Evaluate the selection on every record. Returns a mask of passing records (1) and their
 * total weight, without allocating per-record objects.
 */
export function applySelection(store: EventStore, selection: Selection): { mask: Uint8Array; passed: number; weight: number } {
  const c = store.columns;
  const mask = new Uint8Array(c.count);
  const fills = selection.fills ? new Set(selection.fills) : null;
  let passed = 0;
  let weight = 0;
  for (let i = 0; i < c.count; i++) {
    if (c.minPt[i]! < selection.ptMinGeV) continue;
    const m = c.mass[i]!;
    if (selection.massMinGeV !== null && m < selection.massMinGeV) continue;
    if (selection.massMaxGeV !== null && m >= selection.massMaxGeV) continue;
    if (fills && !fills.has(c.fill[i]!)) continue;
    const n = c.nParticles[i]!;
    const base = i * MAX_PARTICLES;
    if (n > 0 && (selection.etaMax !== null || selection.leadingPtMinGeV !== null || selection.charge !== 'any')) {
      let ok = true;
      let leading = 0;
      let charge = 0;
      for (let k = 0; k < n; k++) {
        const j = base + k;
        if (selection.etaMax !== null && Math.abs(c.eta[j]!) > selection.etaMax) {
          ok = false;
          break;
        }
        if (c.pt[j]! > leading) leading = c.pt[j]!;
        charge += c.charge[j]!;
      }
      if (!ok) continue;
      if (selection.leadingPtMinGeV !== null && leading < selection.leadingPtMinGeV) continue;
      if (selection.charge === 'opposite' && charge !== 0) continue;
      if (selection.charge === 'same' && charge === 0) continue;
    }
    mask[i] = 1;
    passed += 1;
    weight += c.weight[i]!;
  }
  return { mask, passed, weight };
}
