import { useI18n } from '../i18n/I18nProvider';
import type { WindowAnalysis, MassWindow } from '../physics/analysis/window';
import type { SelectionCuts } from '../physics/detector/detector';
import { Hint } from './Hint';
import type { LevelAccess } from '../tutorial/levels';

interface Props {
  access: Pick<LevelAccess, 'ptCut' | 'massWindow'>;
  cuts: SelectionCuts;
  window: MassWindow;
  view: MassWindow;
  logScale: boolean;
  showKnownMasses: boolean;
  entries: number;
  analysis: WindowAnalysis;
  onCuts(cuts: SelectionCuts): void;
  onWindow(window: MassWindow): void;
  onView(view: MassWindow, window?: MassWindow): void;
  onLogScale(value: boolean): void;
  onShowKnownMasses(value: boolean): void;
  onReset(): void;
}

export const VIEW_PRESETS: { key: string; view: MassWindow; window: MassWindow }[] = [
  { key: 'analysis.view.all', view: { minGeV: 2, maxGeV: 200 }, window: { minGeV: 2.9, maxGeV: 3.3 } },
  { key: 'analysis.view.jpsi', view: { minGeV: 2.6, maxGeV: 3.6 }, window: { minGeV: 3.0, maxGeV: 3.2 } },
  { key: 'analysis.view.upsilon', view: { minGeV: 8.5, maxGeV: 11 }, window: { minGeV: 9.25, maxGeV: 9.65 } },
  { key: 'analysis.view.z', view: { minGeV: 60, maxGeV: 120 }, window: { minGeV: 84, maxGeV: 98 } },
];

const SOURCES = {
  histogram: 'https://en.wikipedia.org/wiki/Invariant_mass',
  window: 'https://en.wikipedia.org/wiki/Statistical_significance',
  ptCut: 'https://en.wikipedia.org/wiki/Transverse_momentum',
};

export function AnalysisPanel(props: Props) {
  const { t, number } = useI18n();
  const { analysis, access } = props;
  const lockTitle = t('tutorial.lockedKnob');

  const row = (label: string, value: string, className = '') => (
    <div className={`readout ${className}`}>
      <span className="readout-label">{label}</span>
      <span className="readout-value mono">{value}</span>
    </div>
  );

  const significanceClass = analysis.significance >= 5 ? 'ok' : analysis.significance >= 3 ? 'warn' : '';

  return (
    <section className="panel analysis" aria-labelledby="analysis-title">
      <h2 id="analysis-title">{t('analysis.title')}</h2>

      <div className="knob-head">
        <span>{t('analysis.view')}</span>
        <div className="segmented" role="group">
          {VIEW_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={props.view.minGeV === preset.view.minGeV && props.view.maxGeV === preset.view.maxGeV ? 'active' : ''}
              onClick={() => props.onView(preset.view, preset.window)}
            >
              {t(preset.key)}
            </button>
          ))}
        </div>
      </div>

      <div className="checks">
        <label>
          <input type="checkbox" checked={props.logScale} onChange={(e) => props.onLogScale(e.target.checked)} />
          {t('analysis.logScale')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.showKnownMasses}
            onChange={(e) => props.onShowKnownMasses(e.target.checked)}
          />
          {t('analysis.showKnown')}
        </label>
      </div>

      <div className={`knob ${access.massWindow ? '' : 'locked'}`} title={access.massWindow ? undefined : lockTitle}>
        <div className="knob-head">
          <span>{t('analysis.window')}</span>
          <span className="window-inputs">
            <label>
              {t('analysis.windowMin')}
              <input
                type="number"
                step="0.05"
                min={2}
                max={200}
                value={props.window.minGeV}
                disabled={!access.massWindow}
                onChange={(e) => props.onWindow({ ...props.window, minGeV: Number(e.target.value) })}
              />
            </label>
            <label>
              {t('analysis.windowMax')}
              <input
                type="number"
                step="0.05"
                min={2}
                max={200}
                value={props.window.maxGeV}
                disabled={!access.massWindow}
                onChange={(e) => props.onWindow({ ...props.window, maxGeV: Number(e.target.value) })}
              />
            </label>
          </span>
        </div>
        <Hint textKey="hint.window.what" href={SOURCES.window} />
      </div>

      <div className={`knob ${access.ptCut ? '' : 'locked'}`} title={access.ptCut ? undefined : lockTitle}>
        <div className="knob-head">
          <label htmlFor="pt-cut">{t('analysis.ptCut')}</label>
          <output htmlFor="pt-cut" className="mono">
            {number(props.cuts.muonPtMinGeV)} {t('unit.GeV')}
          </output>
        </div>
        <input
          id="pt-cut"
          type="range"
          min={3}
          max={50}
          step={1}
          value={props.cuts.muonPtMinGeV}
          disabled={!access.ptCut}
          onChange={(e) => props.onCuts({ muonPtMinGeV: Number(e.target.value) })}
        />
        <p className="note">{t('analysis.resetNote')}</p>
        <Hint textKey="hint.ptCut.what" href={SOURCES.ptCut} />
      </div>

      <div className="readout-group">
        {row(t('analysis.entries'), number(Math.round(props.entries)))}
        {row(t('analysis.observed'), number(Math.round(analysis.observed)))}
        {row(t('analysis.background'), number(Math.round(analysis.background)))}
        {row(t('analysis.signal'), number(Math.round(analysis.signal), { signDisplay: 'exceptZero' }))}
        {row(
          t('analysis.significance'),
          `${number(analysis.significance, { maximumFractionDigits: 1 })} ${t('unit.sigma')}`,
          significanceClass,
        )}
        <Hint textKey="hint.histogram.what" href={SOURCES.histogram} />
      </div>

      <div className="button-row">
        <button type="button" onClick={props.onReset}>
          {t('analysis.reset')}
        </button>
      </div>
    </section>
  );
}
