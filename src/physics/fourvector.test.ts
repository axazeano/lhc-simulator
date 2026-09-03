import { describe, expect, it } from 'vitest';
import {
  add,
  boost,
  boostToFrameOf,
  fromPtEtaPhiM,
  fromPtRapidityPhiM,
  invariantMass,
  pseudorapidity,
  rapidity,
  transverseMomentum,
} from './fourvector';

describe('four-vectors', () => {
  it('builds a vector with the requested pT, η and mass', () => {
    const v = fromPtEtaPhiM(30, 1.2, 0.4, 0.1057);
    expect(transverseMomentum(v)).toBeCloseTo(30, 9);
    expect(pseudorapidity(v)).toBeCloseTo(1.2, 9);
    expect(invariantMass(v)).toBeCloseTo(0.1057, 6);
  });

  it('builds a vector with the requested rapidity', () => {
    const v = fromPtRapidityPhiM(15, -0.8, 1, 91.19);
    expect(rapidity(v)).toBeCloseTo(-0.8, 9);
    expect(invariantMass(v)).toBeCloseTo(91.19, 6);
  });

  it('a boost preserves the invariant mass', () => {
    const rest = { e: 91.19, px: 0, py: 0, pz: 0 };
    const moving = boost(rest, 0.3, -0.2, 0.9);
    expect(invariantMass(moving)).toBeCloseTo(91.19, 6);
    expect(moving.e).toBeGreaterThan(91.19);
  });

  it('boosting a particle at rest into a parent frame gives the parent', () => {
    const parent = fromPtRapidityPhiM(40, 1.5, 2, 91.19);
    const moved = boostToFrameOf({ e: 91.19, px: 0, py: 0, pz: 0 }, parent);
    expect(moved.e).toBeCloseTo(parent.e, 6);
    expect(moved.px).toBeCloseTo(parent.px, 6);
    expect(moved.py).toBeCloseTo(parent.py, 6);
    expect(moved.pz).toBeCloseTo(parent.pz, 6);
  });

  it('adds four-vectors component-wise', () => {
    expect(add({ e: 1, px: 2, py: 3, pz: 4 }, { e: 1, px: 1, py: 1, pz: 1 })).toEqual({ e: 2, px: 3, py: 4, pz: 5 });
  });
});
