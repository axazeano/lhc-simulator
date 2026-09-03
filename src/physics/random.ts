/**
 * Seeded pseudo-random numbers so that runs and tests are reproducible.
 * mulberry32: small, fast, good enough for a game's Monte Carlo.
 * https://en.wikipedia.org/wiki/Xorshift#Initialization (see also the "mulberry32" generator by Tommy Ettinger)
 */
export class Random {
  private state: number;
  private spareGaussian: number | null = null;

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Standard normal via Box–Muller. */
  gaussian(): number {
    if (this.spareGaussian !== null) {
      const value = this.spareGaussian;
      this.spareGaussian = null;
      return value;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spareGaussian = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  /** Exponential with the given mean. */
  exponential(mean: number): number {
    let u = 0;
    while (u === 0) u = this.next();
    return -mean * Math.log(u);
  }

  /** Poisson-distributed integer with mean λ. Exact for small λ, normal approximation for large. */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k += 1;
        p *= this.next();
      } while (p > limit);
      return k - 1;
    }
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.gaussian()));
  }

  /** Cauchy (non-relativistic Breit–Wigner) with location m0 and full width Γ. */
  breitWigner(mass: number, width: number): number {
    if (width <= 0) return mass;
    return mass + (width / 2) * Math.tan(Math.PI * (this.next() - 0.5));
  }

  /**
   * Breit–Wigner restricted to [min, max] by inverting the CDF, so nothing piles up at the
   * edges. Falls back to the location when the interval is empty.
   */
  breitWignerTruncated(mass: number, width: number, min: number, max: number): number {
    if (width <= 0 || max <= min) return Math.min(max, Math.max(min, mass));
    const cdf = (x: number) => 0.5 + Math.atan((2 * (x - mass)) / width) / Math.PI;
    const lo = cdf(min);
    const hi = cdf(max);
    const u = lo + this.next() * (hi - lo);
    return mass + (width / 2) * Math.tan(Math.PI * (u - 0.5));
  }

  /** Power law dN/dm ∝ m^(-k) on [min, max], k ≠ 1. */
  powerLaw(min: number, max: number, k: number): number {
    const a = 1 - k;
    const lo = min ** a;
    const hi = max ** a;
    return (lo + this.next() * (hi - lo)) ** (1 / a);
  }
}
