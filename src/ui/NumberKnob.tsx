import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Unit shown after the number field. */
  unit?: string;
  /** Digits after the decimal point in the field (defaults to those of `step`). */
  decimals?: number;
  disabled?: boolean;
  /** Fine step for the slider when it should be smoother than the field's step. */
  sliderStep?: number;
  onChange(value: number): void;
  children?: ReactNode;
}

function decimalsOf(step: number): number {
  const text = String(step);
  const point = text.indexOf('.');
  if (point >= 0) return text.length - point - 1;
  const exp = text.indexOf('e-');
  return exp >= 0 ? Number(text.slice(exp + 2)) : 0;
}

/**
 * A slider and a number field bound to the same value. The field accepts typed values,
 * clamps them to the range on commit, and keeps whatever the user is typing until then.
 */
export function NumberKnob(props: Props) {
  const { id, value, min, max, step, disabled } = props;
  const decimals = props.decimals ?? decimalsOf(step);
  const format = (v: number) => v.toFixed(decimals);
  const [text, setText] = useState(() => format(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing, decimals]);

  const parse = (raw: string): number | null => {
    const parsed = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || !Number.isFinite(parsed)) return null;
    return Math.min(max, Math.max(min, parsed));
  };

  const commit = (raw: string) => {
    const clamped = parse(raw);
    if (clamped !== null && clamped !== value) props.onChange(clamped);
  };

  /** Enter or blur: apply the typed value and show it formatted and clamped. */
  const finish = (raw: string) => {
    const clamped = parse(raw);
    if (clamped !== null && clamped !== value) props.onChange(clamped);
    setEditing(false);
    setText(format(clamped ?? value));
  };

  return (
    <div className="knob-head knob-row">
      <label htmlFor={id}>{props.label}</label>
      <span className="knob-field">
        <input
          id={`${id}-value`}
          type="number"
          inputMode="decimal"
          className="mono knob-input"
          value={text}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-label={props.label}
          onFocus={() => setEditing(true)}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onBlur={(e) => finish(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              finish(e.currentTarget.value);
              e.currentTarget.blur();
            }
          }}
        />
        {props.unit && <span className="knob-unit">{props.unit}</span>}
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={props.sliderStep ?? step}
        value={value}
        disabled={disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.children}
    </div>
  );
}
