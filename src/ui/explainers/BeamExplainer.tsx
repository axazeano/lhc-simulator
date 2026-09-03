import { LHC } from '../../data/lhc';
import { useI18n } from '../../i18n/I18nProvider';
import {
  LHC_DESIGN_BEAM,
  beamSizeAtIP,
  geometricEmittance,
  lorentzBeta,
  lorentzGamma,
  luminosityCm2S,
  type BeamParameters,
} from '../../physics/accelerator';
import { crossSectionNb, processById } from '../../physics/collision';
import { ExplainerSection, Live } from './Explainer';

interface Props {
  beam: BeamParameters;
  /** Beam energy for the drawings; the injection energy when the ring is empty. */
  energyGeV: number;
}

const SPEED_OF_LIGHT = 299792458;
const BUNCH_SPACING_NS = 25;

export function BeamExplainer({ beam, energyGeV }: Props) {
  const { t, number, scientific } = useI18n();
  const gamma = lorentzGamma(energyGeV);
  const beta = lorentzBeta(energyGeV);
  const emittance = geometricEmittance(beam.normalizedEmittanceM, gamma, beta);
  const sigma = beamSizeAtIP(emittance, beam.betaStarM);
  const sigmaDesign = beamSizeAtIP(geometricEmittance(LHC_DESIGN_BEAM.normalizedEmittanceM, gamma, beta), LHC_DESIGN_BEAM.betaStarM);
  const luminosity = luminosityCm2S(beam, LHC.revolutionFrequencyHz, gamma, beta);
  const sqrtS = 2 * energyGeV;
  const inelasticNb = crossSectionNb(processById('inelastic'), sqrtS);
  const collisionsPerCrossing = (inelasticNb * 1e-33 * luminosity) / (beam.bunches * LHC.revolutionFrequencyHz);
  const spacingM = (BUNCH_SPACING_NS * 1e-9 * SPEED_OF_LIGHT).toFixed(1);
  const maxSlots = Math.floor(LHC.circumferenceM / (BUNCH_SPACING_NS * 1e-9 * SPEED_OF_LIGHT));
  const um = (m: number) => number(m * 1e6, { maximumFractionDigits: 1 });

  return (
    <div className="explainer-content">
      <p className="explainer-lede">{t('explainer.beam.lede')}</p>

      <ExplainerSection title={t('explainer.beam.bunches.title')} text={t('explainer.beam.bunches.text', { spacing: spacingM, slots: maxSlots })}>
        <BunchTrain bunches={beam.bunches} maxBunches={LHC.maxBunches} />
        <div className="live-row">
          <Live label={t('beam.bunches')} value={number(beam.bunches)} />
          <Live label={t('explainer.beam.bunches.fill')} value={`${number((100 * beam.bunches) / LHC.maxBunches, { maximumFractionDigits: 0 })} %`} />
        </div>
      </ExplainerSection>

      <ExplainerSection title={t('explainer.beam.bunch.title')} text={t('explainer.beam.bunch.text')}>
        <Bunch protons={beam.protonsPerBunch} design={LHC.designProtonsPerBunch} />
        <div className="live-row">
          <Live label={t('beam.protonsPerBunch')} value={scientific(beam.protonsPerBunch, 2)} />
          <Live label={t('explainer.beam.bunch.perCrossing')} value={number(collisionsPerCrossing, { maximumFractionDigits: 1 })} />
        </div>
      </ExplainerSection>

      <ExplainerSection title={t('explainer.beam.focus.title')} text={t('explainer.beam.focus.text')}>
        <Hourglass betaStar={beam.betaStarM} designBetaStar={LHC_DESIGN_BEAM.betaStarM} />
        <div className="live-row">
          <Live label="β*" value={`${number(beam.betaStarM, { maximumFractionDigits: 2 })} ${t('unit.m')}`} />
          <Live label={t('explainer.beam.focus.sigma')} value={`${um(sigma)} ${t('unit.um')}`} />
          <Live label={t('explainer.beam.focus.sigmaDesign')} value={`${um(sigmaDesign)} ${t('unit.um')}`} />
        </div>
      </ExplainerSection>

      <ExplainerSection title={t('explainer.beam.luminosity.title')} text={t('explainer.beam.luminosity.text')}>
        <div className="live-row">
          <Live label={t('readout.energy')} value={`${number(energyGeV, { maximumFractionDigits: 0 })} ${t('unit.GeV')}`} />
          <Live label={t('explainer.beam.luminosity.perSecond')} value={`${scientific(inelasticNb * 1e-33 * luminosity, 1)} ${t('unit.perSecond')}`} />
        </div>
        <LuminosityFormula
          bunches={number(beam.bunches)}
          protons={scientific(beam.protonsPerBunch, 2)}
          sigma={`${um(sigma)} ${t('unit.um')}`}
          result={`${scientific(luminosity)} ${t('unit.cm2s')}`}
          frev={number(LHC.revolutionFrequencyHz, { maximumFractionDigits: 0 })}
          labels={{
            bunches: t('beam.bunches'),
            protons: t('beam.protonsPerBunch'),
            sigma: t('explainer.beam.focus.sigma'),
            frev: t('explainer.beam.luminosity.frev'),
          }}
        />
      </ExplainerSection>
    </div>
  );
}

/** A stretch of beam pipe with a train of bunches; density reflects how full the ring is. */
function BunchTrain({ bunches, maxBunches }: { bunches: number; maxBunches: number }) {
  const slots = 24;
  const filled = Math.max(1, Math.round((slots * bunches) / maxBunches));
  return (
    <svg viewBox="0 0 640 90" className="figure" role="img">
      <rect x="20" y="30" width="600" height="30" rx="15" fill="var(--surface-2)" stroke="var(--line)" />
      {Array.from({ length: slots }, (_, i) => {
        const x = 40 + i * (560 / (slots - 1));
        const on = i < filled;
        return (
          <g key={i}>
            <circle cx={x} cy={45} r={on ? 6 : 2.5} fill={on ? 'var(--accent)' : 'var(--line)'} />
          </g>
        );
      })}
      <line x1="40" y1="72" x2={40 + 560 / (slots - 1)} y2="72" stroke="var(--ink-2)" />
      <text x={40 + 280 / (slots - 1)} y="86" textAnchor="middle" fontSize="11" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        25 ns · 7.5 m
      </text>
      <path d="M606 45 l 12 -6 v 12 z" fill="var(--ink-2)" />
    </svg>
  );
}

/** One bunch drawn to (very exaggerated) scale, with an intensity that follows the proton count. */
function Bunch({ protons, design }: { protons: number; design: number }) {
  const density = Math.min(1, Math.max(0.15, protons / design));
  const dots = Math.round(40 + 160 * density);
  const seed = 7;
  const points: { x: number; y: number }[] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = 0; i < dots; i++) {
    // Gaussian-ish blob: sum of uniforms.
    const gx = (rnd() + rnd() + rnd() - 1.5) / 1.5;
    const gy = (rnd() + rnd() + rnd() - 1.5) / 1.5;
    points.push({ x: 320 + gx * 180, y: 45 + gy * 18 });
  }
  return (
    <svg viewBox="0 0 640 90" className="figure" role="img">
      <ellipse cx="320" cy="45" rx="200" ry="24" fill="var(--accent-soft)" stroke="var(--accent)" opacity="0.7" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.6" fill="var(--accent)" />
      ))}
      <line x1="120" y1="80" x2="520" y2="80" stroke="var(--ink-2)" />
      <text x="320" y="88" textAnchor="middle" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        ≈ 7.5 cm
      </text>
      <text x="560" y="49" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        ≈ 16 µm
      </text>
      <line x1="540" y1="21" x2="540" y2="69" stroke="var(--ink-2)" />
    </svg>
  );
}

/** Beam envelope σ(s) ∝ √β(s) with β(s) = β* + s²/β*, for the current and the design β*. */
function Hourglass({ betaStar, designBetaStar }: { betaStar: number; designBetaStar: number }) {
  const width = 640;
  const height = 150;
  const cx = width / 2;
  const cy = height / 2;
  const sMax = 3; // metres each side of the IP
  const scale = (width / 2 - 30) / sMax;
  // Vertical scale: the wider of the two envelopes just fits the drawing at s = ±3 m.
  const edge = (b: number) => Math.sqrt(b + (sMax * sMax) / b);
  const ampl = (cy - 22) / Math.max(edge(betaStar), edge(designBetaStar));
  const envelope = (b: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const s = -sMax + (2 * sMax * i) / 60;
      const y = ampl * Math.sqrt(b + (s * s) / b);
      pts.push(`${cx + s * scale},${cy - Math.min(cy - 4, y)}`);
    }
    const top = pts.join(' ');
    const bottom = pts
      .slice()
      .reverse()
      .map((p) => {
        const [x, y] = p.split(',').map(Number);
        return `${x},${2 * cy - y!}`;
      })
      .join(' ');
    return `M${top} L${bottom} Z`;
  };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="figure" role="img">
      <path d={envelope(designBetaStar)} fill="none" stroke="var(--ink-2)" strokeDasharray="4 4" />
      <path d={envelope(betaStar)} fill="var(--accent-soft)" stroke="var(--accent)" />
      <line x1={cx} y1="8" x2={cx} y2={height - 8} stroke="var(--peak)" strokeDasharray="3 3" />
      <text x={cx + 6} y="16" fontSize="11" fill="var(--peak)" fontFamily="IBM Plex Sans, sans-serif" fontWeight="600">
        IP
      </text>
      <text x="30" y={height - 6} fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        −3 m
      </text>
      <text x={width - 30} y={height - 6} textAnchor="end" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        +3 m
      </text>
      <text x={width - 30} y="16" textAnchor="end" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        β* = {betaStar.toFixed(2)} m
      </text>
      <text x={width - 30} y="30" textAnchor="end" fontSize="10" fill="var(--ink-2)" fontFamily="IBM Plex Mono, monospace">
        - - - {designBetaStar.toFixed(2)} m
      </text>
    </svg>
  );
}

function LuminosityFormula(props: {
  bunches: string;
  protons: string;
  sigma: string;
  frev: string;
  result: string;
  labels: { bunches: string; protons: string; sigma: string; frev: string };
}) {
  return (
    <div className="formula">
      <div className="formula-line mono">
        <span>L =</span>
        <span className="frac">
          <span className="num">
            <span className="term term-n" title={props.labels.protons}>N²</span> ·{' '}
            <span className="term term-nb" title={props.labels.bunches}>n_b</span> ·{' '}
            <span className="term term-f" title={props.labels.frev}>f_rev</span>
          </span>
          <span className="den">
            4π · <span className="term term-s" title={props.labels.sigma}>σ²</span>
          </span>
        </span>
      </div>
      <div className="formula-values">
        <span className="term term-n">N = {props.protons}</span>
        <span className="term term-nb">n_b = {props.bunches}</span>
        <span className="term term-f">f_rev = {props.frev} Hz</span>
        <span className="term term-s">σ = {props.sigma}</span>
      </div>
      <div className="formula-result mono">L = {props.result}</div>
    </div>
  );
}
