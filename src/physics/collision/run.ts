import { Histogram, type HistogramSpec } from '../analysis/histogram';
import { DEFAULT_DETECTOR, reconstructEventMass, type DetectorModel, type SelectionCuts } from '../detector/detector';
import { Random } from '../random';
import { CHANNELS, CHANNEL_DEFINITIONS, type Channel } from './channels';
import { generateEvent, generateWeightedEvent } from './generator';
import { PROCESSES, crossSectionNb, expectedCount, type ProcessDefinition } from './processes';

/**
 * A data-taking run: turns integrated luminosity into invariant-mass histograms, one per channel.
 *
 * Two regimes keep it honest and fast:
 * - When a process is expected to produce only a handful of events in a step, every event is
 *   generated and passed through the detector individually.
 * - When thousands are expected, the run uses a template (the mass distribution of that
 *   process after the detector, built once from a large Monte Carlo sample) and draws
 *   Poisson-distributed counts per bin. Statistically this is the same as simulating each event.
 */

export const DIMUON_HISTOGRAM: HistogramSpec = CHANNEL_DEFINITIONS.mumu.spec;

/** Below this expected count per step, events are simulated one by one. */
const INDIVIDUAL_LIMIT = 300;
/** Keep sampling until the template holds this many accepted events, within the sample budget. */
const TEMPLATE_MIN_ACCEPTED = 6000;
const TEMPLATE_MAX_SAMPLES = 200000;
/**
 * Templates are smoothed with a Gaussian kernel. For resonances the kernel is a quarter of the
 * detector mass resolution (about 0.9 %), which widens a peak by only 3 % but removes the empty
 * bins that a finite Monte Carlo sample would otherwise freeze into the template. The continuum
 * has no features of its own, so it gets a much wider kernel and a larger sample.
 */
const RESONANCE_SMOOTHING_FRACTION = 0.25 * 0.009;
const CONTINUUM_SMOOTHING_FRACTION = 0.03;
const CONTINUUM_MIN_ACCEPTED = 12000;

interface Template {
  acceptance: number;
  fractions: Float64Array;
  nonZeroBins: Int32Array;
}

export type CutsByChannel = Record<Channel, SelectionCuts>;

export const DEFAULT_CUTS: CutsByChannel = {
  mumu: { ptMinGeV: CHANNEL_DEFINITIONS.mumu.defaultPtMinGeV },
  gammagamma: { ptMinGeV: CHANNEL_DEFINITIONS.gammagamma.defaultPtMinGeV },
  fourlepton: { ptMinGeV: CHANNEL_DEFINITIONS.fourlepton.defaultPtMinGeV },
};

export interface RunSnapshot {
  integratedLuminosityM2: number;
  collisions: number;
  visibleByProcess: Record<string, number>;
  simulatedEvents: number;
  entriesByChannel: Record<Channel, number>;
}

function channelOf(process: ProcessDefinition): Channel | null {
  return process.finalState ?? null;
}

export class CollisionRun {
  readonly histograms: Record<Channel, Histogram>;
  integratedLuminosityM2 = 0;
  collisions = 0;
  simulatedEvents = 0;
  visibleByProcess: Record<string, number> = {};
  private readonly rng: Random;
  private readonly templates = new Map<string, Template>();

  constructor(seed = 12345) {
    this.rng = new Random(seed);
    this.histograms = {
      mumu: new Histogram(CHANNEL_DEFINITIONS.mumu.spec),
      gammagamma: new Histogram(CHANNEL_DEFINITIONS.gammagamma.spec),
      fourlepton: new Histogram(CHANNEL_DEFINITIONS.fourlepton.spec),
    };
  }

  /** The dimuon histogram, kept for convenience. */
  get histogram(): Histogram {
    return this.histograms.mumu;
  }

  reset(): void {
    for (const channel of CHANNELS) this.histograms[channel].reset();
    this.integratedLuminosityM2 = 0;
    this.collisions = 0;
    this.simulatedEvents = 0;
    this.visibleByProcess = {};
  }

  /** Clear one channel's data, as if that trigger had just been reconfigured. */
  resetChannel(channel: Channel): void {
    this.histograms[channel].reset();
    for (const process of PROCESSES) {
      if (channelOf(process) === channel) delete this.visibleByProcess[process.id];
    }
  }

  snapshot(): RunSnapshot {
    return {
      integratedLuminosityM2: this.integratedLuminosityM2,
      collisions: this.collisions,
      visibleByProcess: { ...this.visibleByProcess },
      simulatedEvents: this.simulatedEvents,
      entriesByChannel: {
        mumu: this.histograms.mumu.entries,
        gammagamma: this.histograms.gammagamma.entries,
        fourlepton: this.histograms.fourlepton.entries,
      },
    };
  }

  /** Record `deltaLuminosityM2` of collisions at √s with the given selection per channel. */
  collect(
    deltaLuminosityM2: number,
    sqrtSGeV: number,
    cuts: CutsByChannel = DEFAULT_CUTS,
    detector: DetectorModel = DEFAULT_DETECTOR,
  ): void {
    if (deltaLuminosityM2 <= 0) return;
    this.integratedLuminosityM2 += deltaLuminosityM2;
    for (const process of PROCESSES) {
      const sigma = crossSectionNb(process, sqrtSGeV);
      if (sigma <= 0) continue;
      const expected = expectedCount(sigma, deltaLuminosityM2);
      if (process.kind === 'inelastic') {
        this.collisions += expected;
        continue;
      }
      const channel = channelOf(process);
      if (!channel) continue;
      const channelCuts = cuts[channel];
      if (expected < INDIVIDUAL_LIMIT) {
        this.collectIndividually(process, channel, expected, sqrtSGeV, channelCuts, detector);
      } else {
        this.collectFromTemplate(process, channel, expected, sqrtSGeV, channelCuts, detector);
      }
    }
  }

  private addVisible(processId: string, count: number): void {
    this.visibleByProcess[processId] = (this.visibleByProcess[processId] ?? 0) + count;
  }

  private collectIndividually(
    process: ProcessDefinition,
    channel: Channel,
    expected: number,
    sqrtSGeV: number,
    cuts: SelectionCuts,
    detector: DetectorModel,
  ): void {
    const n = this.rng.poisson(expected);
    const histogram = this.histograms[channel];
    for (let i = 0; i < n; i++) {
      const event = generateEvent(process, sqrtSGeV, this.rng);
      const mass = reconstructEventMass(event.daughters, event.kinds, detector, cuts, this.rng);
      this.simulatedEvents += 1;
      if (mass === null) continue;
      histogram.fill(mass);
      this.addVisible(process.id, 1);
    }
  }

  private collectFromTemplate(
    process: ProcessDefinition,
    channel: Channel,
    expected: number,
    sqrtSGeV: number,
    cuts: SelectionCuts,
    detector: DetectorModel,
  ): void {
    const template = this.template(process, channel, sqrtSGeV, cuts, detector);
    const visibleExpected = expected * template.acceptance;
    if (visibleExpected <= 0) return;
    const histogram = this.histograms[channel];
    let total = 0;
    for (let i = 0; i < template.nonZeroBins.length; i++) {
      const bin = template.nonZeroBins[i]!;
      const lambda = visibleExpected * template.fractions[bin]!;
      const count = this.rng.poisson(lambda);
      if (count > 0) {
        histogram.addCounts(bin, count);
        total += count;
      }
    }
    this.addVisible(process.id, total);
  }

  private template(
    process: ProcessDefinition,
    channel: Channel,
    sqrtSGeV: number,
    cuts: SelectionCuts,
    detector: DetectorModel,
  ): Template {
    const key = `${process.id}|${Number(sqrtSGeV.toPrecision(3))}|${cuts.ptMinGeV}`;
    const cached = this.templates.get(key);
    if (cached) return cached;
    const built = buildTemplate(process, sqrtSGeV, cuts, detector, this.histograms[channel].spec, new Random(hashKey(key)));
    this.templates.set(key, built);
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

export function buildTemplate(
  process: ProcessDefinition,
  sqrtSGeV: number,
  cuts: SelectionCuts,
  detector: DetectorModel,
  spec: HistogramSpec,
  rng: Random,
  minAccepted = TEMPLATE_MIN_ACCEPTED,
  maxSamples = TEMPLATE_MAX_SAMPLES,
): Template {
  const histogram = new Histogram(spec);
  const isContinuum = process.kind === 'continuum';
  const target = isContinuum ? Math.max(minAccepted, CONTINUUM_MIN_ACCEPTED) : minAccepted;
  let accepted = 0;
  let acceptedWeight = 0;
  let samples = 0;
  while (samples < maxSamples && accepted < target) {
    samples += 1;
    const event = generateWeightedEvent(process, sqrtSGeV, rng);
    const mass = reconstructEventMass(event.daughters, event.kinds, detector, cuts, rng);
    if (mass === null) continue;
    accepted += 1;
    acceptedWeight += event.weight;
    histogram.fill(mass, event.weight);
  }
  const fractions = new Float64Array(spec.bins);
  const nonZero: number[] = [];
  if (acceptedWeight > 0) {
    const smoothed = smoothCounts(histogram, isContinuum ? CONTINUUM_SMOOTHING_FRACTION : RESONANCE_SMOOTHING_FRACTION);
    for (let b = 0; b < spec.bins; b++) {
      const c = smoothed[b]!;
      if (c > 0) {
        fractions[b] = c / acceptedWeight;
        nonZero.push(b);
      }
    }
  }
  return { acceptance: acceptedWeight / samples, fractions, nonZeroBins: Int32Array.from(nonZero) };
}

/**
 * Spread every bin into a Gaussian whose width is `fraction` of the bin's mass, at least
 * 0.7 bins. The total is preserved.
 */
export function smoothCounts(histogram: Histogram, fraction: number): Float64Array {
  const { spec, counts, width } = histogram;
  const out = new Float64Array(spec.bins);
  for (let b = 0; b < spec.bins; b++) {
    const c = counts[b]!;
    if (c <= 0) continue;
    const sigma = Math.max(0.7, (fraction * histogram.binCenter(b)) / width);
    const reach = Math.ceil(3 * sigma);
    const lo = Math.max(0, b - reach);
    const hi = Math.min(spec.bins - 1, b + reach);
    let norm = 0;
    for (let j = lo; j <= hi; j++) norm += Math.exp(-((j - b) ** 2) / (2 * sigma * sigma));
    for (let j = lo; j <= hi; j++) out[j]! += (c * Math.exp(-((j - b) ** 2) / (2 * sigma * sigma))) / norm;
  }
  return out;
}
