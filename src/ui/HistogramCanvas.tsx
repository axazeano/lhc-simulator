import { useEffect, useRef, useState } from 'react';
import { PARTICLES } from '../data/particles';
import { useI18n } from '../i18n/I18nProvider';
import type { Histogram } from '../physics/analysis/histogram';
import type { MassWindow } from '../physics/analysis/window';

interface Props {
  histogram: Histogram;
  /** Bumped by the owner whenever the histogram content changed. */
  version: number;
  view: MassWindow;
  window: MassWindow;
  logScale: boolean;
  showKnownMasses: boolean;
}

const KNOWN = [
  { label: 'J/ψ', mass: PARTICLES.jpsi.massGeV },
  { label: 'Υ(1S)', mass: PARTICLES.upsilon1s.massGeV },
  { label: 'Υ(2S)', mass: PARTICLES.upsilon2s.massGeV },
  { label: 'Υ(3S)', mass: PARTICLES.upsilon3s.massGeV },
  { label: 'Z', mass: PARTICLES.z.massGeV },
];

const MARGIN = { left: 56, right: 16, top: 14, bottom: 34 };

function cssVar(el: HTMLElement, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const factor = residual >= 5 ? 5 : residual >= 2 ? 2 : 1;
  return factor * magnitude;
}

export function HistogramCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ mass: number; count: number } | null>(null);
  const columnsRef = useRef<{ counts: Float64Array; from: number; to: number } | null>(null);
  const { t, number } = useI18n();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const accent = cssVar(canvas, '--accent', '#2456B8');
    const accentSoft = cssVar(canvas, '--accent-soft', '#E3EBFA');
    const surface2 = cssVar(canvas, '--surface-2', '#E9EDF2');
    const line = cssVar(canvas, '--line', '#D5DBE3');
    const ink = cssVar(canvas, '--ink', '#17222E');
    const ink2 = cssVar(canvas, '--ink-2', '#5B6B7C');
    const peak = cssVar(canvas, '--peak', '#D4661F');

    const plotW = Math.max(10, rect.width - MARGIN.left - MARGIN.right);
    const plotH = Math.max(10, rect.height - MARGIN.top - MARGIN.bottom);
    const { view, window: win, histogram, logScale } = props;
    const columnCount = Math.max(20, Math.floor(plotW));
    const columns = histogram.rebin(view.minGeV, view.maxGeV, columnCount);
    columnsRef.current = { counts: columns, from: view.minGeV, to: view.maxGeV };
    let maxCount = 1;
    for (let i = 0; i < columns.length; i++) if (columns[i]! > maxCount) maxCount = columns[i]!;

    const xOf = (mass: number) => MARGIN.left + ((mass - view.minGeV) / (view.maxGeV - view.minGeV)) * plotW;
    const yOf = (count: number) => {
      const f = logScale ? Math.log10(1 + count) / Math.log10(1 + maxCount) : count / maxCount;
      return MARGIN.top + plotH - f * plotH;
    };

    // Window and sidebands.
    const half = (win.maxGeV - win.minGeV) / 2;
    ctx.fillStyle = surface2;
    ctx.fillRect(xOf(win.minGeV - half), MARGIN.top, xOf(win.minGeV) - xOf(win.minGeV - half), plotH);
    ctx.fillRect(xOf(win.maxGeV), MARGIN.top, xOf(win.maxGeV + half) - xOf(win.maxGeV), plotH);
    ctx.fillStyle = accentSoft;
    ctx.fillRect(xOf(win.minGeV), MARGIN.top, xOf(win.maxGeV) - xOf(win.minGeV), plotH);

    // Axes.
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, MARGIN.top);
    ctx.lineTo(MARGIN.left, MARGIN.top + plotH);
    ctx.lineTo(MARGIN.left + plotW, MARGIN.top + plotH);
    ctx.stroke();

    ctx.font = '11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = ink2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xStep = niceStep(view.maxGeV - view.minGeV, 6);
    for (let m = Math.ceil(view.minGeV / xStep) * xStep; m <= view.maxGeV + 1e-9; m += xStep) {
      const x = xOf(m);
      ctx.beginPath();
      ctx.moveTo(x, MARGIN.top + plotH);
      ctx.lineTo(x, MARGIN.top + plotH + 4);
      ctx.stroke();
      ctx.fillText(number(Math.round(m * 1000) / 1000), x, MARGIN.top + plotH + 7);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    if (logScale) {
      for (let p = 0; 10 ** p <= maxCount; p++) {
        const y = yOf(10 ** p);
        ctx.fillText(p === 0 ? '1' : `10${superscript(p)}`, MARGIN.left - 6, y);
      }
    } else {
      const yStep = niceStep(maxCount, 4);
      for (let c = 0; c <= maxCount; c += yStep) ctx.fillText(number(c), MARGIN.left - 6, yOf(c));
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(t('histogram.axisMass'), MARGIN.left + plotW - ctx.measureText(t('histogram.axisMass')).width, MARGIN.top + plotH + 32);
    ctx.save();
    ctx.translate(12, MARGIN.top);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right';
    ctx.fillText(t('histogram.axisCounts'), 0, 0);
    ctx.restore();

    // Bars.
    ctx.fillStyle = accent;
    const colW = plotW / columnCount;
    for (let i = 0; i < columnCount; i++) {
      const c = columns[i]!;
      if (c <= 0) continue;
      const x = MARGIN.left + i * colW;
      const y = yOf(c);
      ctx.fillRect(x, y, Math.max(1, colW), MARGIN.top + plotH - y);
    }

    // Known masses.
    if (props.showKnownMasses) {
      ctx.strokeStyle = peak;
      ctx.fillStyle = peak;
      ctx.setLineDash([3, 3]);
      ctx.font = '600 11px "IBM Plex Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (const known of KNOWN) {
        if (known.mass < view.minGeV || known.mass > view.maxGeV) continue;
        const x = xOf(known.mass);
        ctx.beginPath();
        ctx.moveTo(x, MARGIN.top);
        ctx.lineTo(x, MARGIN.top + plotH);
        ctx.stroke();
        ctx.fillText(known.label, x + 3, MARGIN.top);
      }
      ctx.setLineDash([]);
    }
    ctx.fillStyle = ink;
  }, [props, t, number]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cols = columnsRef.current;
    const canvas = canvasRef.current;
    if (!cols || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const plotW = rect.width - MARGIN.left - MARGIN.right;
    const f = (e.clientX - rect.left - MARGIN.left) / plotW;
    if (f < 0 || f >= 1) {
      setHover(null);
      return;
    }
    const index = Math.floor(f * cols.counts.length);
    const mass = cols.from + f * (cols.to - cols.from);
    setHover({ mass, count: cols.counts[index] ?? 0 });
  };

  return (
    <div className="histogram-wrap">
      <canvas
        ref={canvasRef}
        className="histogram-canvas"
        role="img"
        aria-label={t('analysis.title')}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      />
      <div className="histogram-hover mono" aria-live="polite">
        {hover ? t('histogram.hover', { mass: Math.round(hover.mass * 100) / 100, count: Math.round(hover.count) }) : ' '}
      </div>
    </div>
  );
}

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUP[Number(d)] ?? d)
    .join('');
}
