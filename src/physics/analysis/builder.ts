import type { EventStore } from '../collision/eventStore';
import { Histogram, type HistogramSpec } from './histogram';
import type { Selection } from './selection';
import { applySelection } from './selection';
import { variableValue, type Variable } from './variables';

export interface BuiltHistogram {
  histogram: Histogram;
  variable: Variable;
  selection: Selection;
  /** Records and represented events that passed the selection. */
  passed: number;
  weight: number;
}

/** Histogram a variable over the records passing a selection. */
export function buildHistogram(store: EventStore, selection: Selection, variable: Variable, spec: HistogramSpec): BuiltHistogram {
  const { mask, passed, weight } = applySelection(store, selection);
  const histogram = new Histogram(spec);
  const c = store.columns;
  for (let i = 0; i < c.count; i++) {
    if (mask[i] === 0) continue;
    const value = variableValue(store, i, variable);
    if (Number.isNaN(value)) continue;
    histogram.fill(value, c.weight[i]!);
  }
  return { histogram, variable, selection, passed, weight };
}
