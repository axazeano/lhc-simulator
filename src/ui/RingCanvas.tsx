import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { MachineState } from '../physics/accelerator';

interface Props {
  machine: MachineState;
  /** 0..1, how far the beam is from injection to maximum energy. */
  energyFraction: number;
}

/** The four interaction points and the octant they sit in (1 = top, counting clockwise). */
const INTERACTION_POINTS = [
  { key: 'ip.atlas', octant: 1 },
  { key: 'ip.alice', octant: 2 },
  { key: 'ip.cms', octant: 5 },
  { key: 'ip.lhcb', octant: 8 },
];

const BUNCHES_DRAWN = 36;

function cssVar(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export function RingCanvas({ machine, energyFraction }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ machine, energyFraction });
  latest.current = { machine, energyFraction };
  const { t } = useI18n();
  const labels = useRef(INTERACTION_POINTS.map((ip) => ({ ...ip, label: t(ip.key) })));
  labels.current = INTERACTION_POINTS.map((ip) => ({ ...ip, label: t(ip.key) }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let angle = 0;
    let lastTime = performance.now();
    let lostAt: number | null = null;

    const draw = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const { machine: m, energyFraction: f } = latest.current;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const accent = cssVar(canvas, '--accent') || '#2456B8';
      const peak = cssVar(canvas, '--peak') || '#D4661F';
      const line = cssVar(canvas, '--line') || '#D5DBE3';
      const ink = cssVar(canvas, '--ink') || '#17222E';
      const ink2 = cssVar(canvas, '--ink-2') || '#5B6B7C';
      const danger = cssVar(canvas, '--danger') || '#C0392B';

      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const radius = Math.min(rect.width, rect.height) * 0.38;
      const beamPresent = m.status !== 'empty' && m.status !== 'lost';

      if (m.status === 'lost') {
        lostAt ??= now;
      } else {
        lostAt = null;
      }

      // Ring: the beam pipe.
      ctx.lineWidth = 10;
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Octant ticks.
      ctx.strokeStyle = ink2;
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2 - Math.PI / 8;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (radius - 9), cy + Math.sin(a) * (radius - 9));
        ctx.lineTo(cx + Math.cos(a) * (radius + 9), cy + Math.sin(a) * (radius + 9));
        ctx.stroke();
      }

      // Interaction points with labels.
      ctx.font = '600 12px "IBM Plex Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const ip of labels.current) {
        const a = ((ip.octant - 1) / 8) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * radius;
        const y = cy + Math.sin(a) * radius;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        const lx = cx + Math.cos(a) * (radius + 26);
        const ly = cy + Math.sin(a) * (radius + 26);
        ctx.fillStyle = ink2;
        ctx.fillText(ip.label, lx, ly);
      }

      // Beams: two counter-rotating trains of bunches. Visual speed is decorative,
      // the real revolution frequency of 11 kHz cannot be shown.
      if (beamPresent) {
        angle += dt * (0.6 + 1.4 * f);
        const glow = 0.35 + 0.65 * f;
        for (const direction of [1, -1] as const) {
          const r = radius + direction * 3.5;
          for (let i = 0; i < BUNCHES_DRAWN; i++) {
            const a = direction * angle + (i / BUNCHES_DRAWN) * Math.PI * 2;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            ctx.fillStyle = direction === 1 ? accent : peak;
            ctx.globalAlpha = glow;
            ctx.beginPath();
            ctx.arc(x, y, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }

      if (lostAt !== null) {
        const age = (now - lostAt) / 1000;
        const alpha = Math.max(0, 1 - age / 1.5);
        ctx.strokeStyle = danger;
        ctx.globalAlpha = 0.25 + 0.75 * alpha;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 14 + age * 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Centre readout: energy.
      ctx.fillStyle = ink;
      ctx.font = '700 28px Manrope, "IBM Plex Sans", system-ui, sans-serif';
      const energyText = beamPresent || m.status === 'lost' ? `${(m.energyGeV / 1000).toFixed(2)} TeV` : '—';
      ctx.fillText(energyText, cx, cy - 8);
      ctx.fillStyle = ink2;
      ctx.font = '500 12px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(`B = ${m.fieldT.toFixed(2)} T`, cx, cy + 18);

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} className="ring-canvas" role="img" aria-label={t('app.title')} />;
}
