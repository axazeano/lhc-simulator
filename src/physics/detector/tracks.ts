import { DETECTOR_GEOMETRY as G } from '../../data/detectorGeometry';
import type { RecordedParticle } from '../collision/eventStore';

/**
 * Track geometry for the event display: a charged particle of transverse momentum pT bends in
 * the solenoid field B on a circle of radius R = pT / (0.2998 · B) in the transverse plane
 * (pT in GeV/c, B in tesla, R in metres). https://en.wikipedia.org/wiki/Rigidity_(electromagnetism)
 */

export interface Point {
  x: number;
  y: number;
}

/** Bending radius in metres. */
export function bendingRadiusM(ptGeV: number, fieldT: number = G.solenoidFieldT): number {
  return ptGeV / (0.2998 * fieldT);
}

/**
 * Points of a track in the transverse plane from the origin out to radius `rMax`, following
 * the circle for a charged particle or a straight line for a neutral one. The bend direction
 * follows the charge sign. Returns the points and the polar radius reached.
 */
export function transverseTrack(particle: RecordedParticle, rMaxM: number, steps = 60): Point[] {
  const { phi, charge, ptGeV } = particle;
  if (charge === 0 || ptGeV <= 0) {
    return [
      { x: 0, y: 0 },
      { x: rMaxM * Math.cos(phi), y: rMaxM * Math.sin(phi) },
    ];
  }
  const R = bendingRadiusM(ptGeV);
  const q = charge > 0 ? 1 : -1;
  const points: Point[] = [];
  // Arc length grows until the track leaves rMax or loops back (low pT spirals).
  const maxArc = Math.min(Math.PI * R, 3 * rMaxM);
  for (let i = 0; i <= steps; i++) {
    const s = (maxArc * i) / steps;
    const x = (R / q) * (Math.sin(phi) - Math.sin(phi - (q * s) / R));
    const y = (R / q) * (Math.cos(phi - (q * s) / R) - Math.cos(phi));
    points.push({ x, y });
    if (Math.hypot(x, y) >= rMaxM) break;
  }
  return points;
}

/** Outer radius a particle of this kind reaches in the barrel: photons and electrons stop in the calorimeter, muons go through. */
export function reachM(kind: RecordedParticle['kind']): number {
  return kind === 'muon' ? G.muonOuterM : G.ecalInnerM + 0.6 * (G.ecalOuterM - G.ecalInnerM);
}

/** Straight line in the r–z plane at the polar angle set by η, out to the detector edge. */
export function longitudinalTrack(particle: RecordedParticle, rMaxM: number, zMaxM: number): { r: number; z: number } {
  const theta = 2 * Math.atan(Math.exp(-particle.eta));
  const tan = Math.tan(theta);
  // r = z · tanθ; stop at whichever boundary comes first.
  const sign = particle.eta >= 0 ? 1 : -1;
  const zAtRMax = rMaxM / Math.abs(tan);
  if (zAtRMax <= zMaxM) return { r: rMaxM, z: sign * zAtRMax };
  return { r: zMaxM * Math.abs(tan), z: sign * zMaxM };
}

/** Where a track crosses a given radius, or null if it never reaches it. */
export function crossingAtRadius(points: Point[], rM: number): Point | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const ra = Math.hypot(a.x, a.y);
    const rb = Math.hypot(b.x, b.y);
    if (ra <= rM && rb >= rM) {
      const f = (rM - ra) / Math.max(1e-9, rb - ra);
      return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
    }
  }
  return null;
}
