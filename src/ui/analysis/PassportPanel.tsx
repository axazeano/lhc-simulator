import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { buildHistogram } from '../../physics/analysis/builder';
import type { PeakFit } from '../../physics/analysis/fit';
import {
  comparePassports,
  crossSectionFromYield,
  estimateWidth,
  matchKnownParticle,
  simulateResponse,
  type KnownPassport,
  type MeasuredPassport,
  type PassportComparison,
  type ResonanceResponse,
  type Verdict,
} from '../../physics/analysis/passport';
import type { Selection } from '../../physics/analysis/selection';
import { analyseWindow } from '../../physics/analysis/window';
import type { Channel } from '../../physics/collision/channels';
import type { EventStore } from '../../physics/collision/eventStore';
import { RECORDING_CUTS } from '../../physics/collision/run';
import { Random } from '../../physics/random';
import { Hint } from '../Hint';

interface Props {
  store: EventStore;
  runVersion: number;
  channel: Channel;
  selection: Selection;
  fit: PeakFit | null;
  integratedLuminosityM2: number;
  sqrtSGeV: number;
}

export interface CatalogEntry {
  id: string;
  name: string;
  channel: Channel;
  massGeV: number;
  massErrorGeV: number;
  widthGeV: number | null;
  sqrtSGeV: number;
  matchedId: string | null;
  date: string;
}

const CATALOG_KEY = 'lhc-simulator.catalog';

export function loadCatalog(): CatalogEntry[] {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    return raw ? (JSON.parse(raw) as CatalogEntry[]) : [];
  } catch {
    return [];
  }
}

function saveCatalog(entries: CatalogEntry[]): void {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

const PARTICLE_LABELS: Record<string, string> = {
  jpsi: 'J/ψ',
  upsilon1s: 'Υ(1S)',
  upsilon2s: 'Υ(2S)',
  upsilon3s: 'Υ(3S)',
  z: 'Z',
  w: 'W',
  higgs: 'H',
  muon: 'μ',
};

export function PassportPanel(props: Props) {
  const { t, number, scientific } = useI18n();
  const { fit, channel, selection, store, sqrtSGeV } = props;
  const [response, setResponse] = useState<ResonanceResponse | null>(null);
  const [known, setKnown] = useState<KnownPassport | null | 'none'>(null);
  const [name, setName] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[]>(() => loadCatalog());

  // A new fit invalidates the response simulation and the comparison.
  useEffect(() => {
    setResponse(null);
    setKnown(null);
  }, [fit, channel]);

  // Charge of the products: compare opposite-sign and same-sign yields in the peak window.
  const chargeInferred = useMemo(() => {
    if (!fit) return null;
    if (channel === 'gammagamma') return 0;
    const spec = { min: fit.range.min, max: fit.range.max, bins: 200 };
    const window = { minGeV: fit.mean - 2 * fit.sigma, maxGeV: fit.mean + 2 * fit.sigma };
    const os = analyseWindow(buildHistogram(store, { ...selection, charge: 'opposite' }, 'mass', spec).histogram, window);
    const ss = analyseWindow(buildHistogram(store, { ...selection, charge: 'same' }, 'mass', spec).histogram, window);
    if (os.signal <= 0 && ss.signal <= 0) return null;
    if (os.signal > 5 * Math.max(0, ss.signal) && os.significance > 3) return 0;
    if (ss.signal > 5 * Math.max(0, os.signal) && ss.significance > 3) return 2;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, channel, selection, store, props.runVersion]);

  const measured: MeasuredPassport | null = useMemo(() => {
    if (!fit || !response) return null;
    return {
      massGeV: fit.mean,
      massErrorGeV: fit.meanError,
      width: estimateWidth(fit, response.resolutionRel),
      chargeInferred,
      crossSection: crossSectionFromYield(fit.yield, fit.yieldError, response.acceptance, props.integratedLuminosityM2),
    };
  }, [fit, response, chargeInferred, props.integratedLuminosityM2]);

  const comparison: PassportComparison | null = useMemo(
    () => (measured && known && known !== 'none' ? comparePassports(measured, known) : null),
    [measured, known],
  );

  const simulate = () => {
    if (!fit) return;
    setResponse(simulateResponse(channel, fit.mean, sqrtSGeV, selection, RECORDING_CUTS[channel], new Random(Date.now() >>> 0)));
  };
  const compare = () => {
    if (!fit) return;
    setKnown(matchKnownParticle(fit.mean, fit.meanError, channel, sqrtSGeV) ?? 'none');
  };
  const record = () => {
    if (!fit || !measured) return;
    const entry: CatalogEntry = {
      id: `${Date.now()}`,
      name: name.trim() || `X(${number(fit.mean, { maximumFractionDigits: 1 })})`,
      channel,
      massGeV: fit.mean,
      massErrorGeV: fit.meanError,
      widthGeV: measured.width.widthGeV,
      sqrtSGeV,
      matchedId: known && known !== 'none' ? known.id : null,
      date: new Date().toISOString().slice(0, 10),
    };
    const next = [...catalog, entry];
    setCatalog(next);
    saveCatalog(next);
    setName('');
  };
  const removeEntry = (id: string) => {
    const next = catalog.filter((e) => e.id !== id);
    setCatalog(next);
    saveCatalog(next);
  };

  const mark = (v: Verdict | undefined) => (v === 'match' ? '✓' : v === 'mismatch' ? '✗' : '?');
  const markClass = (v: Verdict | undefined) => (v === 'match' ? 'ok' : v === 'mismatch' ? 'bad' : '');
  const pm = (value: number, error: number, digits: number) =>
    `${number(value, { maximumFractionDigits: digits })} ± ${number(Number.isFinite(error) ? error : 0, { maximumFractionDigits: digits })}`;
  const knownData = known && known !== 'none' ? known : null;

  return (
    <section className="panel passport-panel" aria-labelledby="passport-title">
      <div className="panel-head">
        <h2 id="passport-title">{t('passport.title')}</h2>
        <Hint textKey="hint.passport.what" href="https://pdglive.lbl.gov/" />
      </div>

      {catalog.length > 0 && (
        <div className="catalog">
          <span className="eyebrow">{t('passport.catalog')}</span>
          <div className="catalog-list">
            {catalog.map((e) => (
              <span key={e.id} className="catalog-chip mono" title={`${t(`channel.${e.channel}`)} · ${e.date}`}>
                {e.name} · {number(e.massGeV, { maximumFractionDigits: 2 })} {t('unit.GeV')}
                {e.matchedId && <span className="dim"> = {PARTICLE_LABELS[e.matchedId] ?? e.matchedId}</span>}
                <button type="button" className="chip-remove" aria-label={t('selection.delete')} onClick={() => removeEntry(e.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {!fit && <p className="note">{t('passport.needFit')}</p>}

      {fit && (
        <>
          <div className="button-row">
            <button type="button" className="primary" onClick={simulate}>
              {t('passport.simulate')}
            </button>
            <button type="button" onClick={compare} disabled={!measured}>
              {t('passport.compare')}
            </button>
          </div>
          <p className="note">{t('passport.simulateNote', { n: number(4000) })}</p>

          <div className="tbl-wrap">
            <table className="passport-table">
              <thead>
                <tr>
                  <th>{t('passport.property')}</th>
                  <th>{t('passport.how')}</th>
                  <th className="n">{t('passport.measured')}</th>
                  <th className="n">{knownData ? `${t('passport.known')}: ${PARTICLE_LABELS[knownData.id] ?? knownData.id}` : t('passport.known')}</th>
                  <th className="n">{t('passport.verdict')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('passport.mass')}</td>
                  <td className="dim">{t('passport.mass.how')}</td>
                  <td className="n">{pm(fit.mean, fit.meanError, 3)} {t('unit.GeV')}</td>
                  <td className="n">{knownData ? `${number(knownData.data.massGeV, { maximumFractionDigits: 4 })} ${t('unit.GeV')}` : '—'}</td>
                  <td className={`n ${markClass(comparison?.mass)}`}>{comparison ? mark(comparison.mass) : ''}</td>
                </tr>
                <tr>
                  <td>{t('passport.resolution')}</td>
                  <td className="dim">{t('passport.resolution.how')}</td>
                  <td className="n">{response ? `${number(100 * response.resolutionRel, { maximumFractionDigits: 2 })} % · ${t('passport.acceptance')} ${number(100 * response.acceptance, { maximumFractionDigits: 1 })} %` : '—'}</td>
                  <td className="n">—</td>
                  <td className="n"></td>
                </tr>
                <tr>
                  <td>{t('passport.width')}</td>
                  <td className="dim">{t('passport.width.how')}</td>
                  <td className="n">
                    {measured
                      ? measured.width.widthGeV !== null
                        ? `${pm(measured.width.widthGeV, measured.width.widthErrorGeV, 3)} ${t('unit.GeV')}`
                        : `< ${number(measured.width.widthUpperLimitGeV, { maximumFractionDigits: 3 })} ${t('unit.GeV')}`
                      : '—'}
                  </td>
                  <td className="n">{knownData ? `${number(knownData.data.widthGeV, { maximumSignificantDigits: 3 })} ${t('unit.GeV')}` : '—'}</td>
                  <td className={`n ${markClass(comparison?.width)}`}>{comparison ? mark(comparison.width) : ''}</td>
                </tr>
                <tr>
                  <td>{t('passport.lifetime')}</td>
                  <td className="dim">{t('passport.lifetime.how')}</td>
                  <td className="n">
                    {measured
                      ? measured.width.lifetimeS !== null
                        ? `${scientific(measured.width.lifetimeS, 1)} ${t('unit.s')}`
                        : `> ${scientific(6.582119569e-25 / measured.width.widthUpperLimitGeV, 1)} ${t('unit.s')}`
                      : '—'}
                  </td>
                  <td className="n">{knownData ? `${scientific(6.582119569e-25 / knownData.data.widthGeV, 1)} ${t('unit.s')}` : '—'}</td>
                  <td className="n"></td>
                </tr>
                <tr>
                  <td>{t('passport.charge')}</td>
                  <td className="dim">{t('passport.charge.how')}</td>
                  <td className="n">{chargeInferred === null ? t('passport.inconclusive') : chargeInferred === 0 ? '0' : `±${chargeInferred}`}</td>
                  <td className="n">{knownData ? String(knownData.data.charge) : '—'}</td>
                  <td className={`n ${markClass(comparison?.charge)}`}>{comparison ? mark(comparison.charge) : ''}</td>
                </tr>
                <tr>
                  <td>{t('passport.crossSection')}</td>
                  <td className="dim">{t('passport.crossSection.how')}</td>
                  <td className="n">{measured && measured.crossSection.nb > 0 ? `${scientific(measured.crossSection.nb, 2)} ${t('unit.nb')}` : '—'}</td>
                  <td className="n">{knownData?.crossSectionNb != null ? `${scientific(knownData.crossSectionNb, 2)} ${t('unit.nb')}` : '—'}</td>
                  <td className={`n ${markClass(comparison?.crossSection)}`}>{comparison ? mark(comparison.crossSection) : ''}</td>
                </tr>
                <tr>
                  <td>{t('passport.decays')}</td>
                  <td className="dim">{t('passport.decays.how')}</td>
                  <td className="n">{t(`channel.${channel}`)}</td>
                  <td className="n">
                    {knownData
                      ? knownData.data.decays.map((d) => `${t(`decay.${d.channel}`)} ${number(100 * d.fraction, { maximumSignificantDigits: 2 })} %`).join(', ')
                      : '—'}
                  </td>
                  <td className="n"></td>
                </tr>
                <tr>
                  <td>{t('passport.spin')}</td>
                  <td className="dim">{t('passport.spin.how')}</td>
                  <td className="n">—</td>
                  <td className="n">{knownData ? String(knownData.data.spin) : '—'}</td>
                  <td className="n"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {known === 'none' && <p className="quiz-feedback warn">{t('passport.noMatch')}</p>}
          {comparison && (
            <p className={`quiz-feedback ${Object.values(comparison).every((v) => v !== 'mismatch') ? 'ok' : 'warn'}`}>
              {Object.values(comparison).every((v) => v !== 'mismatch') ? t('passport.consistent', { name: PARTICLE_LABELS[knownData!.id] ?? knownData!.id }) : t('passport.inconsistent')}
            </p>
          )}

          <div className="form-grid">
            <label>
              <span>{t('passport.name')}</span>
              <input type="text" value={name} placeholder={t('passport.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
          <div className="button-row">
            <button type="button" onClick={record} disabled={!measured}>
              {t('passport.record')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
