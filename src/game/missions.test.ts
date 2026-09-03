import { describe, expect, it } from 'vitest';
import { defaultSelection } from '../physics/analysis/selection';
import type { CatalogEntry } from '../ui/analysis/catalog';
import {
  LEVEL_REWARD,
  MISSIONS,
  RANKS,
  evaluateMissions,
  maxReputation,
  rankFor,
  rankGain,
  rankUnlockingChannel,
  rankUnlockingClaims,
  reputationOf,
  type MissionContext,
} from './missions';

function entry(overrides: Partial<CatalogEntry>): CatalogEntry {
  return {
    id: `${Math.random()}`,
    name: 'X',
    channel: 'mumu',
    massGeV: 91.2,
    massErrorGeV: 0.05,
    widthGeV: null,
    sqrtSGeV: 13000,
    matchedId: null,
    date: '2026-09-04',
    ...overrides,
  };
}

function ctx(overrides: Partial<MissionContext> = {}): MissionContext {
  return { catalog: [], completedLevels: new Set(), falseClaims: 0, ...overrides };
}

describe('ranks', () => {
  it('rise monotonically in reputation and perks', () => {
    for (let i = 1; i < RANKS.length; i++) {
      const a = RANKS[i - 1]!.perks;
      const b = RANKS[i]!.perks;
      expect(RANKS[i]!.minReputation).toBeGreaterThan(RANKS[i - 1]!.minReputation);
      expect(b.maxEnergyGeV).toBeGreaterThanOrEqual(a.maxEnergyGeV);
      expect(b.maxBunches).toBeGreaterThanOrEqual(a.maxBunches);
      expect(b.maxTimeSpeed).toBeGreaterThanOrEqual(a.maxTimeSpeed);
      for (const c of a.channels) expect(b.channels).toContain(c);
      if (a.claims) expect(b.claims).toBe(true);
    }
  });

  it('is reachable: the top rank costs less than everything the programme offers', () => {
    expect(RANKS[RANKS.length - 1]!.minReputation).toBeLessThanOrEqual(maxReputation());
    // The tutorial alone lifts the intern to the next rank.
    expect(rankFor(8 * LEVEL_REWARD).id).toBe('phd');
    expect(rankFor(0).id).toBe('intern');
    expect(rankFor(10_000).id).toBe('laureate');
  });

  it('opens claims and channels at known ranks', () => {
    expect(rankUnlockingChannel('mumu').id).toBe('intern');
    expect(rankUnlockingChannel('gammagamma').id).toBe('phd');
    expect(rankUnlockingChannel('fourlepton').id).toBe('postdoc');
    expect(rankUnlockingClaims().id).toBe('postdoc');
    expect(rankGain(RANKS[2]!)).toMatchObject({ channels: ['fourlepton'], claims: true });
  });
});

describe('missions', () => {
  it('have unique ids and a rank requirement only for tools that are gated', () => {
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
    for (const m of MISSIONS) if (m.id.startsWith('hidden')) expect(m.requiresRank).toBe('postdoc');
  });

  it('count a recorded Z and its precision', () => {
    const rough = ctx({ catalog: [entry({ matchedId: 'z', massErrorGeV: 0.4 })] });
    expect(evaluateMissions(rough)).toEqual(['record-z']);
    const precise = ctx({ catalog: [entry({ matchedId: 'z', massErrorGeV: 0.08, widthGeV: 2.9 })] });
    expect(evaluateMissions(precise)).toEqual(expect.arrayContaining(['record-z', 'z-mass-precise', 'z-width']));
    // A biased mass does not count as precise, however small the error.
    const biased = ctx({ catalog: [entry({ matchedId: 'z', massGeV: 92.5, massErrorGeV: 0.01 })] });
    expect(evaluateMissions(biased)).not.toContain('z-mass-precise');
  });

  it('track the hidden particles through confirmed claims', () => {
    const claim = (hiddenIndex: number) =>
      entry({
        massGeV: 800,
        claim: { status: 'confirmed', sigmaGeV: 10, localSignificance: 6, globalSignificance: 5.2, fillAtClaim: 3, luminosityAtClaimM2: 1e42, selection: defaultSelection('s', 's', 3), hiddenIndex },
      });
    const one = ctx({ catalog: [claim(1)] });
    expect(evaluateMissions(one)).toEqual(expect.arrayContaining(['first-claim', 'hidden-first']));
    expect(evaluateMissions(one)).not.toContain('hidden-all');
    const both = ctx({ catalog: [claim(1), claim(2)] });
    expect(evaluateMissions(both)).toContain('hidden-all');
  });

  it('sum reputation from levels and missions, never below zero', () => {
    expect(reputationOf({ completedLevels: new Set(['first-beam', 'ramp', 'bogus']), completedMissions: ['record-z'] })).toBe(2 * LEVEL_REWARD + 10);
    expect(reputationOf({ completedLevels: new Set(), completedMissions: ['false-alarm'] })).toBe(0);
  });
});
