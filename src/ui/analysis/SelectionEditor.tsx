import { useI18n } from '../../i18n/I18nProvider';
import type { Selection } from '../../physics/analysis/selection';
import { Hint } from '../Hint';

interface Props {
  selections: Selection[];
  activeId: string;
  overlayId: string | null;
  fills: { fill: number; records: number }[];
  stats: { passed: number; weight: number; total: number } | null;
  ptRange: [number, number];
  massRange: [number, number];
  onSelect(id: string): void;
  onOverlay(id: string | null): void;
  onChange(selection: Selection): void;
  onAdd(): void;
  onDelete(id: string): void;
}

function numberOrNull(raw: string): number | null {
  if (raw.trim() === '') return null;
  const v = Number(raw.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

export function SelectionEditor(props: Props) {
  const { t, number } = useI18n();
  const active = props.selections.find((s) => s.id === props.activeId) ?? props.selections[0]!;
  const set = (patch: Partial<Selection>) => props.onChange({ ...active, ...patch });
  const optional = (value: number | null) => (value === null ? '' : String(value));

  return (
    <section className="panel selection-editor" aria-labelledby="selection-title">
      <div className="panel-head">
        <h2 id="selection-title">{t('selection.title')}</h2>
        <Hint textKey="hint.selection.what" href="https://en.wikipedia.org/wiki/Event_selection" />
      </div>

      <div className="selection-list">
        {props.selections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`level-chip ${s.id === active.id ? 'current' : ''}`}
            onClick={() => props.onSelect(s.id)}
          >
            <span className="level-name">{s.name}</span>
          </button>
        ))}
        <div className="button-row">
          <button type="button" onClick={props.onAdd}>
            {t('selection.duplicate')}
          </button>
          <button type="button" onClick={() => props.onDelete(active.id)} disabled={props.selections.length <= 1}>
            {t('selection.delete')}
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label>
          <span>{t('selection.name')}</span>
          <input type="text" value={active.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          <span>{t('selection.ptMin')}</span>
          <span className="knob-field">
            <input
              type="number"
              className="mono knob-input"
              min={props.ptRange[0]}
              max={props.ptRange[1]}
              step={0.5}
              value={active.ptMinGeV}
              onChange={(e) => set({ ptMinGeV: Math.max(props.ptRange[0], Number(e.target.value)) })}
            />
            <span className="knob-unit">{t('unit.GeV')}</span>
          </span>
        </label>
        <label>
          <span>{t('selection.leadingPt')}</span>
          <span className="knob-field">
            <input type="number" className="mono knob-input" step={1} value={optional(active.leadingPtMinGeV)} onChange={(e) => set({ leadingPtMinGeV: numberOrNull(e.target.value) })} />
            <span className="knob-unit">{t('unit.GeV')}</span>
          </span>
        </label>
        <label>
          <span>{t('selection.etaMax')}</span>
          <input type="number" className="mono knob-input" step={0.1} min={0} max={2.5} value={optional(active.etaMax)} onChange={(e) => set({ etaMax: numberOrNull(e.target.value) })} />
        </label>
        <label>
          <span>{t('selection.charge')}</span>
          <select value={active.charge} onChange={(e) => set({ charge: e.target.value as Selection['charge'] })}>
            {(['any', 'opposite', 'same'] as const).map((c) => (
              <option key={c} value={c}>
                {t(`selection.charge.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('selection.mass')}</span>
          <span className="window-inputs">
            <input type="number" step={0.1} min={props.massRange[0]} max={props.massRange[1]} value={optional(active.massMinGeV)} onChange={(e) => set({ massMinGeV: numberOrNull(e.target.value) })} />
            <span>–</span>
            <input type="number" step={0.1} min={props.massRange[0]} max={props.massRange[1]} value={optional(active.massMaxGeV)} onChange={(e) => set({ massMaxGeV: numberOrNull(e.target.value) })} />
            <span className="knob-unit">{t('unit.GeV')}</span>
          </span>
        </label>
        <label>
          <span>{t('selection.fills')}</span>
          <span className="checks">
            <label>
              <input type="checkbox" checked={active.fills === null} onChange={(e) => set({ fills: e.target.checked ? null : props.fills.map((f) => f.fill) })} />
              {t('selection.fillsAll')}
            </label>
            {active.fills !== null &&
              props.fills.map((f) => (
                <label key={f.fill}>
                  <input
                    type="checkbox"
                    checked={active.fills!.includes(f.fill)}
                    onChange={(e) => {
                      const current = new Set(active.fills!);
                      if (e.target.checked) current.add(f.fill);
                      else current.delete(f.fill);
                      set({ fills: [...current].sort((a, b) => a - b) });
                    }}
                  />
                  <span className="mono">
                    #{f.fill} ({number(f.records)})
                  </span>
                </label>
              ))}
          </span>
        </label>
        <label>
          <span>{t('selection.compare')}</span>
          <select value={props.overlayId ?? ''} onChange={(e) => props.onOverlay(e.target.value === '' ? null : e.target.value)}>
            <option value="">{t('selection.none')}</option>
            {props.selections
              .filter((s) => s.id !== active.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      {props.stats && (
        <div className="readout-group">
          <div className="readout">
            <span className="readout-label">{t('selection.passed')}</span>
            <span className="readout-value mono">{number(props.stats.passed)}</span>
          </div>
          <div className="readout">
            <span className="readout-label">{t('selection.weight')}</span>
            <span className="readout-value mono">{number(Math.round(props.stats.weight))}</span>
          </div>
          <div className="readout">
            <span className="readout-label">{t('selection.efficiency')}</span>
            <span className="readout-value mono">
              {props.stats.total > 0 ? `${number((100 * props.stats.weight) / props.stats.total, { maximumFractionDigits: 1 })} %` : '—'}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
