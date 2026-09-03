import { DETECTOR_GEOMETRY as G } from '../data/detectorGeometry';
import { useI18n } from '../i18n/I18nProvider';
import type { RecordedParticle } from '../physics/collision/eventStore';
import { bendingRadiusM, crossingAtRadius, longitudinalTrack, reachM, transverseTrack, type Point } from '../physics/detector/tracks';

interface Props {
  particles: RecordedParticle[];
  massGeV: number;
  sqrtSGeV?: number;
  /** Show layer names on the drawing. */
  labels?: boolean;
}

const COLORS: Record<RecordedParticle['kind'], string> = {
  muon: 'var(--accent)',
  electron: 'var(--ok)',
  photon: 'var(--peak)',
};

/** Two views of one recorded event: the transverse plane (looking along the beam) and the r–z plane. */
export function EventDisplay({ particles, massGeV, sqrtSGeV, labels = true }: Props) {
  const { t, number } = useI18n();
  return (
    <div className="event-display">
      <div className="event-views">
        <TransverseView particles={particles} labels={labels} />
        <LongitudinalView particles={particles} labels={labels} />
      </div>
      <div className="event-legend">
        <div className="live-row">
          <span className="live">
            <span className="live-label">{t('display.mass')}</span>
            <span className="live-value mono">
              {number(massGeV, { maximumFractionDigits: 2 })} {t('unit.GeV')}
            </span>
          </span>
          {sqrtSGeV !== undefined && (
            <span className="live">
              <span className="live-label">√s</span>
              <span className="live-value mono">
                {number(sqrtSGeV / 1000, { maximumFractionDigits: 2 })} {t('unit.TeV')}
              </span>
            </span>
          )}
        </div>
        <ul className="particle-list">
          {particles.map((p, i) => (
            <li key={i}>
              <span className="swatch" style={{ background: COLORS[p.kind] }} />
              <span className="mono">
                {t(`kind.${p.kind}`)}
                {p.charge > 0 ? '⁺' : p.charge < 0 ? '⁻' : ''}
              </span>
              <span className="mono">
                pT {number(p.ptGeV, { maximumFractionDigits: 1 })} {t('unit.GeV')}
              </span>
              <span className="mono">η {number(p.eta, { maximumFractionDigits: 2, signDisplay: 'always' })}</span>
              <span className="mono">φ {number(p.phi, { maximumFractionDigits: 2 })}</span>
              {p.charge !== 0 && (
                <span className="mono dim">
                  R {number(bendingRadiusM(p.ptGeV), { maximumFractionDigits: 1 })} {t('unit.m')}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const VIEW = 300; // half-size of the transverse drawing in px
const SCALE_T = (VIEW - 10) / G.muonOuterM; // px per metre

function toPx(p: Point): string {
  return `${(VIEW + p.x * SCALE_T).toFixed(1)},${(VIEW - p.y * SCALE_T).toFixed(1)}`;
}

function TransverseView({ particles, labels }: { particles: RecordedParticle[]; labels: boolean }) {
  const { t } = useI18n();
  const ring = (r: number, fill: string, stroke = 'var(--line)') => (
    <circle cx={VIEW} cy={VIEW} r={r * SCALE_T} fill={fill} stroke={stroke} />
  );
  return (
    <svg viewBox={`0 0 ${2 * VIEW} ${2 * VIEW}`} className="figure event-view" role="img" aria-label={t('display.transverse')}>
      {/* Layers, outermost first so that inner ones paint over. */}
      {ring(G.muonOuterM, 'var(--surface-2)')}
      {G.muonStationsM.map((r) => (
        <circle key={r} cx={VIEW} cy={VIEW} r={r * SCALE_T} fill="none" stroke="var(--line)" strokeDasharray="3 4" />
      ))}
      {ring(G.solenoidOuterM, 'var(--surface)')}
      {ring(G.solenoidInnerM, 'var(--bg)')}
      {ring(G.hcalOuterM, 'var(--surface-2)')}
      {ring(G.hcalInnerM, 'var(--surface)')}
      {ring(G.ecalOuterM, 'var(--accent-soft)')}
      {ring(G.ecalInnerM, 'var(--surface)')}
      {G.trackerLayersM.map((r) => (
        <circle key={r} cx={VIEW} cy={VIEW} r={r * SCALE_T} fill="none" stroke="var(--line)" />
      ))}
      <circle cx={VIEW} cy={VIEW} r={Math.max(2, G.beamPipeRadiusM * SCALE_T)} fill="var(--ink)" />

      {particles.map((p, i) => {
        const reach = reachM(p.kind);
        const points = transverseTrack(p, reach);
        const color = COLORS[p.kind];
        const end = points[points.length - 1]!;
        const hits = p.kind === 'photon' ? [] : G.trackerLayersM.map((r) => crossingAtRadius(points, r)).filter((h): h is Point => h !== null);
        const muonHits = p.kind === 'muon' ? G.muonStationsM.map((r) => crossingAtRadius(points, r)).filter((h): h is Point => h !== null) : [];
        const deposit = p.kind !== 'muon' ? end : null;
        const depositSize = deposit ? 4 + 2 * Math.log10(1 + p.ptGeV) : 0;
        return (
          <g key={i}>
            <polyline
              points={points.map(toPx).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={p.kind === 'photon' ? 1.5 : 2}
              strokeDasharray={p.kind === 'photon' ? '4 3' : undefined}
            />
            {hits.map((h, k) => (
              <circle key={k} cx={VIEW + h.x * SCALE_T} cy={VIEW - h.y * SCALE_T} r="2.2" fill={color} />
            ))}
            {muonHits.map((h, k) => (
              <rect key={k} x={VIEW + h.x * SCALE_T - 3} y={VIEW - h.y * SCALE_T - 3} width="6" height="6" fill={color} />
            ))}
            {deposit && <circle cx={VIEW + deposit.x * SCALE_T} cy={VIEW - deposit.y * SCALE_T} r={depositSize} fill={color} opacity="0.7" />}
          </g>
        );
      })}

      {labels && (
        <g fontFamily="IBM Plex Sans, system-ui, sans-serif" fontSize="11" fill="var(--ink-2)">
          <text x={VIEW + 4} y={VIEW - G.trackerRadiusM * SCALE_T * 0.45}>{t('display.tracker')}</text>
          <text x={VIEW + 4} y={VIEW - (G.ecalInnerM + 0.2) * SCALE_T}>{t('display.ecal')}</text>
          <text x={VIEW + 4} y={VIEW - (G.hcalInnerM + 0.5) * SCALE_T}>{t('display.hcal')}</text>
          <text x={VIEW + 4} y={VIEW - (G.solenoidInnerM + 0.3) * SCALE_T}>{t('display.solenoid')}</text>
          <text x={VIEW + 4} y={VIEW - (G.muonStationsM[1]! + 0.4) * SCALE_T}>{t('display.muon')}</text>
          <text x={8} y={2 * VIEW - 8} fontFamily="IBM Plex Mono, monospace" fontSize="10">
            {t('display.transverse')} · B = {G.solenoidFieldT} T
          </text>
        </g>
      )}
    </svg>
  );
}

const LW = 640; // width of the r–z drawing
const LH = 300;
const SCALE_L = (LW / 2 - 12) / G.outerHalfLengthM; // px per metre along z
const SCALE_R = (LH - 16) / G.muonOuterM; // px per metre along r
const zPx = (z: number) => LW / 2 + z * SCALE_L;
const rPx = (r: number) => LH - 8 - r * SCALE_R;

function LongitudinalView({ particles, labels }: { particles: RecordedParticle[]; labels: boolean }) {
  const { t } = useI18n();
  const barrel = (rIn: number, rOut: number, halfZ: number, fill: string) => (
    <rect x={zPx(-halfZ)} y={rPx(rOut)} width={2 * halfZ * SCALE_L} height={(rOut - rIn) * SCALE_R} fill={fill} stroke="var(--line)" />
  );
  const disc = (z: number, rOut: number, thickness: number, fill: string) => (
    <>
      <rect x={zPx(z)} y={rPx(rOut)} width={thickness * SCALE_L} height={rOut * SCALE_R} fill={fill} stroke="var(--line)" />
      <rect x={zPx(-z - thickness)} y={rPx(rOut)} width={thickness * SCALE_L} height={rOut * SCALE_R} fill={fill} stroke="var(--line)" />
    </>
  );
  return (
    <svg viewBox={`0 0 ${LW} ${LH}`} className="figure event-view" role="img" aria-label={t('display.longitudinal')}>
      {barrel(G.muonStationsM[0]!, G.muonOuterM, G.muonHalfLengthM, 'var(--surface-2)')}
      {barrel(G.solenoidInnerM, G.solenoidOuterM, G.hcalHalfLengthM, 'var(--bg)')}
      {barrel(G.hcalInnerM, G.hcalOuterM, G.hcalHalfLengthM, 'var(--surface-2)')}
      {barrel(G.ecalInnerM, G.ecalOuterM, G.ecalHalfLengthM, 'var(--accent-soft)')}
      {barrel(G.beamPipeRadiusM, G.trackerRadiusM, G.trackerHalfLengthM, 'var(--surface)')}
      {disc(G.endcapEcalZM, G.hcalInnerM, 0.4, 'var(--accent-soft)')}
      {disc(G.endcapHcalZM, G.hcalOuterM, 0.8, 'var(--surface-2)')}
      {G.endcapMuonZM.map((z) => disc(z, G.muonOuterM, 0.3, 'var(--surface-2)'))}
      <line x1={zPx(-G.outerHalfLengthM)} y1={rPx(0)} x2={zPx(G.outerHalfLengthM)} y2={rPx(0)} stroke="var(--ink)" strokeWidth="1.5" />

      {particles.map((p, i) => {
        const reach = reachM(p.kind);
        const zLimit = p.kind === 'muon' ? G.outerHalfLengthM : G.endcapEcalZM + 0.3;
        const end = longitudinalTrack(p, reach, zLimit);
        const color = COLORS[p.kind];
        return (
          <g key={i}>
            <line x1={zPx(0)} y1={rPx(0)} x2={zPx(end.z)} y2={rPx(end.r)} stroke={color} strokeWidth={p.kind === 'photon' ? 1.5 : 2} strokeDasharray={p.kind === 'photon' ? '4 3' : undefined} />
            {p.kind !== 'muon' && <circle cx={zPx(end.z)} cy={rPx(end.r)} r={4 + 2 * Math.log10(1 + p.ptGeV)} fill={color} opacity="0.7" />}
          </g>
        );
      })}

      {labels && (
        <g fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="var(--ink-2)">
          <text x={zPx(-G.outerHalfLengthM)} y={12}>{t('display.longitudinal')}</text>
          <text x={zPx(G.outerHalfLengthM) - 4} y={rPx(0) - 4} textAnchor="end">z</text>
          <text x={zPx(-G.muonHalfLengthM) + 4} y={rPx(G.muonOuterM) + 12}>{t('display.muon')}</text>
          <text x={zPx(-G.trackerHalfLengthM) + 4} y={rPx(G.trackerRadiusM) + 12}>{t('display.tracker')}</text>
          <text x={zPx(G.endcapMuonZM[0]!) + 2} y={rPx(G.muonOuterM) - 3}>{t('display.endcap')}</text>
        </g>
      )}
    </svg>
  );
}
