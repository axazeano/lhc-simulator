import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Random } from '../../physics/random';
import { ExplainerSection, Live } from './Explainer';
import { Formula } from './Formula';

/**
 * Signal, background and noise on a mass plot, with a toy spectrum the reader can play with:
 * a falling background, an optional peak, and Poisson fluctuations that shrink relative to the
 * counts as the statistics grow.
 */

const BINS = 60;
const PEAK_CENTRE = 30;
const PEAK_SIGMA = 1.5;
/** Fraction of all events that belong to the peak. */
const PEAK_FRACTION = 0.03;
const WINDOW = { min: 27, max: 33 };

const W = 640;
const H = 260;
const M = { left: 44, right: 12, top: 22, bottom: 30 };

function expected(n: number, peak: boolean): { total: number[]; background: number[] } {
  const bg: number[] = [];
  let bgSum = 0;
  for (let i = 0; i < BINS; i++) {
    const x = i + 0.5;
    const v = Math.exp(-x / 22);
    bg.push(v);
    bgSum += v;
  }
  const total: number[] = [];
  const background: number[] = [];
  for (let i = 0; i < BINS; i++) {
    const x = i + 0.5;
    const b = (n * (1 - PEAK_FRACTION) * bg[i]!) / bgSum;
    const s = peak ? ((n * PEAK_FRACTION) / (PEAK_SIGMA * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - PEAK_CENTRE) / PEAK_SIGMA) ** 2) : 0;
    background.push(b);
    total.push(b + s);
  }
  return { total, background };
}

export function NoiseExplainer() {
  const { t, number } = useI18n();
  const [logN, setLogN] = useState(3);
  const [peak, setPeak] = useState(true);
  const [showNoise, setShowNoise] = useState(true);
  const [seed, setSeed] = useState(1);
  const n = Math.round(10 ** logN);

  const model = useMemo(() => expected(n, peak), [n, peak]);
  const observed = useMemo(() => {
    const rng = new Random(seed * 7919 + 17);
    return model.total.map((mu) => rng.poisson(mu));
  }, [model, seed]);

  const windowStats = useMemo(() => {
    let s = 0;
    let b = 0;
    let obs = 0;
    for (let i = WINDOW.min; i < WINDOW.max; i++) {
      b += model.background[i]!;
      s += model.total[i]! - model.background[i]!;
      obs += observed[i]!;
    }
    return { signal: s, background: b, observed: obs, significance: s / Math.sqrt(Math.max(1, b)) };
  }, [model, observed]);

  const maxY = Math.max(1, ...observed, ...model.total.map((v, i) => v + Math.sqrt(model.background[i]!)));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const xOf = (x: number) => M.left + (x / BINS) * plotW;
  const yOf = (v: number) => M.top + plotH - (Math.max(0, v) / maxY) * plotH;
  const colW = plotW / BINS;
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i + 0.5).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ');
  const band = `${path(model.background.map((b) => b + Math.sqrt(b)))} ${[...model.background.keys()]
    .reverse()
    .map((i) => `L${xOf(i + 0.5).toFixed(1)} ${yOf(model.background[i]! - Math.sqrt(model.background[i]!)).toFixed(1)}`)
    .join(' ')} Z`;

  return (
    <div className="explainer-content">
      <p className="explainer-lede">{t('explainer.noise.lede')}</p>

      <ExplainerSection title={t('explainer.noise.three.title')} text={t('explainer.noise.three.text')}>
        <svg viewBox={`0 0 ${W} ${H}`} className="figure" role="img" aria-label={t('explainer.noise.three.title')}>
          <rect x={xOf(WINDOW.min)} y={M.top} width={xOf(WINDOW.max) - xOf(WINDOW.min)} height={plotH} fill="var(--accent)" opacity="0.14" />
          <rect x={xOf(WINDOW.min - 12)} y={M.top} width={xOf(WINDOW.min) - xOf(WINDOW.min - 12)} height={plotH} fill="var(--surface-2)" opacity="0.6" />
          <rect x={xOf(WINDOW.max)} y={M.top} width={xOf(WINDOW.max + 12) - xOf(WINDOW.max)} height={plotH} fill="var(--surface-2)" opacity="0.6" />
          <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + plotH} stroke="var(--line)" />
          <line x1={M.left} y1={M.top + plotH} x2={M.left + plotW} y2={M.top + plotH} stroke="var(--line)" />
          {observed.map((v, i) => (
            <rect key={i} x={xOf(i) + 0.5} y={yOf(v)} width={Math.max(1, colW - 1)} height={M.top + plotH - yOf(v)} fill="var(--accent)" />
          ))}
          {showNoise && <path d={band} fill="var(--peak)" opacity="0.28" />}
          <path d={path(model.background)} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="6 4" />
          <text x={(xOf(WINDOW.min) + xOf(WINDOW.max)) / 2} y={M.top + 14} fontSize="11" fontWeight="600" fill="var(--accent)" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif">
            {t('explainer.noise.label.window')}
          </text>
          <text x={(xOf(WINDOW.min - 12) + xOf(WINDOW.min)) / 2} y={M.top + 14} fontSize="11" fill="var(--ink-2)" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif">
            {t('explainer.noise.label.sideband')}
          </text>
          <text x={(xOf(WINDOW.max) + xOf(WINDOW.max + 12)) / 2} y={M.top + 14} fontSize="11" fill="var(--ink-2)" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif">
            {t('explainer.noise.label.sideband')}
          </text>
          <text x={xOf(8)} y={yOf(model.background[7]!) - 8} fontSize="11" fill="var(--ink)" fontFamily="IBM Plex Sans, sans-serif">
            {t('explainer.noise.label.background')}
          </text>
          {showNoise && (
            <text x={xOf(46)} y={yOf(model.background[45]! + Math.sqrt(model.background[45]!)) - 8} fontSize="11" fill="var(--peak)" fontFamily="IBM Plex Sans, sans-serif">
              {t('explainer.noise.label.noise')}
            </text>
          )}
          <text x={M.left + plotW} y={H - 8} fontSize="11" fill="var(--ink-2)" textAnchor="end" fontFamily="IBM Plex Mono, monospace">
            {t('explainer.noise.axis')}
          </text>
        </svg>
        <div className="form-grid noise-controls">
          <label>
            <span>
              {t('explainer.noise.events')}: <span className="mono">{number(n)}</span>
            </span>
            <input type="range" min={2} max={6} step={0.05} value={logN} onChange={(e) => setLogN(Number(e.target.value))} />
          </label>
          <label className="check">
            <input type="checkbox" checked={peak} onChange={(e) => setPeak(e.target.checked)} />
            {t('explainer.noise.peakOn')}
          </label>
          <label className="check">
            <input type="checkbox" checked={showNoise} onChange={(e) => setShowNoise(e.target.checked)} />
            {t('explainer.noise.showNoise')}
          </label>
          <button type="button" onClick={() => setSeed((s) => s + 1)}>
            {t('explainer.noise.reroll')}
          </button>
        </div>
        <div className="live-row">
          <Live label={t('explainer.noise.live.observed')} value={number(windowStats.observed)} />
          <Live label={t('explainer.noise.live.background')} value={number(Math.round(windowStats.background))} />
          <Live label={t('explainer.noise.live.noise')} value={`±${number(Math.round(Math.sqrt(windowStats.background)))}`} />
          <Live label={t('explainer.noise.live.signal')} value={number(Math.round(windowStats.signal))} />
          <Live label={t('explainer.noise.live.significance')} value={`${number(windowStats.significance, { maximumFractionDigits: 1 })} σ`} />
        </div>
      </ExplainerSection>

      <ExplainerSection title={t('explainer.noise.sqrt.title')} text={t('explainer.noise.sqrt.text')}>
        <Formula
          formula="Z = S / √B"
          symbols={[
            { symbol: 'Z', meaning: t('sym.sigZ'), value: `${number(windowStats.significance, { maximumFractionDigits: 1 })} σ` },
            { symbol: 'S', meaning: t('sym.sigS'), value: number(Math.round(windowStats.signal)) },
            { symbol: 'B', meaning: t('sym.sigB'), value: number(Math.round(windowStats.background)) },
            { symbol: '√B', meaning: t('sym.sigSqrtB'), value: number(Math.round(Math.sqrt(windowStats.background))) },
          ]}
        />
      </ExplainerSection>

      <ExplainerSection title={t('explainer.noise.rules.title')} text="">
        <ul className="explainer-list">
          <li>{t('explainer.noise.rules.1')}</li>
          <li>{t('explainer.noise.rules.2')}</li>
          <li>{t('explainer.noise.rules.3')}</li>
          <li>{t('explainer.noise.rules.4')}</li>
          <li>{t('explainer.noise.rules.5')}</li>
        </ul>
      </ExplainerSection>

      <ExplainerSection title={t('explainer.noise.trap.title')} text={t('explainer.noise.trap.text')} />
      <p className="note">
        <a href="https://en.wikipedia.org/wiki/Statistical_significance" target="_blank" rel="noreferrer">
          {t('tutorial.source')} ↗
        </a>
      </p>
    </div>
  );
}
