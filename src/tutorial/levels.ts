import { PARTICLES } from '../data/particles';
import {
  LHC_DESIGN_BEAM,
  LHC_MACHINE_CONFIG,
  type BeamParameters,
  type FieldMode,
  type MachineState,
} from '../physics/accelerator';
import type { MassWindow, WindowAnalysis } from '../physics/analysis/window';
import type { RunSnapshot } from '../physics/collision/run';
import type { SelectionCuts } from '../physics/detector/detector';

/**
 * Tutorial levels. Each level opens a few controls, sets the machine up, states a goal as a
 * list of conditions, and ends with a card about how it happened in the real LHC.
 */

export interface LevelSetup {
  fieldMode: FieldMode;
  manualFieldT?: number;
  targetEnergyGeV: number;
  timeSpeed: number;
  beam: BeamParameters;
  cuts: SelectionCuts;
  view: MassWindow;
  window: MassWindow;
}

export interface LevelAccess {
  energy: boolean;
  fieldMode: boolean;
  manualField: boolean;
  timeSpeed: boolean;
  beam: boolean;
  ptCut: boolean;
  massWindow: boolean;
}

export interface LevelVisibility {
  readouts: boolean;
  beam: boolean;
  histogram: boolean;
}

export interface QuizQuestion {
  id: string;
  questionKey: string;
  optionKeys: string[];
  correct: number;
}

export interface Snapshot {
  machine: MachineState;
  beam: BeamParameters;
  luminosityCm2S: number | null;
  colliding: boolean;
  run: RunSnapshot;
  analysis: WindowAnalysis;
  window: MassWindow;
  cuts: SelectionCuts;
  quizCorrect: ReadonlySet<string>;
}

export interface Condition {
  key: string;
  test(s: Snapshot): boolean;
  /** Optional progress text, e.g. "234 / 500". */
  progress?(s: Snapshot): string;
}

export interface Level {
  id: string;
  titleKey: string;
  introKey: string;
  goalKey: string;
  hintKey: string;
  cardKey: string;
  cardHref: string;
  setup: LevelSetup;
  access: LevelAccess;
  visible: LevelVisibility;
  quiz: QuizQuestion[];
  conditions: Condition[];
  failure?(s: Snapshot): boolean;
}

const ALL_ACCESS: LevelAccess = {
  energy: true,
  fieldMode: true,
  manualField: true,
  timeSpeed: true,
  beam: true,
  ptCut: true,
  massWindow: true,
};

const NO_ACCESS: LevelAccess = {
  energy: false,
  fieldMode: false,
  manualField: false,
  timeSpeed: false,
  beam: false,
  ptCut: false,
  massWindow: false,
};

const VIEW_ALL: MassWindow = { minGeV: 2, maxGeV: 200 };
const WINDOW_JPSI: MassWindow = { minGeV: 3.0, maxGeV: 3.2 };

const SMALL_BEAM: BeamParameters = { ...LHC_DESIGN_BEAM, bunches: 100, protonsPerBunch: 5e10, betaStarM: 5 };

const BASE_SETUP: LevelSetup = {
  fieldMode: 'auto',
  targetEnergyGeV: LHC_MACHINE_CONFIG.injectionEnergyGeV,
  timeSpeed: 1,
  beam: LHC_DESIGN_BEAM,
  cuts: { muonPtMinGeV: 3 },
  view: VIEW_ALL,
  window: WINDOW_JPSI,
};

const beamPresent = (s: Snapshot) => s.machine.status === 'injected' || s.machine.status === 'stable';
const quiz = (id: string): Condition => ({ key: `quiz.${id}`, test: (s) => s.quizCorrect.has(id) });

function windowCovers(window: MassWindow, mass: number, maxWidth: number): boolean {
  return window.minGeV <= mass - 0.05 && window.maxGeV >= mass + 0.05 && window.maxGeV - window.minGeV <= maxWidth;
}

export const LEVELS: Level[] = [
  {
    id: 'first-beam',
    titleKey: 'level.first-beam.title',
    introKey: 'level.first-beam.intro',
    goalKey: 'level.first-beam.goal',
    hintKey: 'level.first-beam.hint',
    cardKey: 'level.first-beam.card',
    cardHref: 'https://en.wikipedia.org/wiki/Large_Hadron_Collider#Operational_history',
    setup: { ...BASE_SETUP, fieldMode: 'manual', manualFieldT: 2.0 },
    access: { ...NO_ACCESS, manualField: true },
    visible: { readouts: true, beam: false, histogram: false },
    quiz: [],
    conditions: [
      { key: 'cond.injected', test: beamPresent },
      {
        key: 'cond.held10s',
        test: (s) => beamPresent(s) && s.machine.beamTimeS >= 10,
        progress: (s) => `${Math.min(10, Math.floor(beamPresent(s) ? s.machine.beamTimeS : 0))} / 10`,
      },
    ],
    failure: (s) => s.machine.status === 'lost',
  },
  {
    id: 'ramp',
    titleKey: 'level.ramp.title',
    introKey: 'level.ramp.intro',
    goalKey: 'level.ramp.goal',
    hintKey: 'level.ramp.hint',
    cardKey: 'level.ramp.card',
    cardHref: 'https://home.cern/science/engineering/pulling-together-superconducting-electromagnets',
    setup: { ...BASE_SETUP, timeSpeed: 60 },
    access: { ...NO_ACCESS, energy: true, timeSpeed: true },
    visible: { readouts: true, beam: false, histogram: false },
    quiz: [
      {
        id: 'field-at-7tev',
        questionKey: 'quiz.field-at-7tev.q',
        optionKeys: ['quiz.field-at-7tev.a', 'quiz.field-at-7tev.b', 'quiz.field-at-7tev.c', 'quiz.field-at-7tev.d'],
        correct: 2,
      },
    ],
    conditions: [
      quiz('field-at-7tev'),
      {
        key: 'cond.reached7tev',
        test: (s) => s.machine.status === 'stable' && s.machine.energyGeV >= LHC_MACHINE_CONFIG.maxEnergyGeV,
        progress: (s) => `${(s.machine.energyGeV / 1000).toFixed(2)} / 7.00`,
      },
    ],
    failure: (s) => s.machine.status === 'lost',
  },
  {
    id: 'why-collider',
    titleKey: 'level.why-collider.title',
    introKey: 'level.why-collider.intro',
    goalKey: 'level.why-collider.goal',
    hintKey: 'level.why-collider.hint',
    cardKey: 'level.why-collider.card',
    cardHref: 'https://en.wikipedia.org/wiki/Collider',
    setup: { ...BASE_SETUP, targetEnergyGeV: 7000, timeSpeed: 600 },
    access: { ...NO_ACCESS, energy: true, timeSpeed: true },
    visible: { readouts: true, beam: false, histogram: false },
    quiz: [
      {
        id: 'fixed-target',
        questionKey: 'quiz.fixed-target.q',
        optionKeys: ['quiz.fixed-target.a', 'quiz.fixed-target.b', 'quiz.fixed-target.c', 'quiz.fixed-target.d'],
        correct: 2,
      },
      {
        id: 'collider',
        questionKey: 'quiz.collider.q',
        optionKeys: ['quiz.collider.a', 'quiz.collider.b', 'quiz.collider.c', 'quiz.collider.d'],
        correct: 0,
      },
    ],
    conditions: [quiz('fixed-target'), quiz('collider')],
  },
  {
    id: 'luminosity',
    titleKey: 'level.luminosity.title',
    introKey: 'level.luminosity.intro',
    goalKey: 'level.luminosity.goal',
    hintKey: 'level.luminosity.hint',
    cardKey: 'level.luminosity.card',
    cardHref: 'https://home.cern/science/accelerators/luminosity',
    setup: { ...BASE_SETUP, targetEnergyGeV: 7000, timeSpeed: 600, beam: SMALL_BEAM },
    access: { ...NO_ACCESS, energy: true, timeSpeed: true, beam: true },
    visible: { readouts: true, beam: true, histogram: false },
    quiz: [
      {
        id: 'double-what',
        questionKey: 'quiz.double-what.q',
        optionKeys: ['quiz.double-what.a', 'quiz.double-what.b', 'quiz.double-what.c'],
        correct: 1,
      },
    ],
    conditions: [
      quiz('double-what'),
      {
        key: 'cond.luminosity5e33',
        test: (s) => s.colliding && (s.luminosityCm2S ?? 0) >= 5e33,
        progress: (s) => `${((s.colliding ? (s.luminosityCm2S ?? 0) : 0) / 1e33).toFixed(2)} / 5 × 10³³`,
      },
    ],
    failure: (s) => s.machine.status === 'lost',
  },
  {
    id: 'first-peak',
    titleKey: 'level.first-peak.title',
    introKey: 'level.first-peak.intro',
    goalKey: 'level.first-peak.goal',
    hintKey: 'level.first-peak.hint',
    cardKey: 'level.first-peak.card',
    cardHref: 'https://en.wikipedia.org/wiki/J/psi_meson',
    setup: { ...BASE_SETUP, timeSpeed: 60, window: { minGeV: 20, maxGeV: 30 } },
    access: { ...NO_ACCESS, energy: true, timeSpeed: true, massWindow: true },
    visible: { readouts: true, beam: true, histogram: true },
    quiz: [
      {
        id: 'peak-mass',
        questionKey: 'quiz.peak-mass.q',
        optionKeys: ['quiz.peak-mass.a', 'quiz.peak-mass.b', 'quiz.peak-mass.c', 'quiz.peak-mass.d'],
        correct: 1,
      },
    ],
    conditions: [
      {
        key: 'cond.windowOnJpsi',
        test: (s) => windowCovers(s.window, PARTICLES.jpsi.massGeV, 1),
      },
      {
        key: 'cond.signal500',
        test: (s) => windowCovers(s.window, PARTICLES.jpsi.massGeV, 1) && s.analysis.signal >= 500,
        progress: (s) => `${Math.max(0, Math.round(windowCovers(s.window, PARTICLES.jpsi.massGeV, 1) ? s.analysis.signal : 0))} / 500`,
      },
      {
        key: 'cond.fiveSigma',
        test: (s) => windowCovers(s.window, PARTICLES.jpsi.massGeV, 1) && s.analysis.significance >= 5,
        progress: (s) => `${(windowCovers(s.window, PARTICLES.jpsi.massGeV, 1) ? Math.min(99, Math.max(0, s.analysis.significance)) : 0).toFixed(1)} / 5 σ`,
      },
      quiz('peak-mass'),
    ],
    failure: (s) => s.machine.status === 'lost',
  },
  {
    id: 'z-boson',
    titleKey: 'level.z-boson.title',
    introKey: 'level.z-boson.intro',
    goalKey: 'level.z-boson.goal',
    hintKey: 'level.z-boson.hint',
    cardKey: 'level.z-boson.card',
    cardHref: 'https://en.wikipedia.org/wiki/W_and_Z_bosons',
    setup: { ...BASE_SETUP, timeSpeed: 600 },
    access: ALL_ACCESS,
    visible: { readouts: true, beam: true, histogram: true },
    quiz: [],
    conditions: [
      { key: 'cond.windowOnZ', test: (s) => windowCovers(s.window, PARTICLES.z.massGeV, 40) },
      {
        key: 'cond.zSignal100',
        test: (s) => windowCovers(s.window, PARTICLES.z.massGeV, 40) && s.analysis.signal >= 100,
        progress: (s) => `${Math.max(0, Math.round(windowCovers(s.window, PARTICLES.z.massGeV, 40) ? s.analysis.signal : 0))} / 100`,
      },
      {
        key: 'cond.fiveSigma',
        test: (s) => windowCovers(s.window, PARTICLES.z.massGeV, 40) && s.analysis.significance >= 5,
        progress: (s) => `${(windowCovers(s.window, PARTICLES.z.massGeV, 40) ? Math.min(99, Math.max(0, s.analysis.significance)) : 0).toFixed(1)} / 5 σ`,
      },
    ],
    failure: (s) => s.machine.status === 'lost',
  },
];

export const SANDBOX: Level = {
  id: 'sandbox',
  titleKey: 'level.sandbox.title',
  introKey: 'level.sandbox.intro',
  goalKey: 'level.sandbox.goal',
  hintKey: 'level.sandbox.hint',
  cardKey: 'level.sandbox.card',
  cardHref: 'https://home.cern/science/accelerators/large-hadron-collider',
  setup: { ...BASE_SETUP, timeSpeed: 60 },
  access: ALL_ACCESS,
  visible: { readouts: true, beam: true, histogram: true },
  quiz: [],
  conditions: [],
};

export const ALL_LEVELS: Level[] = [...LEVELS, SANDBOX];

export function levelById(id: string): Level {
  return ALL_LEVELS.find((l) => l.id === id) ?? LEVELS[0]!;
}

export type LevelStatus = 'playing' | 'completed' | 'failed';

export interface Evaluation {
  conditions: { key: string; done: boolean; progress?: string }[];
  completed: boolean;
  failed: boolean;
}

export function evaluateLevel(level: Level, s: Snapshot): Evaluation {
  const conditions = level.conditions.map((c) => {
    const entry: { key: string; done: boolean; progress?: string } = { key: c.key, done: c.test(s) };
    if (c.progress) entry.progress = c.progress(s);
    return entry;
  });
  return {
    conditions,
    completed: level.conditions.length > 0 && conditions.every((c) => c.done),
    failed: level.failure?.(s) ?? false,
  };
}

/** Which levels can be started: the first, every completed one, the one after the last completed, and the sandbox. */
export function isLevelUnlocked(level: Level, completed: ReadonlySet<string>): boolean {
  if (level.id === 'sandbox') return true;
  const index = LEVELS.findIndex((l) => l.id === level.id);
  if (index <= 0) return true;
  return completed.has(LEVELS[index - 1]!.id);
}
