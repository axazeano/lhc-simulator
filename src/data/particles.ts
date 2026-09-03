import raw from './particles.json';

export interface ParticleData {
  massGeV: number;
  widthGeV: number;
  source: string;
}

export type ParticleId = keyof typeof raw;

export const PARTICLES = raw as Record<ParticleId, ParticleData>;
export const PARTICLE_IDS = Object.keys(raw) as ParticleId[];
