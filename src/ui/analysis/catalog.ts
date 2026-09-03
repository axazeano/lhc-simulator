import type { Selection } from '../../physics/analysis/selection';
import type { Channel } from '../../physics/collision/channels';

/** A candidate the player recorded, possibly claimed as a discovery. */
export interface CatalogEntry {
  id: string;
  name: string;
  channel: Channel;
  massGeV: number;
  massErrorGeV: number;
  widthGeV: number | null;
  sqrtSGeV: number;
  matchedId: string | null;
  date: string;
  /** Discovery claim state; absent for a plain record. */
  claim?: {
    status: 'claimed' | 'confirmed' | 'refuted';
    sigmaGeV: number;
    localSignificance: number;
    globalSignificance: number;
    fillAtClaim: number;
    luminosityAtClaimM2: number;
    selection: Selection;
    /** Significance in the data taken after the claim, updated as it accumulates. */
    confirmationSignificance?: number;
    /** Hidden particle index revealed by a confirmed claim. */
    hiddenIndex?: number;
  };
}

const CATALOG_KEY = 'lhc-simulator.catalog';

export function loadCatalog(): CatalogEntry[] {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    return raw ? (JSON.parse(raw) as CatalogEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveCatalog(entries: CatalogEntry[]): void {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export const PARTICLE_LABELS: Record<string, string> = {
  jpsi: 'J/ψ',
  upsilon1s: 'Υ(1S)',
  upsilon2s: 'Υ(2S)',
  upsilon3s: 'Υ(3S)',
  z: 'Z',
  w: 'W',
  higgs: 'H',
  muon: 'μ',
};
