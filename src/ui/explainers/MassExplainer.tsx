import { useI18n } from '../../i18n/I18nProvider';
import type { Channel } from '../../physics/collision/channels';
import { ExplainerSection } from './Explainer';
import { Formula } from './Formula';

interface Props {
  channel: Channel;
}

export function MassExplainer({ channel }: Props) {
  const { t } = useI18n();
  return (
    <div className="explainer-content">
      <p className="explainer-lede">{t('explainer.mass.lede')}</p>

      <ExplainerSection title={t('explainer.mass.decay.title')} text={t('explainer.mass.decay.text')}>
        <Decay channel={channel} />
      </ExplainerSection>

      <ExplainerSection title={t('explainer.mass.formula.title')} text={t('explainer.mass.formula.text')}>
        <Formula
          formula="m² = (E₁ + E₂)² − |p₁ + p₂|²"
          symbols={[
            { symbol: 'm', meaning: t('sym.m') },
            { symbol: 'E₁, E₂', meaning: t('sym.E1E2') },
            { symbol: 'p₁, p₂', meaning: t('sym.p1p2') },
          ]}
        />
      </ExplainerSection>

      <ExplainerSection title={t('explainer.mass.peak.title')} text={t('explainer.mass.peak.text')}>
        <PeakSketch />
      </ExplainerSection>
    </div>
  );
}

/** Collision point, an invisible parent, and two curved tracks (or straight photons). */
function Decay({ channel }: { channel: Channel }) {
  const photons = channel === 'gammagamma';
  const four = channel === 'fourlepton';
  const track = (d: string, color: string) => <path d={d} fill="none" stroke={color} strokeWidth="2.5" />;
  return (
    <svg viewBox="0 0 640 200" className="figure" role="img">
      <circle cx="80" cy="100" r="5" fill="var(--ink)" />
      <path d="M80 100 L220 100" stroke="var(--ink-2)" strokeDasharray="5 4" strokeWidth="2" fill="none" />
      <text x="140" y="90" fontSize="11" fill="var(--ink-2)" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif">
        X
      </text>
      <circle cx="220" cy="100" r="4" fill="var(--peak)" />
      {photons ? (
        <>
          {track('M220 100 L600 40', 'var(--peak)')}
          {track('M220 100 L600 165', 'var(--peak)')}
          <text x="560" y="30" fontSize="12" fill="var(--peak)" fontFamily="IBM Plex Sans, sans-serif">γ₁</text>
          <text x="560" y="185" fontSize="12" fill="var(--peak)" fontFamily="IBM Plex Sans, sans-serif">γ₂</text>
        </>
      ) : four ? (
        <>
          {track('M220 100 Q380 30 600 20', 'var(--accent)')}
          {track('M220 100 Q380 70 600 75', 'var(--peak)')}
          {track('M220 100 Q380 130 600 125', 'var(--accent)')}
          {track('M220 100 Q380 170 600 185', 'var(--peak)')}
          <text x="560" y="14" fontSize="12" fill="var(--ink)" fontFamily="IBM Plex Sans, sans-serif">ℓ⁺</text>
          <text x="560" y="68" fontSize="12" fill="var(--ink)" fontFamily="IBM Plex Sans, sans-serif">ℓ⁻</text>
          <text x="560" y="118" fontSize="12" fill="var(--ink)" fontFamily="IBM Plex Sans, sans-serif">ℓ⁺</text>
          <text x="560" y="198" fontSize="12" fill="var(--ink)" fontFamily="IBM Plex Sans, sans-serif">ℓ⁻</text>
        </>
      ) : (
        <>
          {track('M220 100 Q380 40 600 45', 'var(--accent)')}
          {track('M220 100 Q380 160 600 150', 'var(--peak)')}
          <text x="560" y="35" fontSize="12" fill="var(--accent)" fontFamily="IBM Plex Sans, sans-serif">μ⁺  E₁, p₁</text>
          <text x="560" y="175" fontSize="12" fill="var(--peak)" fontFamily="IBM Plex Sans, sans-serif">μ⁻  E₂, p₂</text>
        </>
      )}
      <text x="40" y="180" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        B ⊙  →  r ∝ p_T
      </text>
    </svg>
  );
}

/** A smooth background with one narrow peak, annotated. */
function PeakSketch() {
  const pts: string[] = [];
  for (let i = 0; i <= 100; i++) {
    const x = 40 + i * 5.6;
    const m = i / 100;
    const bkg = 60 * Math.exp(-2.2 * m);
    const peak = 70 * Math.exp(-((m - 0.55) ** 2) / (2 * 0.02 ** 2));
    pts.push(`${x},${150 - bkg - peak}`);
  }
  return (
    <svg viewBox="0 0 640 170" className="figure" role="img">
      <polyline points="40,150 600,150" stroke="var(--line)" fill="none" />
      <polyline points="40,150 40,20" stroke="var(--line)" fill="none" />
      <path d={`M${pts.join(' L')} L600,150 L40,150 Z`} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <line x1={40 + 55 * 5.6} y1="20" x2={40 + 55 * 5.6} y2="150" stroke="var(--peak)" strokeDasharray="3 3" />
      <text x={40 + 55 * 5.6 + 6} y="32" fontSize="11" fill="var(--peak)" fontFamily="IBM Plex Sans, sans-serif" fontWeight="600">
        m_X
      </text>
      <text x="600" y="165" fontSize="10" fill="var(--ink-2)" textAnchor="end" fontFamily="IBM Plex Mono, monospace">
        m(pair)
      </text>
      <text x="60" y="130" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Sans, sans-serif">
        σ_m ≈ resolution
      </text>
    </svg>
  );
}
