import { describe, expect, it } from 'vitest';
import { LHC } from '../../data/lhc';
import { momentumFromEnergy } from './kinematics';
import { fieldForMomentum, magneticRigidity, momentumForField } from './rigidity';

describe('magnetic rigidity', () => {
  it('Bρ for 1 GeV/c is 3.3356 T·m', () => {
    expect(magneticRigidity(1)).toBeCloseTo(3.3356, 3);
  });

  it('the LHC needs about 8.33 T to hold 7 TeV protons on its 2804 m bending radius', () => {
    const field = fieldForMomentum(momentumFromEnergy(7000), LHC.bendingRadiusM);
    expect(field).toBeCloseTo(LHC.nominalDipoleFieldT, 1);
  });

  it('injection at 450 GeV needs about 0.54 T', () => {
    const field = fieldForMomentum(momentumFromEnergy(450), LHC.bendingRadiusM);
    expect(field).toBeCloseTo(0.535, 2);
  });

  it('round-trips momentum and field', () => {
    const p = 1234.5;
    const field = fieldForMomentum(p, LHC.bendingRadiusM);
    expect(momentumForField(field, LHC.bendingRadiusM)).toBeCloseTo(p, 9);
  });
});
