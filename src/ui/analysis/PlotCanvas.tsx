import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { Histogram } from '../../physics/analysis/histogram';

export interface PlotSeries {
  histogram: Histogram;
  label: string;
  /** CSS variable name for the colour, e.g. '--accent'. */
  color: string;
}

export interface PlotAnnotations {
  /** Shaded x-ranges with a label: the search window and its sidebands. */
  bands?: { min: number; max: number; kind: 'window' | 'sideband'; label: string }[];
  /** Smooth background in counts per histogram bin, drawn dashed under the data. */
  background?: ((x: number) => number) | null;
  /** Draw the ±√N noise band around the background. */
  noise?: boolean;
}

interface Props {
  series: PlotSeries[];
  range: { min: number; max: number };
  logScale: boolean;
  xLabel: string;
  /** Optional fitted curve in counts per histogram bin, drawn over the first series. */
  curve?: ((x: number) => number) | null;
  /** Optional shaded x-range (e.g. the fit range). */
  shade?: { min: number; max: number } | null;
  annotations?: PlotAnnotations | null;
}

const MARGIN = { left: 60, right: 16, top: 26, bottom: 36 };

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

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const superscript = (n: number) => String(n).split('').map((d) => SUP[Number(d)] ?? d).join('');

/** Generic histogram plot with up to two series, an optional fit curve and hover readout. */
export function PlotCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const columnsRef = useRef<{ from: number; to: number; columns: Float64Array[] } | null>(null);
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
    const line = cssVar(canvas, '--line', '#D5DBE3');
    const ink = cssVar(canvas, '--ink', '#17222E');
    const ink2 = cssVar(canvas, '--ink-2', '#5B6B7C');
    const surface2 = cssVar(canvas, '--surface-2', '#E9EDF2');
    const peak = cssVar(canvas, '--peak', '#D4661F');

    const plotW = Math.max(10, rect.width - MARGIN.left - MARGIN.right);
    const plotH = Math.max(10, rect.height - MARGIN.top - MARGIN.bottom);
    const { range, logScale, series } = props;
    const columnCount = Math.max(20, Math.floor(plotW));
    const columns = series.map((s) => s.histogram.rebin(range.min, range.max, columnCount));
    columnsRef.current = { from: range.min, to: range.max, columns };
    let maxCount = 1;
    for (const col of columns) for (let i = 0; i < col.length; i++) if (col[i]! > maxCount) maxCount = col[i]!;
    // The curve may exceed the columns; account for it when scaling.
    const first = series[0];
    if (props.curve && first) {
      const perColumn = (range.max - range.min) / columnCount / first.histogram.width;
      for (let i = 0; i < columnCount; i++) {
        const x = range.min + ((i + 0.5) * (range.max - range.min)) / columnCount;
        const y = props.curve(x) * perColumn;
        if (Number.isFinite(y) && y > maxCount) maxCount = y;
      }
    }
    const perColumnOf = (h: Histogram) => (range.max - range.min) / columnCount / h.width;
    if (props.annotations?.background && first) {
      const perColumn = perColumnOf(first.histogram);
      for (let i = 0; i < columnCount; i++) {
        const x = range.min + ((i + 0.5) * (range.max - range.min)) / columnCount;
        const y = props.annotations.background(x) * perColumn;
        if (Number.isFinite(y) && y > maxCount) maxCount = y;
      }
    }
    const xOf = (x: number) => MARGIN.left + ((x - range.min) / (range.max - range.min)) * plotW;
    const yOf = (count: number) => {
      const f = logScale ? Math.log10(1 + Math.max(0, count)) / Math.log10(1 + maxCount) : Math.max(0, count) / maxCount;
      return MARGIN.top + plotH - f * plotH;
    };

    if (props.shade) {
      ctx.fillStyle = surface2;
      ctx.fillRect(xOf(props.shade.min), MARGIN.top, xOf(props.shade.max) - xOf(props.shade.min), plotH);
    }
    const accent = cssVar(canvas, '--accent', '#2456B8');
    for (const band of props.annotations?.bands ?? []) {
      const x0 = Math.max(MARGIN.left, xOf(band.min));
      const x1 = Math.min(MARGIN.left + plotW, xOf(band.max));
      if (x1 <= x0) continue;
      ctx.save();
      ctx.globalAlpha = band.kind === 'window' ? 0.16 : 0.5;
      ctx.fillStyle = band.kind === 'window' ? accent : surface2;
      ctx.fillRect(x0, MARGIN.top, x1 - x0, plotH);
      ctx.restore();
      ctx.font = '600 11px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillStyle = band.kind === 'window' ? accent : ink2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(band.label, (x0 + x1) / 2, MARGIN.top + 18);
    }

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
    const xStep = niceStep(range.max - range.min, 6);
    for (let m = Math.ceil(range.min / xStep) * xStep; m <= range.max + 1e-9; m += xStep) {
      const x = xOf(m);
      ctx.beginPath();
      ctx.moveTo(x, MARGIN.top + plotH);
      ctx.lineTo(x, MARGIN.top + plotH + 4);
      ctx.stroke();
      ctx.fillText(number(Math.round(m * 1000) / 1000 + 0), x, MARGIN.top + plotH + 7);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    if (logScale) {
      for (let p = 0; 10 ** p <= maxCount; p++) ctx.fillText(p === 0 ? '1' : `10${superscript(p)}`, MARGIN.left - 6, yOf(10 ** p));
    } else {
      const yStep = niceStep(maxCount, 4);
      for (let c = 0; c <= maxCount; c += yStep) ctx.fillText(number(Math.round(c)), MARGIN.left - 6, yOf(c));
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(props.xLabel, MARGIN.left + plotW - ctx.measureText(props.xLabel).width, MARGIN.top + plotH + 34);

    // Series: first as filled bars, the rest as outlines.
    const colW = plotW / columnCount;
    series.forEach((s, index) => {
      const color = cssVar(canvas, s.color, '#2456B8');
      const col = columns[index]!;
      if (index === 0) {
        ctx.fillStyle = color;
        for (let i = 0; i < columnCount; i++) {
          const c = col[i]!;
          if (c <= 0) continue;
          const y = yOf(c);
          ctx.fillRect(MARGIN.left + i * colW, y, Math.max(1, colW), MARGIN.top + plotH - y);
        }
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < columnCount; i++) {
          const y = yOf(col[i]!);
          const x = MARGIN.left + i * colW;
          if (i === 0) ctx.moveTo(x, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x + colW, y);
        }
        ctx.stroke();
      }
      // Legend.
      ctx.font = '600 11px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(s.label, MARGIN.left + 6 + index * 180, 6);
    });

    if (props.annotations?.background && first) {
      const perColumn = perColumnOf(first.histogram);
      const values: number[] = [];
      for (let i = 0; i < columnCount; i++) {
        const x = range.min + ((i + 0.5) * (range.max - range.min)) / columnCount;
        const v = props.annotations.background(x) * perColumn;
        values.push(Number.isFinite(v) ? Math.max(0, v) : NaN);
      }
      if (props.annotations.noise) {
        // ±√N around the background: what pure statistics can do to a column.
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = peak;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < columnCount; i++) {
          const v = values[i]!;
          if (Number.isNaN(v)) continue;
          const px = MARGIN.left + (i + 0.5) * colW;
          if (!started) ctx.moveTo(px, yOf(v + Math.sqrt(v)));
          else ctx.lineTo(px, yOf(v + Math.sqrt(v)));
          started = true;
        }
        for (let i = columnCount - 1; i >= 0; i--) {
          const v = values[i]!;
          if (Number.isNaN(v)) continue;
          ctx.lineTo(MARGIN.left + (i + 0.5) * colW, yOf(Math.max(0, v - Math.sqrt(v))));
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = ink;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < columnCount; i++) {
        const v = values[i]!;
        if (Number.isNaN(v)) {
          pen = false;
          continue;
        }
        const px = MARGIN.left + (i + 0.5) * colW;
        if (!pen) ctx.moveTo(px, yOf(v));
        else ctx.lineTo(px, yOf(v));
        pen = true;
      }
      ctx.stroke();
      ctx.restore();
    }

    if (props.curve && first) {
      const perColumn = (range.max - range.min) / columnCount / first.histogram.width;
      ctx.strokeStyle = peak;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < columnCount; i++) {
        const x = range.min + ((i + 0.5) * (range.max - range.min)) / columnCount;
        const value = props.curve(x) * perColumn;
        if (!Number.isFinite(value)) {
          pen = false;
          continue;
        }
        const y = yOf(value);
        const px = MARGIN.left + (i + 0.5) * colW;
        if (!pen) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
        pen = true;
      }
      ctx.stroke();
    }
    ctx.fillStyle = ink;
  }, [props, number]);

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
    const x = cols.from + f * (cols.to - cols.from);
    const values = cols.columns.map((c) => Math.round(c[Math.floor(f * c.length)] ?? 0));
    setHover(`${number(Math.round(x * 100) / 100)}: ${values.map((v) => number(v)).join(' / ')}`);
  };

  return (
    <div className="plot-wrap">
      <canvas ref={canvasRef} className="plot-canvas" role="img" aria-label={t('plot.title')} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      <div className="histogram-hover mono">{hover ?? ' '}</div>
    </div>
  );
}
