import { PARTICLES } from '../data/particles';
import type { Channel } from '../physics/collision/channels';
import { HIDDEN_COUNT } from '../physics/collision/hidden';
import { LEVELS } from '../tutorial/levels';
import type { CatalogEntry } from '../ui/analysis/catalog';

/**
 * The research programme: missions with a checkable condition, reputation points for each,
 * and ranks that open more of the machine and of the analysis tools.
 *
 * Missions are checked against the player's catalog (recorded passports and claims) and the
 * tutorial progress, so a mission is done only by doing the analysis: fit, response, comparison,
 * record. Completed missions are remembered, so deleting a catalog entry later does not undo them.
 */

export type RankId = 'intern' | 'phd' | 'postdoc' | 'professor' | 'laureate';

export interface Perks {
  /** Highest beam energy the sandbox allows, in GeV per beam. */
  maxEnergyGeV: number;
  maxBunches: number;
  /** Fastest time-speed option, in game seconds per real second. */
  maxTimeSpeed: number;
  channels: readonly Channel[];
  /** Whether discovery claims can be made. */
  claims: boolean;
}

export interface Rank {
  id: RankId;
  minReputation: number;
  perks: Perks;
}

export const RANKS: readonly Rank[] = [
  {
    id: 'intern',
    minReputation: 0,
    perks: { maxEnergyGeV: 3500, maxBunches: 500, maxTimeSpeed: 600, channels: ['mumu'], claims: false },
  },
  {
    id: 'phd',
    minReputation: 40,
    perks: { maxEnergyGeV: 6500, maxBunches: 1380, maxTimeSpeed: 3600, channels: ['mumu', 'gammagamma'], claims: false },
  },
  {
    id: 'postdoc',
    minReputation: 100,
    perks: { maxEnergyGeV: 7000, maxBunches: 2808, maxTimeSpeed: 86400, channels: ['mumu', 'gammagamma', 'fourlepton'], claims: true },
  },
  {
    id: 'professor',
    minReputation: 200,
    perks: { maxEnergyGeV: 7000, maxBunches: 2808, maxTimeSpeed: 30 * 86400, channels: ['mumu', 'gammagamma', 'fourlepton'], claims: true },
  },
  {
    id: 'laureate',
    minReputation: 320,
    perks: { maxEnergyGeV: 7000, maxBunches: 2808, maxTimeSpeed: 30 * 86400, channels: ['mumu', 'gammagamma', 'fourlepton'], claims: true },
  },
];

/** Reputation for each completed tutorial level. */
export const LEVEL_REWARD = 5;

export interface MissionContext {
  catalog: CatalogEntry[];
  completedLevels: ReadonlySet<string>;
  /** Claims that were refuted on later data. */
  falseClaims: number;
}

export type Tier = 1 | 2 | 3 | 4;

export interface Mission {
  id: string;
  tier: Tier;
  /** Reputation points; negative for a penalty. */
  reward: number;
  /** Rank whose perks are needed to attempt the mission, if any. */
  requiresRank?: RankId;
  test(ctx: MissionContext): boolean;
  /** Optional progress text such as "2 / 3". */
  progress?(ctx: MissionContext): string | null;
}

const Z_MASS = PARTICLES.z.massGeV;
const Z_WIDTH = PARTICLES.z.widthGeV;
const JPSI_MASS = PARTICLES.jpsi.massGeV;

function entries(ctx: MissionContext, id: string, channel?: Channel): CatalogEntry[] {
  return ctx.catalog.filter((e) => e.matchedId === id && (!channel || e.channel === channel));
}

function bestMassError(ctx: MissionContext, id: string, maxOffsetGeV: number, mass: number): number {
  let best = Infinity;
  for (const e of entries(ctx, id)) {
    if (Math.abs(e.massGeV - mass) <= maxOffsetGeV && e.massErrorGeV < best) best = e.massErrorGeV;
  }
  return best;
}

function confirmedHidden(ctx: MissionContext): Set<number> {
  const found = new Set<number>();
  for (const e of ctx.catalog) {
    if (e.claim?.status === 'confirmed' && e.claim.hiddenIndex !== undefined) found.add(e.claim.hiddenIndex);
  }
  return found;
}

const fmt = (x: number, digits: number) => (Number.isFinite(x) ? x.toFixed(digits) : '—');

export const MISSIONS: readonly Mission[] = [
  // Tier 1: first peaks. Record a known particle: fit, response, comparison, catalog.
  { id: 'record-jpsi', tier: 1, reward: 10, test: (c) => entries(c, 'jpsi').length > 0 },
  { id: 'record-upsilon', tier: 1, reward: 10, test: (c) => entries(c, 'upsilon1s').length > 0 },
  { id: 'record-z', tier: 1, reward: 10, test: (c) => entries(c, 'z').length > 0 },

  // Tier 2: precision. The same particles, but measured well.
  {
    id: 'jpsi-precise',
    tier: 2,
    reward: 15,
    test: (c) => bestMassError(c, 'jpsi', 0.02, JPSI_MASS) <= 0.005,
    progress: (c) => `${fmt(bestMassError(c, 'jpsi', 0.02, JPSI_MASS) * 1000, 1)} / 5 MeV`,
  },
  {
    id: 'z-mass-precise',
    tier: 2,
    reward: 20,
    test: (c) => bestMassError(c, 'z', 0.3, Z_MASS) <= 0.1,
    progress: (c) => `${fmt(bestMassError(c, 'z', 0.3, Z_MASS), 2)} / 0.10 GeV`,
  },
  {
    id: 'z-width',
    tier: 2,
    reward: 20,
    test: (c) => entries(c, 'z').some((e) => e.widthGeV !== null && e.widthGeV >= 0.6 * Z_WIDTH && e.widthGeV <= 1.5 * Z_WIDTH),
  },
  {
    id: 'upsilon-family',
    tier: 2,
    reward: 25,
    test: (c) => ['upsilon1s', 'upsilon2s', 'upsilon3s'].every((id) => entries(c, id).length > 0),
    progress: (c) => `${['upsilon1s', 'upsilon2s', 'upsilon3s'].filter((id) => entries(c, id).length > 0).length} / 3`,
  },

  // Tier 3: the Higgs boson in two channels.
  { id: 'higgs-gammagamma', tier: 3, reward: 30, requiresRank: 'phd', test: (c) => entries(c, 'higgs', 'gammagamma').length > 0 },
  { id: 'higgs-fourlepton', tier: 3, reward: 30, requiresRank: 'postdoc', test: (c) => entries(c, 'higgs', 'fourlepton').length > 0 },
  {
    id: 'higgs-consistent',
    tier: 3,
    reward: 20,
    requiresRank: 'postdoc',
    test: (c) => {
      const gg = entries(c, 'higgs', 'gammagamma');
      const fl = entries(c, 'higgs', 'fourlepton');
      return gg.some((a) => fl.some((b) => Math.abs(a.massGeV - b.massGeV) <= Math.max(3, 2 * Math.hypot(a.massErrorGeV, b.massErrorGeV))));
    },
  },

  // Tier 4: new physics. Claims and the hidden particles of this universe.
  { id: 'first-claim', tier: 4, reward: 15, requiresRank: 'postdoc', test: (c) => c.catalog.some((e) => e.claim !== undefined) },
  {
    id: 'hidden-first',
    tier: 4,
    reward: 60,
    requiresRank: 'postdoc',
    test: (c) => confirmedHidden(c).size >= 1,
  },
  {
    id: 'hidden-all',
    tier: 4,
    reward: 80,
    requiresRank: 'postdoc',
    test: (c) => confirmedHidden(c).size >= HIDDEN_COUNT,
    progress: (c) => `${confirmedHidden(c).size} / ${HIDDEN_COUNT}`,
  },
  // A penalty, once: a claim that later data refuted.
  { id: 'false-alarm', tier: 4, reward: -15, test: (c) => c.falseClaims > 0 },
];

export function missionById(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

/** Missions whose condition holds now. */
export function evaluateMissions(ctx: MissionContext): string[] {
  return MISSIONS.filter((m) => m.test(ctx)).map((m) => m.id);
}

export interface ReputationSource {
  completedLevels: ReadonlySet<string>;
  completedMissions: readonly string[];
}

export function reputationOf(source: ReputationSource): number {
  const levelIds = new Set(LEVELS.map((l) => l.id));
  let total = 0;
  for (const id of source.completedLevels) if (levelIds.has(id)) total += LEVEL_REWARD;
  for (const id of source.completedMissions) total += missionById(id)?.reward ?? 0;
  return Math.max(0, total);
}

/** The highest possible reputation: every level and every positive mission. */
export function maxReputation(): number {
  return LEVELS.length * LEVEL_REWARD + MISSIONS.filter((m) => m.reward > 0).reduce((s, m) => s + m.reward, 0);
}

export function rankFor(reputation: number): Rank {
  let current = RANKS[0]!;
  for (const rank of RANKS) if (reputation >= rank.minReputation) current = rank;
  return current;
}

export function rankById(id: RankId): Rank {
  return RANKS.find((r) => r.id === id) ?? RANKS[0]!;
}

export function nextRank(rank: Rank): Rank | null {
  const i = RANKS.indexOf(rank);
  return RANKS[i + 1] ?? null;
}

export function rankIndex(id: RankId): number {
  return RANKS.findIndex((r) => r.id === id);
}

/** The first rank whose perks include the channel. */
export function rankUnlockingChannel(channel: Channel): Rank {
  return RANKS.find((r) => r.perks.channels.includes(channel)) ?? RANKS[RANKS.length - 1]!;
}

export function rankUnlockingClaims(): Rank {
  return RANKS.find((r) => r.perks.claims) ?? RANKS[RANKS.length - 1]!;
}

/** What a rank adds compared with the one before it, for the rank-up message and the table. */
export interface RankGain {
  energy: boolean;
  bunches: boolean;
  timeSpeed: boolean;
  channels: Channel[];
  claims: boolean;
}

export function rankGain(rank: Rank): RankGain {
  const i = RANKS.indexOf(rank);
  const prev = RANKS[i - 1];
  if (!prev) return { energy: true, bunches: true, timeSpeed: true, channels: [...rank.perks.channels], claims: rank.perks.claims };
  return {
    energy: rank.perks.maxEnergyGeV > prev.perks.maxEnergyGeV,
    bunches: rank.perks.maxBunches > prev.perks.maxBunches,
    timeSpeed: rank.perks.maxTimeSpeed > prev.perks.maxTimeSpeed,
    channels: rank.perks.channels.filter((c) => !prev.perks.channels.includes(c)),
    claims: rank.perks.claims && !prev.perks.claims,
  };
}
