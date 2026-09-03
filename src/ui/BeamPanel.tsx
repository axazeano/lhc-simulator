import { useI18n } from '../i18n/I18nProvider';
import { LHC } from '../data/lhc';
import type { BeamParameters } from '../physics/accelerator';
import { Hint } from './Hint';
import { NumberKnob } from './NumberKnob';
import { integratedLuminosityDisplay } from './units';

interface Props {
  beam: BeamParameters;
  colliding: boolean;
  luminosityCm2S: number | null;
  integratedLuminosityM2: number;
  collisionRatePerS: number | null;
  collisions: number;
  locked: boolean;
  onBeam(beam: BeamParameters): void;
}

const SOURCES = {
  bunches: 'https://cds.cern.ch/record/782076',
  protons: 'https://home.cern/science/accelerators/luminosity',
  betaStar: 'https://en.wikipedia.org/wiki/Beta_function_(accelerator_physics)',
};

export function BeamPanel(props: Props) {
  const { t, number, scientific } = useI18n();
  const { beam, locked } = props;
  const integrated = integratedLuminosityDisplay(props.integratedLuminosityM2);
  const knobClass = `knob ${locked ? 'locked' : ''}`;
  const lockTitle = locked ? t('tutorial.lockedKnob') : undefined;

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

      <div className={knobClass} title={lockTitle}>
        <NumberKnob
          id="bunches"
          label={t('beam.bunches')}
          value={beam.bunches}
          min={1}
          max={LHC.maxBunches}
          step={1}
          disabled={locked}
          onChange={(v) => props.onBeam({ ...beam, bunches: Math.round(v) })}
        />
        <Hint textKey="hint.bunches.what" href={SOURCES.bunches} />
      </div>

      <div className={knobClass} title={lockTitle}>
        <NumberKnob
          id="protons"
          label={t('beam.protonsPerBunch')}
          value={beam.protonsPerBunch / 1e10}
          min={1}
          max={15}
          step={0.01}
          sliderStep={0.1}
          unit={t('unit.e10')}
          disabled={locked}
          onChange={(v) => props.onBeam({ ...beam, protonsPerBunch: v * 1e10 })}
        />
        <Hint textKey="hint.protons.what" href={SOURCES.protons} />
      </div>

      <div className={knobClass} title={lockTitle}>
        <NumberKnob
          id="beta-star"
          label={t('beam.betaStar')}
          value={beam.betaStarM}
          min={0.25}
          max={10}
          step={0.01}
          sliderStep={0.05}
          unit={t('unit.m')}
          disabled={locked}
          onChange={(v) => props.onBeam({ ...beam, betaStarM: v })}
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
