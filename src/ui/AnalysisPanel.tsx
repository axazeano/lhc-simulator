import { useI18n } from '../i18n/I18nProvider';
import type { WindowAnalysis, MassWindow } from '../physics/analysis/window';
import { CHANNELS, CHANNEL_DEFINITIONS, type Channel } from '../physics/collision/channels';
import type { SelectionCuts } from '../physics/detector/detector';
import type { LevelAccess } from '../tutorial/levels';
import { Hint } from './Hint';
import { NumberKnob } from './NumberKnob';

interface Props {
  access: Pick<LevelAccess, 'ptCut' | 'massWindow' | 'channel'>;
  channel: Channel;
  cuts: SelectionCuts;
  window: MassWindow;
  view: MassWindow;
  logScale: boolean;
  showKnownMasses: boolean;
  entries: number;
  analysis: WindowAnalysis;
  onChannel(channel: Channel): void;
  onCuts(cuts: SelectionCuts): void;
  onWindow(window: MassWindow): void;
  onView(view: MassWindow, window?: MassWindow): void;
  onLogScale(value: boolean): void;
  onShowKnownMasses(value: boolean): void;
  onReset(): void;
}

export interface ViewPreset {
  key: string;
  view: MassWindow;
  window: MassWindow;
}

export const VIEW_PRESETS: Record<Channel, ViewPreset[]> = {
  mumu: [
    { key: 'analysis.view.all', view: { minGeV: 2, maxGeV: 200 }, window: { minGeV: 2.9, maxGeV: 3.3 } },
    { key: 'analysis.view.jpsi', view: { minGeV: 2.6, maxGeV: 3.6 }, window: { minGeV: 3.0, maxGeV: 3.2 } },
    { key: 'analysis.view.upsilon', view: { minGeV: 8.5, maxGeV: 11 }, window: { minGeV: 9.25, maxGeV: 9.65 } },
    { key: 'analysis.view.z', view: { minGeV: 60, maxGeV: 120 }, window: { minGeV: 84, maxGeV: 98 } },
  ],
  gammagamma: [
    { key: 'analysis.view.gg.all', view: { minGeV: 80, maxGeV: 200 }, window: { minGeV: 121, maxGeV: 129 } },
    { key: 'analysis.view.gg.higgs', view: { minGeV: 100, maxGeV: 160 }, window: { minGeV: 121, maxGeV: 129 } },
  ],
  fourlepton: [
    { key: 'analysis.view.fl.all', view: { minGeV: 70, maxGeV: 400 }, window: { minGeV: 118, maxGeV: 132 } },
    { key: 'analysis.view.fl.z', view: { minGeV: 80, maxGeV: 100 }, window: { minGeV: 88, maxGeV: 94 } },
    { key: 'analysis.view.fl.higgs', view: { minGeV: 110, maxGeV: 140 }, window: { minGeV: 118, maxGeV: 132 } },
  ],
};

const SOURCES = {
  histogram: 'https://en.wikipedia.org/wiki/Invariant_mass',
  window: 'https://en.wikipedia.org/wiki/Statistical_significance',
  ptCut: 'https://en.wikipedia.org/wiki/Transverse_momentum',
  channel: 'https://en.wikipedia.org/wiki/Higgs_boson#Decay',
};

export function AnalysisPanel(props: Props) {
  const { t, number } = useI18n();
  const { analysis, access, channel } = props;
  const lockTitle = t('tutorial.lockedKnob');
  const definition = CHANNEL_DEFINITIONS[channel];
  const presets = VIEW_PRESETS[channel];

  const row = (label: string, value: string, className = '') => (
    <div className={`readout ${className}`}>
      <span className="readout-label">{label}</span>
      <span className="readout-value mono">{value}</span>
    </div>
  );

  const significanceClass = analysis.significance >= 5 ? 'ok' : analysis.significance >= 3 ? 'warn' : '';

  return (
    <section className="panel analysis" aria-labelledby="analysis-title">
      <h2 id="analysis-title">{t('analysis.titleChannel', { channel: t(`channel.${channel}`) })}</h2>

      <div className={`knob-head ${access.channel ? '' : 'locked'}`} title={access.channel ? undefined : lockTitle}>
        <span>{t('analysis.channel')}</span>
        <div className="segmented" role="radiogroup" aria-label={t('analysis.channel')}>
          {CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={channel === c}
              className={channel === c ? 'active' : ''}
              disabled={!access.channel}
              onClick={() => props.onChannel(c)}
            >
              {t(`channel.${c}`)}
            </button>
          ))}
        </div>
      </div>
      <Hint textKey="hint.channel.what" href={SOURCES.channel} />

      <div className="knob-head">
        <span>{t('analysis.view')}</span>
        <div className="segmented" role="group">
          {presets.map((preset) => (
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
                min={definition.spec.min}
                max={definition.spec.max}
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
                min={definition.spec.min}
                max={definition.spec.max}
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
        <NumberKnob
          id="pt-cut"
          label={channel === 'mumu' ? t('analysis.ptCut') : t('analysis.ptCutParticle')}
          value={props.cuts.ptMinGeV}
          min={definition.ptMinRange[0]}
          max={definition.ptMinRange[1]}
          step={0.5}
          sliderStep={1}
          unit={t('unit.GeV')}
          disabled={!access.ptCut}
          onChange={(v) => props.onCuts({ ptMinGeV: v })}
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
