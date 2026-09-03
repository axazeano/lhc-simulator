import raw from './lhc-parameters.json';

export interface SourcedValue {
  value: number;
  unit: string;
  source: string;
}

type ParameterKey = keyof typeof raw;

const parameters = raw as Record<ParameterKey, SourcedValue>;

/** Numeric LHC machine parameters. Use `lhcParameterSource` to show where a number comes from. */
export const LHC = Object.fromEntries(
  (Object.keys(parameters) as ParameterKey[]).map((key) => [key, parameters[key].value]),
) as Record<ParameterKey, number>;

export function lhcParameterSource(key: ParameterKey): SourcedValue {
  return parameters[key];
}

export const LHC_PARAMETER_KEYS = Object.keys(parameters) as ParameterKey[];
