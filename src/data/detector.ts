import raw from './detector.json';
import type { SourcedValue } from './lhc';

type DetectorKey = keyof typeof raw;

const parameters = raw as Record<DetectorKey, SourcedValue>;

export const DETECTOR = Object.fromEntries(
  (Object.keys(parameters) as DetectorKey[]).map((key) => [key, parameters[key].value]),
) as Record<DetectorKey, number>;

export function detectorParameterSource(key: DetectorKey): SourcedValue {
  return parameters[key];
}
