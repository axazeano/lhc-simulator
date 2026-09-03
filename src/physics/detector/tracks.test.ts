import { describe, expect, it } from 'vitest';
import { bendingRadiusM, crossingAtRadius, longitudinalTrack, transverseTrack } from './tracks';

describe('track geometry', () => {
  it('a 1 GeV track bends on 0.88 m in 3.8 T, a 45 GeV track on 39 m', () => {
    expect(bendingRadiusM(1)).toBeCloseTo(0.878, 2);
    expect(bendingRadiusM(45)).toBeCloseTo(39.5, 0);
  });

  it('opposite charges bend to opposite sides; photons go straight', () => {
    const plus = transverseTrack({ kind: 'muon', ptGeV: 5, eta: 0, phi: 0, charge: 1 }, 1);
    const minus = transverseTrack({ kind: 'muon', ptGeV: 5, eta: 0, phi: 0, charge: -1 }, 1);
    const photon = transverseTrack({ kind: 'photon', ptGeV: 50, eta: 0, phi: 0, charge: 0 }, 1);
    const endPlus = plus[plus.length - 1]!;
    const endMinus = minus[minus.length - 1]!;
    expect(Math.sign(endPlus.y)).toBe(-Math.sign(endMinus.y));
    expect(Math.abs(endPlus.y)).toBeGreaterThan(0.05);
    expect(photon[1]!.y).toBeCloseTo(0, 9);
    // The track starts along φ and reaches the requested radius.
    expect(Math.hypot(endPlus.x, endPlus.y)).toBeCloseTo(1, 1);
  });

  it('a soft track spirals and never reaches the outer radius', () => {
    const soft = transverseTrack({ kind: 'muon', ptGeV: 0.3, eta: 0, phi: 1, charge: 1 }, 1.1);
    const end = soft[soft.length - 1]!;
    expect(Math.hypot(end.x, end.y)).toBeLessThan(1.1);
  });

  it('finds the crossing of a track with a layer radius', () => {
    const track = transverseTrack({ kind: 'muon', ptGeV: 20, eta: 0, phi: 0.3, charge: -1 }, 2);
    const hit = crossingAtRadius(track, 1.0);
    expect(hit).not.toBeNull();
    expect(Math.hypot(hit!.x, hit!.y)).toBeCloseTo(1.0, 3);
    expect(crossingAtRadius(track, 5)).toBeNull();
  });

  it('longitudinal track leaves through the barrel or the endcap depending on η', () => {
    const central = longitudinalTrack({ kind: 'muon', ptGeV: 10, eta: 0.2, phi: 0, charge: 1 }, 7, 11);
    expect(central.r).toBeCloseTo(7, 9);
    const forward = longitudinalTrack({ kind: 'muon', ptGeV: 10, eta: 2.4, phi: 0, charge: 1 }, 7, 11);
    expect(forward.z).toBeCloseTo(11, 9);
    expect(forward.r).toBeLessThan(7);
    const backward = longitudinalTrack({ kind: 'muon', ptGeV: 10, eta: -2.4, phi: 0, charge: 1 }, 7, 11);
    expect(backward.z).toBeLessThan(0);
  });
});
