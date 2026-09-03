import { Random } from '../random';
import { PROCESSES, SQRT_S_TABLE_GEV, type FinalState, type ProcessDefinition } from './processes';

/**
 * Hidden particles: resonances the game invents for each player, unknown to the particle
 * table. They are drawn from a seed stored in the browser, so a player's universe stays the
 * same between sessions. Nothing about them is revealed through process ids or the UI until
 * a confirmed discovery.
 */

export interface HiddenParticle {
  id: string;
  /** Sequential number shown after discovery. */
  index: number;
  massGeV: number;
  widthGeV: number;
  channel: FinalState;
  /** σ·BR into the channel at 13 TeV, in nb. */
  crossSectionNbAt13TeV: number;
}

/** Number of hidden particles in every universe. */
export const HIDDEN_COUNT = 2;

/**
 * Energy dependence of a heavy resonance's production: the Z-like parton-luminosity growth
 * with an extra factor that switches the process off as √s approaches the mass, mimicking the
 * steep fall of the parton luminosity near threshold.
 */
export function heavyResonanceShape(massGeV: number, sqrtSGeV: number, zShapeAt: (sqrtS: number) => number): number {
  const x = massGeV / sqrtSGeV;
  if (x >= 1) return 0;
  return zShapeAt(sqrtSGeV) * (1 - x) ** 6;
}

function zShape(): (sqrtS: number) => number {
  const z = PROCESSES.find((p) => p.id === 'z_mumu')!;
  const at13 = z.crossSectionNb[SQRT_S_TABLE_GEV.indexOf(13000)]!;
  return (sqrtS) => {
    const i = SQRT_S_TABLE_GEV.indexOf(sqrtS);
    return i >= 0 ? z.crossSectionNb[i]! / at13 : 1;
  };
}

/** Draw a universe's hidden particles from a seed. Deterministic. */
export function generateHiddenParticles(seed: number): HiddenParticle[] {
  const rng = new Random((seed ^ 0x5eed1234) >>> 0);
  const particles: HiddenParticle[] = [];
  // 1. A heavy neutral resonance decaying to muon pairs, well above the Z: reachable only with
  //    energy and tens of fb⁻¹. Rates of a few to a dozen fb make it a real search.
  const heavyMass = Math.round(rng.uniform(300, 1500) / 5) * 5;
  particles.push({
    id: 'hidden-1',
    index: 1,
    massGeV: heavyMass,
    widthGeV: heavyMass * rng.uniform(0.01, 0.03),
    channel: 'mumu',
    crossSectionNbAt13TeV: rng.uniform(4e-6, 1.5e-5),
  });
  // 2. A light narrow state buried in the low-mass continuum, in muon pairs or photon pairs:
  //    plenty of events, but a signal of well under a per cent of the background.
  const lightChannel: FinalState = rng.next() < 0.6 ? 'mumu' : 'gammagamma';
  const lightMass = lightChannel === 'mumu' ? Math.round(rng.uniform(14, 70) * 2) / 2 : Math.round(rng.uniform(90, 180) * 2) / 2;
  particles.push({
    id: 'hidden-2',
    index: 2,
    massGeV: lightMass,
    widthGeV: lightMass * rng.uniform(0.002, 0.006),
    channel: lightChannel,
    crossSectionNbAt13TeV: lightChannel === 'mumu' ? rng.uniform(1e-3, 4e-3) : rng.uniform(2e-5, 6e-5),
  });
  return particles;
}

/** The process definition the simulation runs for a hidden particle. */
export function hiddenProcess(particle: HiddenParticle): ProcessDefinition {
  const shape = zShape();
  const crossSectionNb = SQRT_S_TABLE_GEV.map(
    (sqrtS) => (particle.crossSectionNbAt13TeV * heavyResonanceShape(particle.massGeV, sqrtS, shape)) / heavyResonanceShape(particle.massGeV, 13000, shape),
  ).map((v) => (Number.isFinite(v) ? v : 0));
  return {
    id: particle.id,
    kind: 'resonance',
    hidden: true,
    massGeV: particle.massGeV,
    widthGeV: particle.widthGeV,
    finalState: particle.channel,
    crossSectionNb,
    source: 'Invented for this universe.',
  };
}

const UNIVERSE_KEY = 'lhc-simulator.universe';

/** The player's universe seed, created once and kept in the browser. */
export function loadUniverseSeed(): number {
  try {
    const raw = localStorage.getItem(UNIVERSE_KEY);
    if (raw && /^\d+$/.test(raw)) return Number(raw);
    const seed = Math.floor(Math.random() * 2 ** 31);
    localStorage.setItem(UNIVERSE_KEY, String(seed));
    return seed;
  } catch {
    return 42;
  }
}

export function resetUniverseSeed(): number {
  const seed = Math.floor(Math.random() * 2 ** 31);
  try {
    localStorage.setItem(UNIVERSE_KEY, String(seed));
  } catch {
    // ignore
  }
  return seed;
}
