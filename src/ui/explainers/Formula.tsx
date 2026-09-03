import type { ReactNode } from 'react';

export interface Symbol {
  symbol: string;
  meaning: string;
  /** Current value, when the quantity is live. */
  value?: string;
}

interface Props {
  /** The formula itself, monospace. */
  formula: ReactNode;
  symbols: Symbol[];
}

/** A formula followed by a legend: every letter, what it means, and its current value. */
export function Formula({ formula, symbols }: Props) {
  return (
    <div className="formula-block">
      <div className="formula-line mono">{formula}</div>
      <dl className="legend">
        {symbols.map((s) => (
          <div key={s.symbol} className="legend-row">
            <dt className="mono">{s.symbol}</dt>
            <dd>
              {s.meaning}
              {s.value && <span className="legend-value mono">{s.value}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
