import raw from './particles.json';

export interface Decay {
  channel: string;
  fraction: number;
}

export interface ParticleData {
  massGeV: number;
  widthGeV: number;
  charge: number;
  spin: number;
  decays: Decay[];
  source: string;
}

export type ParticleId = keyof typeof raw;

export const PARTICLES = raw as Record<ParticleId, ParticleData>;
export const PARTICLE_IDS = Object.keys(raw) as ParticleId[];
