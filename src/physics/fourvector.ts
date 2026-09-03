/**
 * Four-vectors in natural units (GeV). Energy is `e`, momentum components `px, py, pz`.
 * https://en.wikipedia.org/wiki/Four-momentum
 */
export interface FourVector {
  e: number;
  px: number;
  py: number;
  pz: number;
}

export function invariantMass(v: FourVector): number {
  const m2 = v.e * v.e - v.px * v.px - v.py * v.py - v.pz * v.pz;
  return Math.sqrt(Math.max(0, m2));
}

export function add(a: FourVector, b: FourVector): FourVector {
  return { e: a.e + b.e, px: a.px + b.px, py: a.py + b.py, pz: a.pz + b.pz };
}

export function momentum(v: FourVector): number {
  return Math.hypot(v.px, v.py, v.pz);
}

export function transverseMomentum(v: FourVector): number {
  return Math.hypot(v.px, v.py);
}

/** Pseudorapidity η = asinh(pz / pT). */
export function pseudorapidity(v: FourVector): number {
  const pt = transverseMomentum(v);
  if (pt === 0) return v.pz >= 0 ? Infinity : -Infinity;
  return Math.asinh(v.pz / pt);
}

/** Rapidity y = ½ ln((E + pz) / (E − pz)). */
export function rapidity(v: FourVector): number {
  return 0.5 * Math.log((v.e + v.pz) / (v.e - v.pz));
}

export function azimuth(v: FourVector): number {
  return Math.atan2(v.py, v.px);
}

export function fromPtEtaPhiM(pt: number, eta: number, phi: number, mass: number): FourVector {
  const px = pt * Math.cos(phi);
  const py = pt * Math.sin(phi);
  const pz = pt * Math.sinh(eta);
  return { e: Math.sqrt(px * px + py * py + pz * pz + mass * mass), px, py, pz };
}

/** Build a four-vector from transverse momentum, rapidity, azimuth and mass. */
export function fromPtRapidityPhiM(pt: number, y: number, phi: number, mass: number): FourVector {
  const mt = Math.hypot(mass, pt);
  return { e: mt * Math.cosh(y), px: pt * Math.cos(phi), py: pt * Math.sin(phi), pz: mt * Math.sinh(y) };
}

/** Lorentz boost by velocity β = (bx, by, bz) in units of c. */
export function boost(v: FourVector, bx: number, by: number, bz: number): FourVector {
  const b2 = bx * bx + by * by + bz * bz;
  if (b2 === 0) return v;
  const gamma = 1 / Math.sqrt(1 - b2);
  const bp = bx * v.px + by * v.py + bz * v.pz;
  const gamma2 = (gamma - 1) / b2;
  return {
    e: gamma * (v.e + bp),
    px: v.px + gamma2 * bp * bx + gamma * bx * v.e,
    py: v.py + gamma2 * bp * by + gamma * by * v.e,
    pz: v.pz + gamma2 * bp * bz + gamma * bz * v.e,
  };
}

/** Boost a vector from the rest frame of `parent` into the frame where `parent` is measured. */
export function boostToFrameOf(v: FourVector, parent: FourVector): FourVector {
  return boost(v, parent.px / parent.e, parent.py / parent.e, parent.pz / parent.e);
}
