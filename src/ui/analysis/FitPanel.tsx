import { useI18n } from '../../i18n/I18nProvider';
import type { PeakFit } from '../../physics/analysis/fit';
import { Hint } from '../Hint';

interface Props {
  enabled: boolean;
  range: { min: number; max: number };
  guess: { mean: number; sigma: number };
  result: PeakFit | null;
  onRange(range: { min: number; max: number }): void;
  onGuess(guess: { mean: number; sigma: number }): void;
  onFit(): void;
}

export function FitPanel(props: Props) {
  const { t, number } = useI18n();
  const r = props.result;
  const pm = (value: number, error: number, digits: number) =>
    `${number(value, { maximumFractionDigits: digits })} ± ${number(Number.isFinite(error) ? error : 0, { maximumFractionDigits: digits })}`;

  return (
    <section className="panel fit-panel" aria-labelledby="fit-title">
      <div className="panel-head">
        <h2 id="fit-title">{t('fit.title')}</h2>
        <Hint textKey="hint.fit.what" href="https://en.wikipedia.org/wiki/Relativistic_Breit%E2%80%93Wigner_distribution" />
      </div>
      <p className="note">{props.enabled ? t('fit.model') : t('fit.onlyMass')}</p>
      <div className="form-grid">
        <label>
          <span>{t('fit.range')}</span>
          <span className="window-inputs">
            <input type="number" step={0.1} value={props.range.min} disabled={!props.enabled} onChange={(e) => props.onRange({ ...props.range, min: Number(e.target.value) })} />
            <span>–</span>
            <input type="number" step={0.1} value={props.range.max} disabled={!props.enabled} onChange={(e) => props.onRange({ ...props.range, max: Number(e.target.value) })} />
          </span>
        </label>
        <label>
          <span>{t('fit.guessMean')}</span>
          <input type="number" className="mono knob-input" step={0.1} value={props.guess.mean} disabled={!props.enabled} onChange={(e) => props.onGuess({ ...props.guess, mean: Number(e.target.value) })} />
        </label>
        <label>
          <span>{t('fit.guessSigma')}</span>
          <input type="number" className="mono knob-input" step={0.05} value={props.guess.sigma} disabled={!props.enabled} onChange={(e) => props.onGuess({ ...props.guess, sigma: Number(e.target.value) })} />
        </label>
      </div>
      <div className="button-row">
        <button type="button" className="primary" onClick={props.onFit} disabled={!props.enabled}>
          {t('fit.run')}
        </button>
      </div>
      {r && (
        <div className="readout-group">
          {!r.converged && <p className="quiz-feedback warn">{t('fit.notConverged')}</p>}
          <div className="readout">
            <span className="readout-label">{t('fit.mean')}</span>
            <span className="readout-value mono">{pm(r.mean, r.meanError, 3)} {t('unit.GeV')}</span>
          </div>
          <div className="readout">
            <span className="readout-label">{t('fit.sigma')}</span>
            <span className="readout-value mono">{pm(r.sigma, r.sigmaError, 3)} {t('unit.GeV')}</span>
          </div>
          <div className="readout">
            <span className="readout-label">{t('fit.yield')}</span>
            <span className="readout-value mono">{pm(Math.round(r.yield), Math.round(r.yieldError), 0)}</span>
          </div>
          <div className="readout">
            <span className="readout-label">{t('fit.backgroundUnder')}</span>
            <span className="readout-value mono">{number(Math.round(r.backgroundUnderPeak))}</span>
          </div>
          <div className="readout">
            <span className="readout-label">{t('fit.chi2')}</span>
            <span className="readout-value mono">
              {number(r.chi2, { maximumFractionDigits: 0 })} / {r.ndf}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
