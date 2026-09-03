import { useI18n } from '../i18n/I18nProvider';
import { LHC } from '../data/lhc';
import type { BeamParameters } from '../physics/accelerator';
import { Hint } from './Hint';
import { integratedLuminosityDisplay } from './units';

interface Props {
  beam: BeamParameters;
  colliding: boolean;
  luminosityCm2S: number | null;
  integratedLuminosityM2: number;
  collisionRatePerS: number | null;
  collisions: number;
  onBeam(beam: BeamParameters): void;
}

const SOURCES = {
  bunches: 'https://cds.cern.ch/record/782076',
  protons: 'https://home.cern/science/accelerators/luminosity',
  betaStar: 'https://en.wikipedia.org/wiki/Beta_function_(accelerator_physics)',
};

export function BeamPanel(props: Props) {
  const { t, number, scientific } = useI18n();
  const { beam } = props;
  const integrated = integratedLuminosityDisplay(props.integratedLuminosityM2);

  const row = (label: string, value: string) => (
    <div className="readout">
      <span className="readout-label">{label}</span>
      <span className="readout-value mono">{value}</span>
    </div>
  );

  return (
    <section className="panel beam" aria-labelledby="beam-title">
      <h2 id="beam-title">{t('beam.title')}</h2>
      <p className={`status ${props.colliding ? 'status-stable' : 'status-empty'}`}>
        {props.colliding ? t('beam.colliding') : t('beam.notColliding')}
      </p>

      <div className="knob">
        <div className="knob-head">
          <label htmlFor="bunches">{t('beam.bunches')}</label>
          <output htmlFor="bunches" className="mono">{number(beam.bunches)}</output>
        </div>
        <input
          id="bunches"
          type="range"
          min={1}
          max={LHC.maxBunches}
          step={1}
          value={beam.bunches}
          onChange={(e) => props.onBeam({ ...beam, bunches: Number(e.target.value) })}
        />
        <Hint textKey="hint.bunches.what" href={SOURCES.bunches} />
      </div>

      <div className="knob">
        <div className="knob-head">
          <label htmlFor="protons">{t('beam.protonsPerBunch')}</label>
          <output htmlFor="protons" className="mono">{scientific(beam.protonsPerBunch, 2)}</output>
        </div>
        <input
          id="protons"
          type="range"
          min={1e10}
          max={1.5e11}
          step={1e9}
          value={beam.protonsPerBunch}
          onChange={(e) => props.onBeam({ ...beam, protonsPerBunch: Number(e.target.value) })}
        />
        <Hint textKey="hint.protons.what" href={SOURCES.protons} />
      </div>

      <div className="knob">
        <div className="knob-head">
          <label htmlFor="beta-star">{t('beam.betaStar')}</label>
          <output htmlFor="beta-star" className="mono">
            {number(beam.betaStarM, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t('unit.m')}
          </output>
        </div>
        <input
          id="beta-star"
          type="range"
          min={0.25}
          max={10}
          step={0.05}
          value={beam.betaStarM}
          onChange={(e) => props.onBeam({ ...beam, betaStarM: Number(e.target.value) })}
        />
        <Hint textKey="hint.betaStar.what" href={SOURCES.betaStar} />
      </div>

      <div className="readout-group">
        {row(t('beam.luminosity'), props.luminosityCm2S === null ? '—' : `${scientific(props.luminosityCm2S)} ${t('unit.cm2s')}`)}
        {row(
          t('beam.collisionRate'),
          props.collisionRatePerS === null ? '—' : `${scientific(props.collisionRatePerS)} ${t('unit.perSecond')}`,
        )}
        {row(
          t('beam.integrated'),
          `${number(integrated.value, { maximumSignificantDigits: 3 })} ${t(integrated.unitKey)}`,
        )}
        {row(t('beam.collisions'), props.collisions === 0 ? '0' : scientific(props.collisions, 2))}
      </div>
    </section>
  );
}
