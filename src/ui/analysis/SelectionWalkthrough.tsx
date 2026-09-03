import { useI18n } from '../../i18n/I18nProvider';
import { defaultSelection, type Selection } from '../../physics/analysis/selection';
import type { WindowAnalysis } from '../../physics/analysis/window';
import type { ExplainerTopic } from '../explainers/Explainer';

/**
 * A worked example of a selection on the player's own Υ(1S) data: each step moves one knob
 * and shows what happened to the signal, the background and the significance in the window.
 * The Υ(1S) is chosen because the continuum under it is plainly visible, and because the
 * knobs do not all help there: the charge cut does, the pT and |η| cuts cost more than they
 * gain, which is the honest lesson about turning knobs.
 */

export const WALK_STEPS = ['data', 'look', 'noise', 'charge', 'pt', 'eta', 'done'] as const;
export type WalkStep = (typeof WALK_STEPS)[number];

export const WALK_WINDOW = { minGeV: 9.2, maxGeV: 9.7 };
export const WALK_RANGE = { min: 8.5, max: 11 };
export const WALK_BINS = 100;
/** Υ(1S) events in the window with the baseline selection before the example makes sense. */
export const WALK_MIN_SIGNAL = 500;

export const WALK_BASELINE_ID = 'mumu-walk-base';
export const WALK_EXAMPLE_ID = 'mumu-walk-example';

/** The two selections of the example at a given step: the untouched baseline and the one being tuned. */
export function walkSelections(step: WalkStep, baseName: string, exampleName: string): { baseline: Selection; example: Selection } {
  const baseline = defaultSelection(WALK_BASELINE_ID, baseName, 3);
  const index = WALK_STEPS.indexOf(step);
  const example: Selection = {
    ...defaultSelection(WALK_EXAMPLE_ID, exampleName, 3),
    charge: index >= WALK_STEPS.indexOf('charge') ? 'opposite' : 'any',
    // The pT cut is tried at one step and put back; the |η| cut likewise.
    ptMinGeV: step === 'pt' ? 5 : 3,
    etaMax: step === 'eta' ? 2.0 : null,
  };
  return { baseline, example };
}

interface Props {
  step: WalkStep;
  baseline: WindowAnalysis;
  example: WindowAnalysis;
  onStep(step: WalkStep): void;
  onClose(): void;
  onExplain(topic: ExplainerTopic): void;
}

export function SelectionWalkthrough({ step, baseline, example, onStep, onClose, onExplain }: Props) {
  const { t, number } = useI18n();
  const index = WALK_STEPS.indexOf(step);
  const ready = step !== 'data' || baseline.signal >= WALK_MIN_SIGNAL;
  const fmt = (x: number) => number(Math.round(x));
  const sig = (x: number) => `${number(x, { maximumFractionDigits: 1 })} σ`;
  const params = {
    S0: fmt(baseline.signal),
    B0: fmt(baseline.background),
    Z0: sig(baseline.significance),
    S: fmt(example.signal),
    B: fmt(example.background),
    Z: sig(example.significance),
    sqrtB: fmt(Math.sqrt(Math.max(1, example.background))),
    need: String(WALK_MIN_SIGNAL),
    have: fmt(Math.max(0, baseline.signal)),
  };
  const compare = index >= WALK_STEPS.indexOf('charge');

  return (
    <section className="panel walkthrough" aria-labelledby="walk-title">
      <div className="panel-head">
        <div>
          <span className="eyebrow">
            {t('walk.eyebrow')} · {index + 1} / {WALK_STEPS.length}
          </span>
          <h2 id="walk-title">{t(`walk.${step}.title`)}</h2>
        </div>
        <button type="button" onClick={onClose}>
          {t('walk.close')}
        </button>
      </div>
      <p className="walk-text">{t(`walk.${step}.text`, params)}</p>
      {step === 'noise' && (
        <button type="button" className="explain-button" onClick={() => onExplain('noise')}>
          {t('explainer.noise.title')}
        </button>
      )}
      {step === 'data' && !ready && (
        <p className="quiz-feedback warn">
          {t('walk.data.waiting', params)} <span className="mono">{params.have} / {params.need}</span>
        </p>
      )}
      {compare && (
        <table className="walk-table mono">
          <thead>
            <tr>
              <th></th>
              <th>{t('walk.col.baseline')}</th>
              <th>{t('walk.col.example')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('analysis.signal')}</td>
              <td className="n">{params.S0}</td>
              <td className="n">{params.S}</td>
            </tr>
            <tr>
              <td>{t('analysis.background')}</td>
              <td className="n">{params.B0}</td>
              <td className="n">{params.B}</td>
            </tr>
            <tr>
              <td>{t('analysis.significance')}</td>
              <td className="n">{params.Z0}</td>
              <td className={`n ${example.significance > baseline.significance ? 'ok' : 'warn'}`}>{params.Z}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="button-row">
        <button type="button" disabled={index === 0} onClick={() => onStep(WALK_STEPS[index - 1]!)}>
          {t('walk.back')}
        </button>
        {index < WALK_STEPS.length - 1 ? (
          <button type="button" className="primary" disabled={!ready} onClick={() => onStep(WALK_STEPS[index + 1]!)}>
            {t('walk.next')}
          </button>
        ) : (
          <button type="button" className="primary" onClick={onClose}>
            {t('walk.finish')}
          </button>
        )}
      </div>
    </section>
  );
}
