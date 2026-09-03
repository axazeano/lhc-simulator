import { LHC } from '../../data/lhc';
import { PROTON_MASS_GEV } from '../constants';
import {
  centerOfMassEnergyCollider,
  centerOfMassEnergyFixedTarget,
  lorentzBeta,
  lorentzGamma,
  momentumFromEnergy,
} from './kinematics';
import { type BeamParameters, luminosityCm2S } from './luminosity';
import { closedOrbitOffset, isBeamLost, momentumDeviation } from './orbit';
import { fieldForMomentum, momentumForField } from './rigidity';

/**
 * The accelerator as a small state machine. Pure functions: every action returns a new state.
 * Time is "game time" in seconds; the caller decides how fast it flows.
 */

export type MachineStatus = 'empty' | 'injected' | 'ramping' | 'stable' | 'lost';
export type FieldMode = 'auto' | 'manual';

export interface MachineConfig {
  bendingRadiusM: number;
  injectionEnergyGeV: number;
  maxEnergyGeV: number;
  rampRateGeVPerS: number;
  /** The ramp never changes the energy faster than this fraction of the current energy per second. */
  maxRelativeRampRatePerS: number;
  dispersionM: number;
  apertureHalfWidthM: number;
  revolutionFrequencyHz: number;
  /** Maximum field the dipoles can physically reach, used to clamp the manual knob. */
  maxFieldT: number;
}

export interface MachineState {
  status: MachineStatus;
  /** Beam energy in GeV; 0 when the ring is empty. */
  energyGeV: number;
  targetEnergyGeV: number;
  fieldMode: FieldMode;
  /** Field the player dialled in; only used in manual mode. */
  manualFieldT: number;
  /** Field actually applied to the dipoles. */
  fieldT: number;
  /** Game time since injection, in seconds. */
  beamTimeS: number;
}

export const LHC_MACHINE_CONFIG: MachineConfig = {
  bendingRadiusM: LHC.bendingRadiusM,
  injectionEnergyGeV: LHC.injectionEnergyGeV,
  maxEnergyGeV: LHC.nominalEnergyGeV,
  rampRateGeVPerS: LHC.rampRateGeVPerS,
  maxRelativeRampRatePerS: LHC.maxRelativeRampRatePerS,
  dispersionM: LHC.arcDispersionM,
  apertureHalfWidthM: LHC.apertureHalfWidthM,
  revolutionFrequencyHz: LHC.revolutionFrequencyHz,
  maxFieldT: 9,
};

export const LHC_DESIGN_BEAM: BeamParameters = {
  protonsPerBunch: LHC.designProtonsPerBunch,
  bunches: LHC.maxBunches,
  normalizedEmittanceM: LHC.normalizedEmittanceM,
  betaStarM: LHC.designBetaStarM,
  crossingFactor: LHC.crossingAngleFactor,
};

/** Dipole field that keeps a beam of the given energy on the design orbit. */
export function requiredFieldT(energyGeV: number, config: MachineConfig): number {
  return fieldForMomentum(momentumFromEnergy(energyGeV), config.bendingRadiusM);
}

export function createMachine(config: MachineConfig = LHC_MACHINE_CONFIG): MachineState {
  return {
    status: 'empty',
    energyGeV: 0,
    targetEnergyGeV: config.injectionEnergyGeV,
    fieldMode: 'auto',
    manualFieldT: requiredFieldT(config.injectionEnergyGeV, config),
    fieldT: requiredFieldT(config.injectionEnergyGeV, config),
    beamTimeS: 0,
  };
}

function appliedField(state: MachineState, energyGeV: number, config: MachineConfig): number {
  return state.fieldMode === 'auto' ? requiredFieldT(energyGeV, config) : state.manualFieldT;
}

function orbitOffsetM(energyGeV: number, fieldT: number, config: MachineConfig): number {
  const momentum = momentumFromEnergy(energyGeV);
  const matched = momentumForField(fieldT, config.bendingRadiusM);
  return closedOrbitOffset(momentumDeviation(momentum, matched), config.dispersionM);
}

function statusFor(state: MachineState, energyGeV: number, fieldT: number, config: MachineConfig): MachineStatus {
  if (isBeamLost(orbitOffsetM(energyGeV, fieldT, config), config.apertureHalfWidthM)) return 'lost';
  if (energyGeV !== state.targetEnergyGeV) return 'ramping';
  return energyGeV === config.injectionEnergyGeV ? 'injected' : 'stable';
}

export function inject(state: MachineState, config: MachineConfig = LHC_MACHINE_CONFIG): MachineState {
  if (state.status !== 'empty') return state;
  const energyGeV = config.injectionEnergyGeV;
  const fieldT = appliedField(state, energyGeV, config);
  return { ...state, energyGeV, fieldT, beamTimeS: 0, status: statusFor(state, energyGeV, fieldT, config) };
}

/** Remove the beam but keep the operator's settings. */
export function dump(state: MachineState, config: MachineConfig = LHC_MACHINE_CONFIG): MachineState {
  return {
    ...state,
    status: 'empty',
    energyGeV: 0,
    beamTimeS: 0,
    fieldT: appliedField(state, config.injectionEnergyGeV, config),
  };
}

export function setTargetEnergy(
  state: MachineState,
  energyGeV: number,
  config: MachineConfig = LHC_MACHINE_CONFIG,
): MachineState {
  const clamped = Math.min(config.maxEnergyGeV, Math.max(config.injectionEnergyGeV, energyGeV));
  return { ...state, targetEnergyGeV: clamped };
}

export function setFieldMode(
  state: MachineState,
  fieldMode: FieldMode,
  config: MachineConfig = LHC_MACHINE_CONFIG,
): MachineState {
  // Switching to manual starts from the field that is currently applied, so the beam survives the switch.
  const manualFieldT = fieldMode === 'manual' && state.fieldMode === 'auto' ? state.fieldT : state.manualFieldT;
  const next = { ...state, fieldMode, manualFieldT };
  return refreshField(next, config);
}

export function setManualField(
  state: MachineState,
  fieldT: number,
  config: MachineConfig = LHC_MACHINE_CONFIG,
): MachineState {
  const manualFieldT = Math.min(config.maxFieldT, Math.max(0, fieldT));
  return refreshField({ ...state, manualFieldT }, config);
}

function refreshField(state: MachineState, config: MachineConfig): MachineState {
  const energyGeV = state.status === 'empty' ? config.injectionEnergyGeV : state.energyGeV;
  const fieldT = appliedField(state, energyGeV, config);
  if (state.status === 'empty' || state.status === 'lost') return { ...state, fieldT };
  return { ...state, fieldT, status: statusFor(state, state.energyGeV, fieldT, config) };
}

function moveToward(value: number, target: number, maxStep: number): number {
  if (Math.abs(target - value) <= maxStep) return target;
  return value + Math.sign(target - value) * maxStep;
}

/** Energy change allowed in dt seconds: the slower of the absolute and the relative rate limit. */
export function rampStepGeV(energyGeV: number, dtSeconds: number, config: MachineConfig): number {
  return Math.min(config.rampRateGeVPerS, config.maxRelativeRampRatePerS * energyGeV) * dtSeconds;
}

/** Advance the machine by dt seconds of game time. Returns the same object when nothing can change. */
export function advance(
  state: MachineState,
  dtSeconds: number,
  config: MachineConfig = LHC_MACHINE_CONFIG,
): MachineState {
  if (state.status === 'empty' || state.status === 'lost' || dtSeconds <= 0) return state;
  const energyGeV = moveToward(state.energyGeV, state.targetEnergyGeV, rampStepGeV(state.energyGeV, dtSeconds, config));
  const fieldT = appliedField(state, energyGeV, config);
  return {
    ...state,
    energyGeV,
    fieldT,
    beamTimeS: state.beamTimeS + dtSeconds,
    status: statusFor(state, energyGeV, fieldT, config),
  };
}

/** Derived numbers for the readouts. All computed from the state, never stored. */
export interface MachineReadouts {
  momentumGeV: number;
  gamma: number;
  beta: number;
  requiredFieldT: number;
  fieldT: number;
  /** Relative field mismatch (B − B_required) / B_required. */
  fieldMismatch: number;
  orbitOffsetM: number;
  sqrtSColliderGeV: number;
  sqrtSFixedTargetGeV: number;
  /** Luminosity with the design beam, in cm⁻² s⁻¹. */
  luminosityCm2S: number;
}

export function readouts(state: MachineState, config: MachineConfig = LHC_MACHINE_CONFIG): MachineReadouts | null {
  if (state.status === 'empty') return null;
  const energyGeV = state.energyGeV;
  const required = requiredFieldT(energyGeV, config);
  const gamma = lorentzGamma(energyGeV, PROTON_MASS_GEV);
  const beta = lorentzBeta(energyGeV, PROTON_MASS_GEV);
  return {
    momentumGeV: momentumFromEnergy(energyGeV),
    gamma,
    beta,
    requiredFieldT: required,
    fieldT: state.fieldT,
    fieldMismatch: (state.fieldT - required) / required,
    orbitOffsetM: orbitOffsetM(energyGeV, state.fieldT, config),
    sqrtSColliderGeV: centerOfMassEnergyCollider(energyGeV),
    sqrtSFixedTargetGeV: centerOfMassEnergyFixedTarget(energyGeV),
    luminosityCm2S: luminosityCm2S(LHC_DESIGN_BEAM, config.revolutionFrequencyHz, gamma, beta),
  };
}
