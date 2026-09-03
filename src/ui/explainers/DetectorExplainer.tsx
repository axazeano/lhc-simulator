import { useState } from 'react';
import { DETECTOR_GEOMETRY as G } from '../../data/detectorGeometry';
import { useI18n } from '../../i18n/I18nProvider';
import type { EventStore } from '../../physics/collision/eventStore';
import { EventDisplay } from '../EventDisplay';
import { ExplainerSection } from './Explainer';
import { Formula } from './Formula';

interface Props {
  store: EventStore;
  version: number;
}

/** The detector, explained on a real recorded event. */
export function DetectorExplainer({ store, version }: Props) {
  const { t, number } = useI18n();
  const [offset, setOffset] = useState(0);
  const count = store.size;
  // Walk the most recent records backwards; the store's columns are read live.
  const index = count - 1 - (offset % Math.max(1, count));
  const event = count > 0 ? store.get(index) : null;
  void version;

  return (
    <div className="explainer-content">
      <p className="explainer-lede">{t('explainer.detector.lede')}</p>

      <ExplainerSection title={t('explainer.detector.event.title')} text={t('explainer.detector.event.text')}>
        {event ? (
          <>
            <EventDisplay particles={event.particles} massGeV={event.massGeV} sqrtSGeV={event.sqrtSGeV} />
            <div className="button-row">
              <button type="button" onClick={() => setOffset((o) => o + 1)}>
                {t('display.next')}
              </button>
              <span className="note">{t('display.recordIndex', { index: number(index + 1), total: number(count) })}</span>
            </div>
          </>
        ) : (
          <p className="note">{t('display.empty')}</p>
        )}
      </ExplainerSection>

      <ExplainerSection title={t('explainer.detector.layers.title')} text={t('explainer.detector.layers.text')}>
        <dl className="legend">
          {(
            [
              ['display.tracker', 'explainer.detector.layer.tracker', `0–${number(G.trackerRadiusM, { maximumFractionDigits: 1 })} ${t('unit.m')}`],
              ['display.ecal', 'explainer.detector.layer.ecal', `${number(G.ecalInnerM, { maximumFractionDigits: 1 })}–${number(G.ecalOuterM, { maximumFractionDigits: 1 })} ${t('unit.m')}`],
              ['display.hcal', 'explainer.detector.layer.hcal', `${number(G.hcalInnerM, { maximumFractionDigits: 1 })}–${number(G.hcalOuterM, { maximumFractionDigits: 1 })} ${t('unit.m')}`],
              ['display.solenoid', 'explainer.detector.layer.solenoid', `${G.solenoidFieldT} ${t('unit.T')}`],
              ['display.muon', 'explainer.detector.layer.muon', `${number(G.muonStationsM[0]!, { maximumFractionDigits: 1 })}–${number(G.muonOuterM, { maximumFractionDigits: 1 })} ${t('unit.m')}`],
            ] as const
          ).map(([nameKey, textKey, value]) => (
            <div key={nameKey} className="legend-row">
              <dt>{t(nameKey)}</dt>
              <dd>
                {t(textKey)}
                <span className="legend-value mono">{value}</span>
              </dd>
            </div>
          ))}
        </dl>
      </ExplainerSection>

      <ExplainerSection title={t('explainer.detector.bend.title')} text={t('explainer.detector.bend.text')}>
        <Formula
          formula="R = pT / (0.2998 · B)"
          symbols={[
            { symbol: 'R', meaning: t('sym.R'), value: `${number(bendExample(5), { maximumFractionDigits: 1 })} ${t('unit.m')} (5 ${t('unit.GeV')}) · ${number(bendExample(45), { maximumFractionDigits: 0 })} ${t('unit.m')} (45 ${t('unit.GeV')})` },
            { symbol: 'pT', meaning: t('sym.pt') },
            { symbol: 'B', meaning: t('sym.Bsolenoid'), value: `${G.solenoidFieldT} ${t('unit.T')}` },
          ]}
        />
      </ExplainerSection>

      <ExplainerSection title={t('explainer.detector.signatures.title')} text={t('explainer.detector.signatures.text')} />
    </div>
  );
}

function bendExample(ptGeV: number): number {
  return ptGeV / (0.2998 * G.solenoidFieldT);
}
