import { describe, expect, it } from 'vitest';
import { LHC_DESIGN_BEAM, createMachine, inject, setTargetEnergy, advance } from '../physics/accelerator';
import { Histogram } from '../physics/analysis/histogram';
import { analyseWindow } from '../physics/analysis/window';
import { LEVELS, SANDBOX, evaluateLevel, isLevelUnlocked, levelById, type Snapshot } from './levels';

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const h = new Histogram({ min: 2, max: 200, bins: 9900 });
  return {
    machine: createMachine(),
    beam: LHC_DESIGN_BEAM,
    luminosityCm2S: null,
    colliding: false,
    run: { integratedLuminosityM2: 0, collisions: 0, visibleByProcess: {}, simulatedEvents: 0, entries: 0 },
    analysis: analyseWindow(h, { minGeV: 3, maxGeV: 3.2 }),
    window: { minGeV: 3, maxGeV: 3.2 },
    cuts: { muonPtMinGeV: 3 },
    quizCorrect: new Set(),
    ...overrides,
  };
}

describe('tutorial levels', () => {
  it('has six levels plus a sandbox, each with texts and a source link', () => {
    expect(LEVELS).toHaveLength(6);
    for (const level of [...LEVELS, SANDBOX]) {
      expect(level.cardHref).toMatch(/^https:\/\//);
      expect(level.titleKey).toContain(level.id);
    }
  });

  it('unlocks levels in order and the sandbox always', () => {
    const none = new Set<string>();
    expect(isLevelUnlocked(LEVELS[0]!, none)).toBe(true);
    expect(isLevelUnlocked(LEVELS[1]!, none)).toBe(false);
    expect(isLevelUnlocked(SANDBOX, none)).toBe(true);
    expect(isLevelUnlocked(LEVELS[1]!, new Set(['first-beam']))).toBe(true);
    expect(isLevelUnlocked(LEVELS[2]!, new Set(['first-beam']))).toBe(false);
  });

  it('first beam: completes after holding the beam ten seconds, fails when lost', () => {
    const level = levelById('first-beam');
    let m = inject(createMachine());
    expect(evaluateLevel(level, snapshot({ machine: m })).completed).toBe(false);
    m = advance(m, 11);
    const done = evaluateLevel(level, snapshot({ machine: m }));
    expect(done.completed).toBe(true);
    expect(done.conditions[1]!.progress).toBe('10 / 10');
    const lost = { ...m, status: 'lost' as const };
    expect(evaluateLevel(level, snapshot({ machine: lost })).failed).toBe(true);
  });

  it('ramp: needs the quiz and 7 TeV', () => {
    const level = levelById('ramp');
    let m = setTargetEnergy(inject(createMachine()), 7000);
    for (let i = 0; i < 3000; i++) m = advance(m, 1);
    expect(evaluateLevel(level, snapshot({ machine: m })).completed).toBe(false);
    expect(evaluateLevel(level, snapshot({ machine: m, quizCorrect: new Set(['field-at-7tev']) })).completed).toBe(true);
  });

  it('first peak: needs the window on the J/psi, 500 signal events and five sigma', () => {
    const level = levelById('first-peak');
    const h = new Histogram({ min: 2, max: 200, bins: 9900 });
    for (let b = h.binOf(2.5); b < h.binOf(4); b++) h.addCounts(b, 10);
    for (let b = h.binOf(3.05); b < h.binOf(3.15); b++) h.addCounts(b, 200);
    const window = { minGeV: 3.0, maxGeV: 3.2 };
    const good = snapshot({ analysis: analyseWindow(h, window), window, quizCorrect: new Set(['peak-mass']) });
    expect(evaluateLevel(level, good).completed).toBe(true);
    const off = { minGeV: 20, maxGeV: 30 };
    expect(evaluateLevel(level, snapshot({ analysis: analyseWindow(h, off), window: off })).completed).toBe(false);
  });

  it('sandbox never completes', () => {
    expect(evaluateLevel(SANDBOX, snapshot()).completed).toBe(false);
  });
});
