import { useI18n } from '../i18n/I18nProvider';
import { LHC_MACHINE_CONFIG, type FieldMode, type MachineState } from '../physics/accelerator';
import { Hint } from './Hint';
import { TIME_SPEED_OPTIONS } from './timeSpeed';

interface Props {
  machine: MachineState;
  timeSpeed: number;
  onInject(): void;
  onDump(): void;
  onTargetEnergy(energyGeV: number): void;
  onFieldMode(mode: FieldMode): void;
  onManualField(fieldT: number): void;
  onTimeSpeed(factor: number): void;
}

const SOURCES = {
  energy: 'https://home.cern/science/accelerators/large-hadron-collider',
  field: 'https://en.wikipedia.org/wiki/Rigidity_(electromagnetism)',
  timeSpeed: 'https://home.cern/science/accelerators/luminosity',
};

export function ControlPanel(props: Props) {
  const { t, number } = useI18n();
  const { machine, timeSpeed } = props;
  const config = LHC_MACHINE_CONFIG;
  const beamPresent = machine.status !== 'empty';

  return (
    <section className="panel controls" aria-labelledby="controls-title">
      <h2 id="controls-title">{t('controls.title')}</h2>

      <div className="button-row">
        <button type="button" className="primary" onClick={props.onInject} disabled={beamPresent}>
          {t('controls.inject')}
        </button>
        <button type="button" onClick={props.onDump} disabled={!beamPresent}>
          {t('controls.dump')}
        </button>
      </div>

      <div className="knob">
        <div className="knob-head">
          <label htmlFor="target-energy">{t('controls.targetEnergy')}</label>
          <output htmlFor="target-energy" className="mono">
            {number(machine.targetEnergyGeV / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            {t('unit.TeV')}
          </output>
        </div>
        <input
          id="target-energy"
          type="range"
          min={config.injectionEnergyGeV}
          max={config.maxEnergyGeV}
          step={10}
          value={machine.targetEnergyGeV}
          onChange={(e) => props.onTargetEnergy(Number(e.target.value))}
        />
        <Hint textKey="hint.energy.what" href={SOURCES.energy} />
      </div>

      <div className="knob">
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
                onClick={() => props.onFieldMode(mode)}
              >
                {t(`controls.fieldMode.${mode}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="knob-head">
          <label htmlFor="manual-field">{t('controls.manualField')}</label>
          <output htmlFor="manual-field" className="mono">
            {number(machine.fieldT, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {t('unit.T')}
          </output>
        </div>
        <input
          id="manual-field"
          type="range"
          min={0}
          max={config.maxFieldT}
          step={0.005}
          value={machine.fieldMode === 'manual' ? machine.manualFieldT : machine.fieldT}
          disabled={machine.fieldMode === 'auto'}
          onChange={(e) => props.onManualField(Number(e.target.value))}
        />
        <Hint textKey="hint.field.what" href={SOURCES.field} />
      </div>

      <div className="knob">
        <div className="knob-head">
          <label htmlFor="time-speed">{t('controls.timeSpeed')}</label>
        </div>
        <select id="time-speed" value={timeSpeed} onChange={(e) => props.onTimeSpeed(Number(e.target.value))}>
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
