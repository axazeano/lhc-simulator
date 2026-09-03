import { Histogram, type HistogramSpec } from '../analysis/histogram';
import type { FourVector } from '../fourvector';
import type { Random } from '../random';
import type { ParticleKind } from './generator';

/**
 * Recorded events of one channel, the simulator's "disk". Every record is a reconstructed
 * event: its invariant mass, the smallest pT among its final-state particles (so any
 * analysis threshold can be applied later), the √s it was produced at, its process, and a
 * weight.
 *
 * Weights are the game's prescale: when a process is far too frequent to record every event,
 * a representative sample is stored and each record stands for `weight` real events, exactly
 * as prescaled triggers work in the real experiments. Rare processes are recorded one by one
 * with weight 1.
 *
 * Storage is bounded: when the store fills up, half of the prescaled records are dropped at
 * random and the survivors' weights doubled, which keeps every sum unbiased.
 */

export interface RecordedEvent {
  massGeV: number;
  minPtGeV: number;
  sqrtSGeV: number;
  processIndex: number;
  weight: number;
}

/** A fully kept event for display: the reconstructed particles of an individually simulated event. */
export interface DisplayEvent {
  processId: string;
  sqrtSGeV: number;
  massGeV: number;
  particles: { kind: ParticleKind; vector: FourVector }[];
}

const DISPLAY_RESERVOIR = 200;

export class EventStore {
  private mass: Float32Array;
  private minPt: Float32Array;
  private sqrtS: Float32Array;
  private process: Uint8Array;
  private weight: Float32Array;
  private count = 0;
  /** Bumped on every change, so cached histograms know when they are stale. */
  version = 0;
  /** Most recent individually simulated events, for the event display. */
  readonly display: DisplayEvent[] = [];
  private cachedHistogram: { cut: number; version: number; histogram: Histogram } | null = null;

  constructor(
    readonly spec: HistogramSpec,
    readonly capacity = 300000,
  ) {
    this.mass = new Float32Array(capacity);
    this.minPt = new Float32Array(capacity);
    this.sqrtS = new Float32Array(capacity);
    this.process = new Uint8Array(capacity);
    this.weight = new Float32Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  /** Sum of weights, i.e. the number of real events the store represents. */
  get representedEvents(): number {
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.weight[i]!;
    return sum;
  }

  record(event: RecordedEvent, rng: Random): void {
    if (this.count >= this.capacity) this.thin(rng);
    const i = this.count++;
    this.mass[i] = event.massGeV;
    this.minPt[i] = event.minPtGeV;
    this.sqrtS[i] = event.sqrtSGeV;
    this.process[i] = event.processIndex;
    this.weight[i] = event.weight;
    this.version += 1;
  }

  keepForDisplay(event: DisplayEvent): void {
    this.display.push(event);
    if (this.display.length > DISPLAY_RESERVOIR) this.display.shift();
  }

  /**
   * Halve the prescaled records while keeping every mass bin's total weight exactly: of the
   * eligible records in a bin, every second one stays and the survivors are scaled by the
   * ratio of the bin's eligible weight to its kept weight. A bin with a single record is left
   * untouched, so sparse regions never inflate, and no histogram built from the store changes
   * by more than rounding. Records with weight 1 (real single events) are only thinned when
   * nothing else is left to thin.
   */
  thin(rng: Random): void {
    let prescaled = 0;
    for (let i = 0; i < this.count; i++) if (this.weight[i]! > 1) prescaled += 1;
    const thinAll = prescaled < this.count / 4;
    const width = (this.spec.max - this.spec.min) / this.spec.bins;
    const binOf = (m: number) => Math.min(this.spec.bins, Math.max(0, Math.floor((m - this.spec.min) / width)));
    const bins = this.spec.bins + 1;
    const eligibleCount = new Int32Array(bins);
    const eligibleWeight = new Float64Array(bins);
    const keptWeight = new Float64Array(bins);
    const seen = new Int32Array(bins);
    // Random phase per bin so that repeated thinnings do not always keep the same records.
    const phase = new Uint8Array(bins);
    for (let b = 0; b < bins; b++) phase[b] = rng.next() < 0.5 ? 1 : 0;
    for (let i = 0; i < this.count; i++) {
      if (thinAll || this.weight[i]! > 1) {
        const b = binOf(this.mass[i]!);
        eligibleCount[b] = eligibleCount[b]! + 1;
      }
    }
    const keeps = (b: number, k: number) => eligibleCount[b] === 1 || (k + phase[b]!) % 2 === 0;
    // First pass: weight totals of eligible and kept records per bin.
    for (let i = 0; i < this.count; i++) {
      if (!(thinAll || this.weight[i]! > 1)) continue;
      const b = binOf(this.mass[i]!);
      const k = seen[b]!;
      seen[b] = k + 1;
      eligibleWeight[b] = eligibleWeight[b]! + this.weight[i]!;
      if (keeps(b, k)) keptWeight[b] = keptWeight[b]! + this.weight[i]!;
    }
    // Second pass: drop and rescale.
    seen.fill(0);
    let j = 0;
    for (let i = 0; i < this.count; i++) {
      const eligible = thinAll || this.weight[i]! > 1;
      let factor = 1;
      if (eligible) {
        const b = binOf(this.mass[i]!);
        const k = seen[b]!;
        seen[b] = k + 1;
        if (!keeps(b, k)) continue;
        factor = keptWeight[b]! > 0 ? eligibleWeight[b]! / keptWeight[b]! : 1;
      }
      this.mass[j] = this.mass[i]!;
      this.minPt[j] = this.minPt[i]!;
      this.sqrtS[j] = this.sqrtS[i]!;
      this.process[j] = this.process[i]!;
      this.weight[j] = this.weight[i]! * factor;
      j += 1;
    }
    this.count = j;
    this.version += 1;
  }

  clear(): void {
    this.count = 0;
    this.display.length = 0;
    this.cachedHistogram = null;
    this.version += 1;
  }

  /** Invariant-mass histogram of all records whose particles all pass the pT threshold. Cached per cut. */
  histogram(ptMinGeV: number): Histogram {
    const cached = this.cachedHistogram;
    if (cached && cached.cut === ptMinGeV && cached.version === this.version) return cached.histogram;
    const histogram = new Histogram(this.spec);
    for (let i = 0; i < this.count; i++) {
      if (this.minPt[i]! < ptMinGeV) continue;
      histogram.fill(this.mass[i]!, this.weight[i]!);
    }
    this.cachedHistogram = { cut: ptMinGeV, version: this.version, histogram };
    return histogram;
  }

  /** Represented events per process after the threshold, for readouts and tests. */
  countByProcess(ptMinGeV: number): Map<number, number> {
    const out = new Map<number, number>();
    for (let i = 0; i < this.count; i++) {
      if (this.minPt[i]! < ptMinGeV) continue;
      const p = this.process[i]!;
      out.set(p, (out.get(p) ?? 0) + this.weight[i]!);
    }
    return out;
  }
}
