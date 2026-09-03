import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { buildHistogram } from '../../physics/analysis/builder';
import type { PeakFit } from '../../physics/analysis/fit';
import {
  comparePassports,
  crossSectionFromYield,
  estimateWidth,
  lookElsewhere,
  matchKnownParticle,
  simulateResponse,
  type KnownPassport,
  type MeasuredPassport,
  type PassportComparison,
  type ResonanceResponse,
  type Verdict,
} from '../../physics/analysis/passport';
import type { HiddenParticle } from '../../physics/collision/hidden';
import { PARTICLE_LABELS, type CatalogEntry } from './catalog';
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
  currentFill: number;
  hidden: HiddenParticle[];
  catalog: CatalogEntry[];
  onCatalog(entries: CatalogEntry[]): void;
  onProgress?(state: { response: boolean; compared: boolean }): void;
  claims: { allowed: boolean; rank: string };
}

/** Significance required to claim a discovery, after the look-elsewhere correction. */
const CLAIM_SIGMA = 5;
/** Significance in independent data that confirms a claim. */
const CONFIRM_SIGMA = 3;

export function PassportPanel(props: Props) {
  const { t, number, scientific } = useI18n();
  const { fit, channel, selection, store, sqrtSGeV, catalog } = props;
  const [response, setResponse] = useState<ResonanceResponse | null>(null);
  const [known, setKnown] = useState<KnownPassport | null | 'none'>(null);
  const [name, setName] = useState('');

  // A new fit invalidates the response simulation and the comparison.
  useEffect(() => {
    setResponse(null);
    setKnown(null);
  }, [fit, channel]);
  useEffect(() => {
    props.onProgress?.({ response: response !== null, compared: known !== null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response, known]);

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
  const baseEntry = (): CatalogEntry | null => {
    if (!fit || !measured) return null;
    return {
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
  };
  const record = () => {
    const entry = baseEntry();
    if (!entry) return;
    props.onCatalog([...catalog, entry]);
    setName('');
  };
  const removeEntry = (id: string) => props.onCatalog(catalog.filter((e) => e.id !== id));

  // Local and global significance of the fitted bump, for a discovery claim.
  const claimStats = useMemo(() => {
    if (!fit) return null;
    const window = { minGeV: fit.mean - 2 * fit.sigma, maxGeV: fit.mean + 2 * fit.sigma };
    const spec = { min: store.spec.min, max: store.spec.max, bins: store.spec.bins };
    const a = analyseWindow(buildHistogram(store, selection, 'mass', spec).histogram, window);
    const searched = (selection.massMaxGeV ?? store.spec.max) - (selection.massMinGeV ?? store.spec.min);
    return { window, analysis: a, lookElsewhere: lookElsewhere(a.significance, searched, 4 * fit.sigma) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, selection, store, props.runVersion]);

  const claim = () => {
    const entry = baseEntry();
    if (!entry || !fit || !claimStats) return;
    entry.claim = {
      status: 'claimed',
      sigmaGeV: fit.sigma,
      localSignificance: claimStats.lookElsewhere.localSignificance,
      globalSignificance: claimStats.lookElsewhere.globalSignificance,
      fillAtClaim: props.currentFill,
      luminosityAtClaimM2: props.integratedLuminosityM2,
      selection,
    };
    props.onCatalog([...catalog, entry]);
    setName('');
  };

  // Confirmation: re-analyse every open claim on the data of fills taken after it.
  useEffect(() => {
    const open = catalog.filter((e) => e.claim && e.claim.status === 'claimed' && e.channel === channel);
    if (open.length === 0) return;
    const c = store.columns;
    const fills = new Set<number>();
    for (let i = 0; i < c.count; i++) fills.add(c.fill[i]!);
    let changed = false;
    const next = catalog.map((e) => {
      if (!e.claim || e.claim.status !== 'claimed' || e.channel !== channel) return e;
      const later = [...fills].filter((f) => f > e.claim!.fillAtClaim);
      if (later.length === 0) return e;
      const sel: Selection = { ...e.claim.selection, fills: later };
      const window = { minGeV: e.massGeV - 2 * e.claim.sigmaGeV, maxGeV: e.massGeV + 2 * e.claim.sigmaGeV };
      const a = analyseWindow(buildHistogram(store, sel, 'mass', { min: store.spec.min, max: store.spec.max, bins: store.spec.bins }).histogram, window);
      const laterLuminosity = props.integratedLuminosityM2 - e.claim.luminosityAtClaimM2;
      let status: 'claimed' | 'confirmed' | 'refuted' = e.claim.status;
      let hiddenIndex = e.claim.hiddenIndex;
      if (a.significance >= CONFIRM_SIGMA && a.signal > 0) {
        status = 'confirmed';
        const found = props.hidden.find((h) => h.channel === channel && Math.abs(h.massGeV - e.massGeV) <= Math.max(3 * e.massErrorGeV, 0.02 * h.massGeV, 2 * e.claim!.sigmaGeV));
        hiddenIndex = found?.index;
      } else if (laterLuminosity >= e.claim.luminosityAtClaimM2 && a.significance < 1) {
        status = 'refuted';
      }
      const updated: CatalogEntry = { ...e, claim: { ...e.claim, status, confirmationSignificance: a.significance, ...(hiddenIndex !== undefined ? { hiddenIndex } : {}) } };
      if (status !== e.claim.status || Math.abs((e.claim.confirmationSignificance ?? -1) - a.significance) > 0.05) changed = true;
      return updated;
    });
    if (changed) props.onCatalog(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.runVersion, channel]);

  const revealed = catalog.filter((e) => e.claim?.status === 'confirmed' && e.claim.hiddenIndex !== undefined);
  const hiddenFor = (index: number | undefined) => props.hidden.find((h) => h.index === index) ?? null;

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
              <span key={e.id} className={`catalog-chip mono ${e.claim ? `claim-${e.claim.status}` : ''}`} title={`${t(`channel.${e.channel}`)} · ${e.date}`}>
                {e.name} · {number(e.massGeV, { maximumFractionDigits: 2 })} {t('unit.GeV')}
                {e.matchedId && <span className="dim"> = {PARTICLE_LABELS[e.matchedId] ?? e.matchedId}</span>}
                {e.claim && (
                  <span className="dim">
                    {' '}
                    · {t(`claim.${e.claim.status}`)}
                    {e.claim.status === 'claimed' && e.claim.confirmationSignificance !== undefined && ` ${number(e.claim.confirmationSignificance, { maximumFractionDigits: 1 })}σ`}
                    {e.claim.hiddenIndex !== undefined && ` = ${t('claim.hiddenName', { index: e.claim.hiddenIndex })}`}
                  </span>
                )}
                <button type="button" className="chip-remove" aria-label={t('selection.delete')} onClick={() => removeEntry(e.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {revealed.length > 0 && (
        <div className="reveal-box">
          <span className="eyebrow">{t('claim.revealed')}</span>
          <ul className="particle-list">
            {revealed.map((e) => {
              const h = hiddenFor(e.claim!.hiddenIndex);
              if (!h) return null;
              return (
                <li key={e.id}>
                  <span className="mono">{t('claim.hiddenName', { index: h.index })}</span>
                  <span className="mono">{number(h.massGeV, { maximumFractionDigits: 1 })} {t('unit.GeV')}</span>
                  <span className="mono">Γ {number(h.widthGeV, { maximumFractionDigits: 2 })} {t('unit.GeV')}</span>
                  <span className="mono">σ·BR {scientific(h.crossSectionNbAt13TeV, 2)} {t('unit.nb')} (13 {t('unit.TeV')})</span>
                  <span className="mono">{t(`channel.${h.channel}`)}</span>
                </li>
              );
            })}
          </ul>
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
          {known === 'none' && claimStats && measured && (
            <div className="claim-box">
              <span className="eyebrow">{t('claim.title')}</span>
              <div className="readout-group">
                <div className="readout">
                  <span className="readout-label">{t('claim.local')}</span>
                  <span className="readout-value mono">{number(claimStats.lookElsewhere.localSignificance, { maximumFractionDigits: 1 })} σ</span>
                </div>
                <div className="readout">
                  <span className="readout-label">{t('claim.trials', { n: number(claimStats.lookElsewhere.trials) })}</span>
                  <span className="readout-value mono">{number(claimStats.lookElsewhere.globalSignificance, { maximumFractionDigits: 1 })} σ</span>
                </div>
              </div>
              <p className="note">{t('claim.explain')}</p>
              {props.claims.allowed ? (
                <div className="button-row">
                  <button type="button" className="primary" disabled={claimStats.lookElsewhere.globalSignificance < CLAIM_SIGMA} onClick={claim}>
                    {t('claim.button')}
                  </button>
                  {claimStats.lookElsewhere.globalSignificance < CLAIM_SIGMA && <span className="note">{t('claim.needMore', { sigma: CLAIM_SIGMA })}</span>}
                </div>
              ) : (
                <p className="quiz-feedback warn">{t('claim.lockedByRank', { rank: props.claims.rank })}</p>
              )}
              <p className="note">{t('claim.confirmNote', { sigma: CONFIRM_SIGMA })}</p>
            </div>
          )}
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
