import { Histogram, type HistogramSpec } from '../analysis/histogram';
import { DEFAULT_DETECTOR, type DetectorModel, type SelectionCuts } from '../detector/detector';
import { Random } from '../random';
import { CHANNELS, CHANNEL_DEFINITIONS, type Channel } from './channels';
import { buildEventPool, drawFromPool, reconstructRecord, type EventPool, type Region } from './eventPool';
import { EventStore } from './eventStore';
import { generateEvent } from './generator';
import { PROCESSES, crossSectionNb, expectedCount, type ProcessDefinition } from './processes';

/**
 * A data-taking run: turns integrated luminosity into recorded events, one store per channel.
 *
 * Recording works like a real trigger with prescales:
 * - Every channel records at its lowest pT threshold; the analysis threshold is applied later,
 *   offline, to the stored events, so it can be changed without losing data.
 * - Rare processes are simulated and recorded one by one (weight 1).
 * - Frequent processes are prescaled: a fixed number of representative events per step is
 *   drawn from a pre-built pool and each stands for `weight` real events.
 */

export const DIMUON_HISTOGRAM: HistogramSpec = CHANNEL_DEFINITIONS.mumu.spec;

/** Below this expected (raw) count per step, events are fully simulated one by one. */
const INDIVIDUAL_LIMIT = 300;
/** Below this expected visible count per step, pool draws are recorded one by one with weight 1. */
const PRESCALE_START = 150;
/** Prescaled records per process per step grow with the expected count, within these bounds. */
const PRESCALED_MIN = 150;
const PRESCALED_MAX = 600;
const EVENTS_PER_RECORD = 50;
/** High-mass events are recorded one by one up to this many per process per step, then prescaled. */
const UNPRESCALED_CAP = 3000;

export type CutsByChannel = Record<Channel, SelectionCuts>;

export const DEFAULT_CUTS: CutsByChannel = {
  mumu: { ptMinGeV: CHANNEL_DEFINITIONS.mumu.defaultPtMinGeV },
  gammagamma: { ptMinGeV: CHANNEL_DEFINITIONS.gammagamma.defaultPtMinGeV },
  fourlepton: { ptMinGeV: CHANNEL_DEFINITIONS.fourlepton.defaultPtMinGeV },
};

/** The trigger threshold each channel records at: the lowest the analysis knob allows. */
export const RECORDING_CUTS: CutsByChannel = {
  mumu: { ptMinGeV: CHANNEL_DEFINITIONS.mumu.ptMinRange[0] },
  gammagamma: { ptMinGeV: CHANNEL_DEFINITIONS.gammagamma.ptMinRange[0] },
  fourlepton: { ptMinGeV: CHANNEL_DEFINITIONS.fourlepton.ptMinRange[0] },
};

export interface RunSnapshot {
  integratedLuminosityM2: number;
  collisions: number;
  /** Represented (weighted) events per process after the given cuts. */
  visibleByProcess: Record<string, number>;
  simulatedEvents: number;
  recordedByChannel: Record<Channel, number>;
  entriesByChannel: Record<Channel, number>;
}

function channelOf(process: ProcessDefinition): Channel | null {
  return process.finalState ?? null;
}

export class CollisionRun {
  readonly stores: Record<Channel, EventStore>;
  integratedLuminosityM2 = 0;
  collisions = 0;
  simulatedEvents = 0;
  private readonly rng: Random;
  private readonly pools = new Map<string, EventPool>();
  private readonly detector: DetectorModel;

  constructor(seed = 12345, detector: DetectorModel = DEFAULT_DETECTOR) {
    this.rng = new Random(seed);
    this.detector = detector;
    this.stores = {
      mumu: new EventStore(CHANNEL_DEFINITIONS.mumu.spec),
      gammagamma: new EventStore(CHANNEL_DEFINITIONS.gammagamma.spec),
      fourlepton: new EventStore(CHANNEL_DEFINITIONS.fourlepton.spec),
    };
  }

  /** Histogram of a channel after the analysis threshold. Cached inside the store. */
  histogramFor(channel: Channel, cuts: SelectionCuts = DEFAULT_CUTS[channel]): Histogram {
    return this.stores[channel].histogram(cuts.ptMinGeV);
  }

  /** The dimuon histogram at the default threshold, kept for convenience. */
  get histogram(): Histogram {
    return this.histogramFor('mumu');
  }

  reset(): void {
    for (const channel of CHANNELS) this.stores[channel].clear();
    this.integratedLuminosityM2 = 0;
    this.collisions = 0;
    this.simulatedEvents = 0;
  }

  /** Clear one channel's data. */
  resetChannel(channel: Channel): void {
    this.stores[channel].clear();
  }

  snapshot(cuts: CutsByChannel = DEFAULT_CUTS): RunSnapshot {
    const visibleByProcess: Record<string, number> = {};
    for (const channel of CHANNELS) {
      for (const [index, count] of this.stores[channel].countByProcess(cuts[channel].ptMinGeV)) {
        const process = PROCESSES[index];
        if (process) visibleByProcess[process.id] = (visibleByProcess[process.id] ?? 0) + count;
      }
    }
    return {
      integratedLuminosityM2: this.integratedLuminosityM2,
      collisions: this.collisions,
      visibleByProcess,
      simulatedEvents: this.simulatedEvents,
      recordedByChannel: {
        mumu: this.stores.mumu.size,
        gammagamma: this.stores.gammagamma.size,
        fourlepton: this.stores.fourlepton.size,
      },
      entriesByChannel: {
        mumu: this.histogramFor('mumu', cuts.mumu).entries,
        gammagamma: this.histogramFor('gammagamma', cuts.gammagamma).entries,
        fourlepton: this.histogramFor('fourlepton', cuts.fourlepton).entries,
      },
    };
  }

  /** Record `deltaLuminosityM2` of collisions at √s. */
  collect(deltaLuminosityM2: number, sqrtSGeV: number): void {
    if (deltaLuminosityM2 <= 0) return;
    this.integratedLuminosityM2 += deltaLuminosityM2;
    for (let index = 0; index < PROCESSES.length; index++) {
      const process = PROCESSES[index]!;
      const sigma = crossSectionNb(process, sqrtSGeV);
      if (sigma <= 0) continue;
      const expected = expectedCount(sigma, deltaLuminosityM2);
      if (process.kind === 'inelastic') {
        this.collisions += expected;
        continue;
      }
      const channel = channelOf(process);
      if (!channel) continue;
      if (expected < INDIVIDUAL_LIMIT) {
        this.recordIndividually(process, index, channel, expected, sqrtSGeV);
      } else {
        this.recordPrescaled(process, index, channel, expected, sqrtSGeV);
      }
    }
  }

  private recordIndividually(process: ProcessDefinition, index: number, channel: Channel, expected: number, sqrtSGeV: number): void {
    const n = this.rng.poisson(expected);
    const store = this.stores[channel];
    const cuts = RECORDING_CUTS[channel];
    for (let i = 0; i < n; i++) {
      const event = generateEvent(process, sqrtSGeV, this.rng);
      this.simulatedEvents += 1;
      const record = reconstructRecord(event.daughters, event.kinds, this.detector, cuts, this.rng);
      if (!record) continue;
      store.record({ massGeV: record.massGeV, minPtGeV: record.minPtGeV, sqrtSGeV, processIndex: index, weight: 1 }, this.rng);
      store.keepForDisplay({
        processId: process.id,
        sqrtSGeV,
        massGeV: record.massGeV,
        particles: record.particles.map((vector, k) => ({ kind: event.kinds[k] ?? 'muon', vector })),
      });
    }
  }

  private recordPrescaled(process: ProcessDefinition, index: number, channel: Channel, expected: number, sqrtSGeV: number): void {
    const pool = this.pool(process, channel, sqrtSGeV);
    const visibleExpected = expected * pool.acceptance;
    if (visibleExpected <= 0) return;
    // High-mass "physics stream": every event recorded, up to a cap. Low-mass bulk: prescaled.
    this.recordFromRegion(pool, pool.high, index, channel, visibleExpected * pool.high.fraction, sqrtSGeV, UNPRESCALED_CAP);
    this.recordFromRegion(pool, pool.low, index, channel, visibleExpected * pool.low.fraction, sqrtSGeV, PRESCALE_START);
  }

  /**
   * Record `expected` visible events from a sub-pool. Below `oneByOneUpTo` each event is
   * recorded with weight 1; above it a bounded number of records shares the total weight.
   */
  private recordFromRegion(
    pool: EventPool,
    region: Region,
    index: number,
    channel: Channel,
    expected: number,
    sqrtSGeV: number,
    oneByOneUpTo: number,
  ): void {
    if (expected <= 0 || region.fraction <= 0) return;
    const store = this.stores[channel];
    if (expected < oneByOneUpTo) {
      const n = this.rng.poisson(expected);
      for (let i = 0; i < n; i++) {
        const drawn = drawFromPool(pool, this.rng, region);
        if (!drawn) return;
        store.record({ massGeV: drawn.massGeV, minPtGeV: drawn.minPtGeV, sqrtSGeV, processIndex: index, weight: 1 }, this.rng);
      }
      return;
    }
    // Once prescaling starts, take at least as many records as the one-by-one limit, so the
    // transition is seamless, and more as the expected count grows, up to the cap.
    const cap = Math.max(PRESCALED_MAX, oneByOneUpTo);
    const n = Math.min(cap, Math.max(oneByOneUpTo, PRESCALED_MIN, Math.ceil(expected / EVENTS_PER_RECORD)));
    const scale = expected / n;
    for (let i = 0; i < n; i++) {
      const drawn = drawFromPool(pool, this.rng, region, 'mixed');
      if (!drawn) return;
      store.record({ massGeV: drawn.massGeV, minPtGeV: drawn.minPtGeV, sqrtSGeV, processIndex: index, weight: scale * drawn.weight }, this.rng);
    }
  }

  private pool(process: ProcessDefinition, channel: Channel, sqrtSGeV: number): EventPool {
    const key = `${process.id}|${Number(sqrtSGeV.toPrecision(3))}`;
    const cached = this.pools.get(key);
    if (cached) return cached;
    const built = buildEventPool(
      process,
      sqrtSGeV,
      RECORDING_CUTS[channel],
      this.detector,
      CHANNEL_DEFINITIONS[channel].spec,
      new Random(hashKey(key)),
      CHANNEL_DEFINITIONS[channel].unprescaledFromGeV,
    );
    this.pools.set(key, built);
    return built;
  }
}

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
