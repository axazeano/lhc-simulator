import { useI18n } from '../i18n/I18nProvider';
import { LHC_MACHINE_CONFIG, type FieldMode, type MachineState } from '../physics/accelerator';
import type { LevelAccess } from '../tutorial/levels';
import { Hint } from './Hint';
import { NumberKnob } from './NumberKnob';
import { ExplainerButton, type ExplainerTopic } from './explainers/Explainer';
import { TIME_SPEED_OPTIONS } from './timeSpeed';

interface Props {
  machine: MachineState;
  timeSpeed: number;
  access: LevelAccess;
  onInject(): void;
  onDump(): void;
  onTargetEnergy(energyGeV: number): void;
  onFieldMode(mode: FieldMode): void;
  onManualField(fieldT: number): void;
  onTimeSpeed(factor: number): void;
  onExplain(topic: ExplainerTopic): void;
}

const SOURCES = {
  energy: 'https://home.cern/science/accelerators/large-hadron-collider',
  field: 'https://en.wikipedia.org/wiki/Rigidity_(electromagnetism)',
  timeSpeed: 'https://home.cern/science/accelerators/luminosity',
};

export function ControlPanel(props: Props) {
  const { t } = useI18n();
  const { machine, timeSpeed, access } = props;
  const config = LHC_MACHINE_CONFIG;
  const beamPresent = machine.status !== 'empty';
  const lockTitle = t('tutorial.lockedKnob');

  return (
    <section className="panel controls" aria-labelledby="controls-title">
      <div className="panel-head">
        <h2 id="controls-title">{t('controls.title')}</h2>
        <ExplainerButton topic="magnets" onOpen={props.onExplain} />
      </div>

      <div className="button-row">
        <button type="button" className="primary" onClick={props.onInject} disabled={beamPresent}>
          {t('controls.inject')}
        </button>
        <button type="button" onClick={props.onDump} disabled={!beamPresent}>
          {t('controls.dump')}
        </button>
      </div>

      <div className={`knob ${access.energy ? '' : 'locked'}`} title={access.energy ? undefined : lockTitle}>
        <NumberKnob
          id="target-energy"
          label={t('controls.targetEnergy')}
          value={machine.targetEnergyGeV}
          min={config.injectionEnergyGeV}
          max={config.maxEnergyGeV}
          step={1}
          sliderStep={10}
          unit={t('unit.GeV')}
          disabled={!access.energy}
          onChange={props.onTargetEnergy}
        />
        <Hint textKey="hint.energy.what" href={SOURCES.energy} />
      </div>

      <div className={`knob ${access.fieldMode || access.manualField ? '' : 'locked'}`} title={access.fieldMode || access.manualField ? undefined : lockTitle}>
        <div className="knob-head">
          <span id="field-mode-label">{t('controls.fieldMode')}</span>
          <div className="segmented" role="radiogroup" aria-labelledby="field-mode-label">
            {(['auto', 'manual'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={machine.fieldMode === mode}
                className={machine.fieldMode === mode ? 'active' : ''}
                disabled={!access.fieldMode}
                onClick={() => props.onFieldMode(mode)}
              >
                {t(`controls.fieldMode.${mode}`)}
              </button>
            ))}
          </div>
        </div>
        <NumberKnob
          id="manual-field"
          label={t('controls.manualField')}
          value={machine.fieldMode === 'manual' ? machine.manualFieldT : machine.fieldT}
          min={0}
          max={config.maxFieldT}
          step={0.001}
          sliderStep={0.005}
          unit={t('unit.T')}
          disabled={machine.fieldMode === 'auto' || !access.manualField}
          onChange={props.onManualField}
        />
        <Hint textKey="hint.field.what" href={SOURCES.field} />
      </div>

      <div className={`knob ${access.timeSpeed ? '' : 'locked'}`} title={access.timeSpeed ? undefined : lockTitle}>
        <div className="knob-head">
          <label htmlFor="time-speed">{t('controls.timeSpeed')}</label>
        </div>
        <select id="time-speed" value={timeSpeed} disabled={!access.timeSpeed} onChange={(e) => props.onTimeSpeed(Number(e.target.value))}>
          {TIME_SPEED_OPTIONS.map((option) => (
            <option key={option.factor} value={option.factor}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
        <Hint textKey="hint.timeSpeed.what" href={SOURCES.timeSpeed} />
      </div>
    </section>
  );
}
