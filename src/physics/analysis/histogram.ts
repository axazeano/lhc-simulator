/** Fixed-width one-dimensional histogram. */
export interface HistogramSpec {
  min: number;
  max: number;
  bins: number;
}

export class Histogram {
  readonly counts: Float64Array;
  readonly width: number;
  entries = 0;

  constructor(readonly spec: HistogramSpec) {
    this.counts = new Float64Array(spec.bins);
    this.width = (spec.max - spec.min) / spec.bins;
  }

  binOf(value: number): number {
    if (value < this.spec.min || value >= this.spec.max) return -1;
    return Math.floor((value - this.spec.min) / this.width);
  }

  binLowEdge(bin: number): number {
    return this.spec.min + bin * this.width;
  }

  binCenter(bin: number): number {
    return this.spec.min + (bin + 0.5) * this.width;
  }

  fill(value: number, weight = 1): void {
    const bin = this.binOf(value);
    if (bin < 0) return;
    this.counts[bin]! += weight;
    this.entries += weight;
  }

  addCounts(bin: number, count: number): void {
    if (bin < 0 || bin >= this.spec.bins || count === 0) return;
    this.counts[bin]! += count;
    this.entries += count;
  }

  /** Sum of counts for values in [from, to). Partial bins are included in full. */
  integral(from: number, to: number): number {
    const first = Math.max(0, this.binOf(Math.max(from, this.spec.min)));
    const last = this.binOf(Math.min(to, this.spec.max) - 1e-9);
    if (last < 0 || first > last) return 0;
    let sum = 0;
    for (let i = first; i <= last; i++) sum += this.counts[i]!;
    return sum;
  }

  reset(): void {
    this.counts.fill(0);
    this.entries = 0;
  }

  /**
   * Re-bin the range [from, to) into `columns` equal slices, for drawing.
   * Bins are shared between columns in proportion to their overlap, so the result is smooth
   * whether a column covers many bins or a fraction of one.
   */
  rebin(from: number, to: number, columns: number): Float64Array {
    const out = new Float64Array(columns);
    const step = (to - from) / columns;
    for (let c = 0; c < columns; c++) {
      const lo = from + c * step;
      const hi = lo + step;
      const b0 = Math.max(0, Math.floor((lo - this.spec.min) / this.width));
      const b1 = Math.min(this.spec.bins - 1, Math.floor((hi - this.spec.min) / this.width));
      let sum = 0;
      for (let b = b0; b <= b1; b++) {
        const binLo = this.binLowEdge(b);
        const binHi = binLo + this.width;
        const overlap = Math.min(hi, binHi) - Math.max(lo, binLo);
        if (overlap > 0) sum += (this.counts[b]! * overlap) / this.width;
      }
      out[c] = sum;
    }
    return out;
  }
}
