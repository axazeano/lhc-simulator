import { LHC } from '../../data/lhc';
import { useI18n } from '../../i18n/I18nProvider';
import { LHC_MACHINE_CONFIG, momentumFromEnergy, readouts, requiredFieldT, type MachineState } from '../../physics/accelerator';
import { ExplainerSection, Live } from './Explainer';

interface Props {
  machine: MachineState;
}

export function MagnetExplainer({ machine }: Props) {
  const { t, number } = useI18n();
  const config = LHC_MACHINE_CONFIG;
  const r = readouts(machine);
  const energy = r ? machine.energyGeV : config.injectionEnergyGeV;
  const required = requiredFieldT(energy, config);
  const actual = machine.fieldT;
  const offsetM = r ? r.orbitOffsetM : 0;
  const tesla = (b: number) => `${number(b, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${t('unit.T')}`;

  return (
    <div className="explainer-content">
      <p className="explainer-lede">{t('explainer.magnets.lede')}</p>

      <ExplainerSection title={t('explainer.magnets.bend.title')} text={t('explainer.magnets.bend.text', { dipoles: number(LHC.dipoleCount), radius: number(LHC.bendingRadiusM, { maximumFractionDigits: 0 }) })}>
        <Bending fieldFraction={Math.min(1.1, actual / requiredFieldT(config.maxEnergyGeV, config))} />
        <div className="live-row">
          <Live label={t('readout.energy')} value={`${number(energy, { maximumFractionDigits: 0 })} ${t('unit.GeV')}`} />
          <Live label={t('readout.momentum')} value={`${number(momentumFromEnergy(energy), { maximumFractionDigits: 0 })} ${t('unit.GeVc')}`} />
          <Live label={t('readout.requiredField')} value={tesla(required)} />
        </div>
      </ExplainerSection>

      <ExplainerSection title={t('explainer.magnets.orbit.title')} text={t('explainer.magnets.orbit.text', { dispersion: number(config.dispersionM, { maximumFractionDigits: 1 }), aperture: number(config.apertureHalfWidthM * 1000, { maximumFractionDigits: 0 }) })}>
        <Pipe offsetM={offsetM} apertureM={config.apertureHalfWidthM} />
        <div className="live-row">
          <Live label={t('readout.actualField')} value={tesla(actual)} />
          <Live label={t('readout.mismatch')} value={r ? `${number(r.fieldMismatch * 100, { maximumFractionDigits: 2, signDisplay: 'always' })} %` : '—'} />
          <Live label={t('readout.orbitOffset')} value={r ? `${number(offsetM * 1000, { maximumFractionDigits: 1, signDisplay: 'always' })} ${t('unit.mm')}` : '—'} />
        </div>
      </ExplainerSection>
    </div>
  );
}

/** A dipole with the proton path curving inside it; the field strength shows as arrow density. */
function Bending({ fieldFraction }: { fieldFraction: number }) {
  const arrows = Math.max(1, Math.round(2 + 14 * Math.min(1, fieldFraction)));
  return (
    <svg viewBox="0 0 640 160" className="figure" role="img">
      <rect x="120" y="30" width="400" height="100" rx="8" fill="var(--surface-2)" stroke="var(--line)" />
      {Array.from({ length: arrows }, (_, i) => {
        const x = 140 + (i * 360) / Math.max(1, arrows - 1);
        return <circle key={i} cx={x} cy={44} r="3" fill="var(--ink-2)" />;
      })}
      <text x="128" y="122" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        B ⊙
      </text>
      <path d="M20 80 L120 80 Q320 80 520 80 L620 80" fill="none" stroke="var(--line)" strokeDasharray="4 4" />
      <path d="M20 80 L120 80 Q320 80 520 110 L620 128" fill="none" stroke="var(--accent)" strokeWidth="3" />
      <circle cx="120" cy="80" r="4" fill="var(--accent)" />
      <text x="24" y="70" fontSize="11" fill="var(--ink)" fontFamily="IBM Plex Mono, monospace">
        p
      </text>
      <text x="530" y="150" fontSize="11" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        ρ = 2804 m
      </text>
      <text x="300" y="150" fontSize="11" fill="var(--ink)" fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
        p = 0.2998 · B · ρ
      </text>
    </svg>
  );
}

/** Cross-section of the beam pipe with the closed orbit displaced by D·δ. */
function Pipe({ offsetM, apertureM }: { offsetM: number; apertureM: number }) {
  const scale = 100 / apertureM; // px per metre so the aperture is ±100 px
  const cx = 320;
  const x = cx + Math.max(-1.6, Math.min(1.6, offsetM / apertureM)) * 100;
  const lost = Math.abs(offsetM) > apertureM;
  return (
    <svg viewBox="0 0 640 120" className="figure" role="img">
      <rect x={cx - apertureM * scale} y="20" width={2 * apertureM * scale} height="80" rx="40" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="2" />
      <line x1={cx} y1="20" x2={cx} y2="100" stroke="var(--line)" strokeDasharray="3 3" />
      <circle cx={x} cy="60" r="10" fill={lost ? 'var(--danger)' : 'var(--accent)'} />
      <text x={cx - 100} y="114" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
        −17 mm
      </text>
      <text x={cx + 100} y="114" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
        +17 mm
      </text>
      <text x="20" y="60" fontSize="11" fill="var(--ink)" fontFamily="IBM Plex Mono, monospace">
        Δx = D · Δp/p
      </text>
    </svg>
  );
}
