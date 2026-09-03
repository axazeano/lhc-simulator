import type { HistogramSpec } from '../analysis/histogram';

/** Final states the detector reconstructs and histograms separately. */
export type Channel = 'mumu' | 'gammagamma' | 'fourlepton';

export const CHANNELS: readonly Channel[] = ['mumu', 'gammagamma', 'fourlepton'];

export interface ChannelDefinition {
  /** Histogram range and binning of the invariant mass. */
  spec: HistogramSpec;
  /** Default per-particle pT threshold in GeV. */
  defaultPtMinGeV: number;
  /** Minimum and maximum pT threshold the analysis knob allows. */
  ptMinRange: [number, number];
  /** Events with an invariant mass at or above this are recorded without prescale (a "physics stream"). */
  unprescaledFromGeV: number;
}

export const CHANNEL_DEFINITIONS: Record<Channel, ChannelDefinition> = {
  mumu: { spec: { min: 2, max: 200, bins: 9900 }, defaultPtMinGeV: 3, ptMinRange: [3, 50], unprescaledFromGeV: 60 },
  gammagamma: { spec: { min: 80, max: 200, bins: 2400 }, defaultPtMinGeV: 30, ptMinRange: [15, 80], unprescaledFromGeV: 0 },
  fourlepton: { spec: { min: 70, max: 400, bins: 3300 }, defaultPtMinGeV: 7, ptMinRange: [5, 30], unprescaledFromGeV: 0 },
};

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);
}
