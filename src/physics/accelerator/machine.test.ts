import { describe, expect, it } from 'vitest';
import {
  LHC_MACHINE_CONFIG,
  advance,
  createMachine,
  dump,
  inject,
  readouts,
  requiredFieldT,
  setFieldMode,
  setManualField,
  setTargetEnergy,
  type MachineState,
} from './machine';

function runFor(state: MachineState, seconds: number, step = 1): MachineState {
  let s = state;
  for (let t = 0; t < seconds; t += step) s = advance(s, step);
  return s;
}

describe('accelerator state machine', () => {
  it('starts empty with the field matched to injection', () => {
    const m = createMachine();
    expect(m.status).toBe('empty');
    expect(m.fieldT).toBeCloseTo(requiredFieldT(450, LHC_MACHINE_CONFIG), 9);
    expect(readouts(m)).toBeNull();
  });

  it('does not advance while empty', () => {
    const m = createMachine();
    expect(advance(m, 10)).toBe(m);
  });

  it('injects at 450 GeV and stays there in auto mode', () => {
    const m = runFor(inject(createMachine()), 60);
    expect(m.status).toBe('injected');
    expect(m.energyGeV).toBe(450);
    expect(m.beamTimeS).toBe(60);
  });

  it('ramps to 7 TeV in auto mode and arrives with about 8.33 T', () => {
    let m = setTargetEnergy(inject(createMachine()), 7000);
    m = advance(m, 1);
    expect(m.status).toBe('ramping');
    // The ramp starts slowly: 0.3 % of 450 GeV per second.
    expect(m.energyGeV).toBeCloseTo(450 * (1 + LHC_MACHINE_CONFIG.maxRelativeRampRatePerS), 9);
    m = runFor(m, 2000);
    expect(m.status).toBe('stable');
    expect(m.energyGeV).toBe(7000);
    expect(m.fieldT).toBeCloseTo(8.33, 1);
  });

  it('the whole ramp takes roughly the real 20 to 25 minutes', () => {
    let m = setTargetEnergy(inject(createMachine()), 6500);
    let seconds = 0;
    while (m.status === 'ramping' || m.status === 'injected') {
      m = advance(m, 1);
      seconds += 1;
      if (seconds > 10000) break;
    }
    expect(m.status).toBe('stable');
    expect(seconds).toBeGreaterThan(15 * 60);
    expect(seconds).toBeLessThan(30 * 60);
  });

  it('clamps the target energy to the machine range', () => {
    expect(setTargetEnergy(createMachine(), 100).targetEnergyGeV).toBe(450);
    expect(setTargetEnergy(createMachine(), 99999).targetEnergyGeV).toBe(7000);
  });

  it('loses the beam when the field is left at injection during a ramp', () => {
    let m = setFieldMode(inject(createMachine()), 'manual');
    expect(m.status).toBe('injected');
    m = setTargetEnergy(m, 7000);
    m = runFor(m, 60);
    expect(m.status).toBe('lost');
    // Once lost, time stops for the beam.
    expect(advance(m, 10)).toBe(m);
  });

  it('survives a manual ramp if the operator tracks the field', () => {
    let m = setFieldMode(setTargetEnergy(inject(createMachine()), 7000), 'manual');
    for (let t = 0; t < 2000; t += 1) {
      m = advance(m, 1);
      m = setManualField(m, requiredFieldT(m.energyGeV, LHC_MACHINE_CONFIG));
    }
    expect(m.status).toBe('stable');
    expect(m.energyGeV).toBe(7000);
  });

  it('loses the beam immediately if injected into a badly set manual field', () => {
    let m = setFieldMode(createMachine(), 'manual');
    m = setManualField(m, 2);
    m = inject(m);
    expect(m.status).toBe('lost');
  });

  it('dump keeps the operator settings but empties the ring', () => {
    let m = setTargetEnergy(inject(createMachine()), 6500);
    m = dump(m);
    expect(m.status).toBe('empty');
    expect(m.energyGeV).toBe(0);
    expect(m.targetEnergyGeV).toBe(6500);
  });

  it('readouts show the fixed-target penalty next to the collider energy', () => {
    const m = runFor(setTargetEnergy(inject(createMachine()), 7000), 2000);
    const r = readouts(m);
    expect(r).not.toBeNull();
    expect(r!.sqrtSColliderGeV).toBeCloseTo(14000, 2);
    expect(r!.sqrtSFixedTargetGeV).toBeLessThan(120);
    expect(r!.fieldMismatch).toBeCloseTo(0, 9);
    expect(r!.luminosityCm2S).toBeGreaterThan(0.8e34);
  });
});
