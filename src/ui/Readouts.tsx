import { useI18n } from '../i18n/I18nProvider';
import { LHC } from '../data/lhc';
import { LHC_MACHINE_CONFIG, readouts, type MachineState } from '../physics/accelerator';
import { Hint } from './Hint';
import { humanDuration } from './timeSpeed';

interface Props {
  machine: MachineState;
}

const SQRT_S_SOURCE = 'https://en.wikipedia.org/wiki/Collider';

export function Readouts({ machine }: Props) {
  const { t, number, plural, scientific } = useI18n();
  const r = readouts(machine);
  const duration = humanDuration(machine.beamTimeS);
  const mismatchClass =
    r === null ? '' : Math.abs(r.orbitOffsetM) > LHC_MACHINE_CONFIG.apertureHalfWidthM ? 'bad' : Math.abs(r.fieldMismatch) > 0.003 ? 'warn' : 'ok';

  const row = (label: string, value: string, className = '') => (
    <div className={`readout ${className}`}>
      <span className="readout-label">{label}</span>
      <span className="readout-value mono">{value}</span>
    </div>
  );

  const dash = '—';

  return (
    <section className="panel readouts" aria-labelledby="readouts-title">
      <h2 id="readouts-title">{t('readout.title')}</h2>
      <p className={`status status-${machine.status}`}>{t(`status.${machine.status}`)}</p>

      <div className="readout-group">
        {row(t('readout.energy'), r ? `${number(machine.energyGeV, { maximumFractionDigits: 0 })} ${t('unit.GeV')}` : dash)}
        {row(t('readout.momentum'), r ? `${number(r.momentumGeV, { maximumFractionDigits: 1 })} ${t('unit.GeVc')}` : dash)}
        {row(t('readout.gamma'), r ? number(r.gamma, { maximumFractionDigits: 0 }) : dash)}
        {row(t('readout.beta'), r ? number(r.beta, { minimumFractionDigits: 9, maximumFractionDigits: 9 }) : dash)}
        {row(t('readout.beamTime'), r ? t(duration.unitKey, { value: Math.round(duration.value * 10) / 10 }) : dash)}
      </div>

      <div className="readout-group">
        {row(t('readout.requiredField'), r ? `${number(r.requiredFieldT, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${t('unit.T')}` : dash)}
        {row(t('readout.actualField'), r ? `${number(r.fieldT, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${t('unit.T')}` : dash)}
        {row(
          t('readout.mismatch'),
          r ? `${number(r.fieldMismatch * 100, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' })} ${t('unit.percent')}` : dash,
          mismatchClass,
        )}
        {row(
          t('readout.orbitOffset'),
          r ? `${number(r.orbitOffsetM * 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' })} ${t('unit.mm')}` : dash,
          mismatchClass,
        )}
        {row(t('readout.aperture'), `±${number(LHC_MACHINE_CONFIG.apertureHalfWidthM * 1000, { maximumFractionDigits: 0 })} ${t('unit.mm')}`)}
      </div>

      <div className="readout-group">
        {row(t('readout.sqrtSCollider'), r ? `${number(r.sqrtSColliderGeV / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t('unit.TeV')}` : dash)}
        {row(t('readout.sqrtSFixedTarget'), r ? `${number(r.sqrtSFixedTargetGeV, { maximumFractionDigits: 1 })} ${t('unit.GeV')}` : dash)}
        <Hint textKey="hint.sqrtS.what" href={SQRT_S_SOURCE} />
      </div>

      <div className="readout-group">
        {row(t('readout.bunches'), plural('bunches', LHC.maxBunches))}
        {row(t('readout.luminosity'), r ? `${scientific(r.luminosityCm2S)} ${t('unit.cm2s')}` : dash)}
      </div>
    </section>
  );
}
