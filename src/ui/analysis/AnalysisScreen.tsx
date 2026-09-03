import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { buildHistogram } from '../../physics/analysis/builder';
import { fitPeak, type PeakFit } from '../../physics/analysis/fit';
import { applySelection, defaultSelection, type Selection } from '../../physics/analysis/selection';
import { VARIABLES, defaultBins, defaultRange, type Variable } from '../../physics/analysis/variables';
import { CHANNELS, CHANNEL_DEFINITIONS, type Channel } from '../../physics/collision/channels';
import type { CollisionRun } from '../../physics/collision/run';
import { Hint } from '../Hint';
import { EventDisplay } from '../EventDisplay';
import { ExplainerButton, type ExplainerTopic } from '../explainers/Explainer';
import { integratedLuminosityDisplay } from '../units';
import { EventTable } from './EventTable';
import { FitPanel } from './FitPanel';
import { PlotCanvas } from './PlotCanvas';
import { SelectionEditor } from './SelectionEditor';
import { PassportPanel } from './PassportPanel';

interface Props {
  run: CollisionRun;
  runVersion: number;
  channel: Channel;
  onChannel(channel: Channel): void;
  onExplain(topic: ExplainerTopic): void;
  /** √s the data is being taken at, for acceptance simulation and cross-section tables. */
  sqrtSGeV: number;
}

const STORAGE_KEY = 'lhc-simulator.selections';

type SelectionsByChannel = Record<Channel, Selection[]>;

function initialSelections(): SelectionsByChannel {
  const fallback: SelectionsByChannel = {
    mumu: [defaultSelection('mumu-1', 'μμ, pT > 3', 3)],
    gammagamma: [defaultSelection('gg-1', 'γγ, pT > 30', 30)],
    fourlepton: [defaultSelection('fl-1', '4ℓ, pT > 7', 7)],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SelectionsByChannel>;
    for (const channel of CHANNELS) {
      if (Array.isArray(parsed[channel]) && parsed[channel]!.length > 0) fallback[channel] = parsed[channel]!;
    }
  } catch {
    // ignore
  }
  return fallback;
}

let selectionCounter = Date.now() % 100000;

function downloadCsv(name: string, rows: string[][]): void {
  const text = rows.map((r) => r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AnalysisScreen({ run, runVersion, channel, onChannel, onExplain, sqrtSGeV }: Props) {
  const { t, number, scientific } = useI18n();
  const definition = CHANNEL_DEFINITIONS[channel];
  const store = run.stores[channel];

  const [selections, setSelections] = useState<SelectionsByChannel>(initialSelections);
  const [activeByChannel, setActiveByChannel] = useState<Record<Channel, string>>({
    mumu: 'mumu-1',
    gammagamma: 'gg-1',
    fourlepton: 'fl-1',
  });
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [variable, setVariable] = useState<Variable>('mass');
  const [bins, setBins] = useState(200);
  const [range, setRange] = useState(() => defaultRange('mass', definition.spec.min, definition.spec.max));
  const [logScale, setLogScale] = useState(true);
  const [fitRange, setFitRange] = useState({ min: 80, max: 100 });
  const [guess, setGuess] = useState({ mean: 91, sigma: 2 });
  const [fit, setFit] = useState<PeakFit | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
    } catch {
      // ignore
    }
  }, [selections]);

  // Reset plot range when the channel or variable changes.
  useEffect(() => {
    setRange(defaultRange(variable, definition.spec.min, definition.spec.max));
    setBins(defaultBins(variable));
    setFit(null);
  }, [variable, channel, definition.spec.min, definition.spec.max]);

  const list = selections[channel];
  const activeId = list.some((s) => s.id === activeByChannel[channel]) ? activeByChannel[channel] : list[0]!.id;
  const active = list.find((s) => s.id === activeId)!;
  const overlay = overlayId ? list.find((s) => s.id === overlayId) ?? null : null;

  const spec = useMemo(() => ({ min: range.min, max: range.max, bins: Math.max(10, Math.min(2000, Math.round(bins))) }), [range, bins]);
  const built = useMemo(() => buildHistogram(store, active, variable, spec), [store, runVersion, active, variable, spec]);
  const builtOverlay = useMemo(() => (overlay ? buildHistogram(store, overlay, variable, spec) : null), [store, runVersion, overlay, variable, spec]);
  const mask = useMemo(() => applySelection(store, active).mask, [store, runVersion, active]);
  const totalWeight = useMemo(() => store.representedEvents, [store, runVersion]);

  const fills = useMemo(() => {
    const c = store.columns;
    const counts = new Map<number, number>();
    for (let i = 0; i < c.count; i++) counts.set(c.fill[i]!, (counts.get(c.fill[i]!) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([fill, records]) => ({ fill, records }));
  }, [store, runVersion]);

  const updateSelection = (next: Selection) =>
    setSelections((s) => ({ ...s, [channel]: s[channel].map((x) => (x.id === next.id ? next : x)) }));
  const addSelection = () => {
    selectionCounter += 1;
    const copy: Selection = { ...active, id: `${channel}-${selectionCounter}`, name: `${active.name} (2)` };
    setSelections((s) => ({ ...s, [channel]: [...s[channel], copy] }));
    setActiveByChannel((a) => ({ ...a, [channel]: copy.id }));
  };
  const deleteSelection = (id: string) => {
    setSelections((s) => ({ ...s, [channel]: s[channel].filter((x) => x.id !== id) }));
    if (overlayId === id) setOverlayId(null);
  };

  const runFit = useCallback(() => {
    if (variable !== 'mass') return;
    setFit(fitPeak(built.histogram, fitRange, guess));
  }, [variable, built, fitRange, guess]);

  const curve = useMemo(() => {
    if (!fit || variable !== 'mass') return null;
    const centre = (fit.range.min + fit.range.max) / 2;
    const amp = (fit.yield * built.histogram.width) / (fit.sigma * Math.sqrt(2 * Math.PI));
    return (x: number) => {
      if (x < fit.range.min || x > fit.range.max) return NaN;
      return amp * Math.exp(-((x - fit.mean) ** 2) / (2 * fit.sigma * fit.sigma)) + fit.background.amplitude * Math.exp(fit.background.slope * (x - centre));
    };
  }, [fit, variable, built.histogram.width]);

  const exportEvents = () => {
    const rows: string[][] = [['mass_GeV', 'weight', 'fill', 'sqrt_s_GeV', 'particles']];
    const c = store.columns;
    let n = 0;
    for (let i = c.count - 1; i >= 0 && n < 50000; i--) {
      if (mask[i] !== 1) continue;
      const r = store.get(i);
      rows.push([
        r.massGeV.toFixed(3),
        r.weight.toFixed(3),
        String(r.fill),
        String(r.sqrtSGeV),
        r.particles.map((p) => `${p.kind}:${p.charge}:${p.ptGeV.toFixed(2)}:${p.eta.toFixed(3)}:${p.phi.toFixed(3)}`).join(' '),
      ]);
      n += 1;
    }
    downloadCsv(`events-${channel}.csv`, rows);
  };
  const exportHistogram = () => {
    const h = built.histogram;
    const rows: string[][] = [[`${variable}_low`, `${variable}_high`, 'events']];
    for (let b = 0; b < h.spec.bins; b++) rows.push([h.binLowEdge(b).toFixed(4), (h.binLowEdge(b) + h.width).toFixed(4), h.counts[b]!.toFixed(3)]);
    downloadCsv(`histogram-${channel}-${variable}.csv`, rows);
  };

  const integrated = integratedLuminosityDisplay(run.integratedLuminosityM2);

  return (
    <div className="analysis-screen">
      <header className="analysis-head">
        <div>
          <h2>{t('analysisScreen.title')}</h2>
          <p className="note">{t('analysisScreen.lede')}</p>
        </div>
        <div className="analysis-summary">
          <div className="segmented" role="radiogroup" aria-label={t('analysisScreen.channel')}>
            {CHANNELS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={channel === c} className={channel === c ? 'active' : ''} onClick={() => onChannel(c)}>
                {t(`channel.${c}`)}
              </button>
            ))}
          </div>
          <div className="live-row">
            <span className="live">
              <span className="live-label">{t('analysisScreen.recorded')}</span>
              <span className="live-value mono">{number(store.size)}</span>
            </span>
            <span className="live">
              <span className="live-label">{t('analysisScreen.represented')}</span>
              <span className="live-value mono">{totalWeight >= 1e6 ? scientific(totalWeight, 2) : number(Math.round(totalWeight))}</span>
            </span>
            <span className="live">
              <span className="live-label">{t('analysisScreen.fills')}</span>
              <span className="live-value mono">{number(fills.length)}</span>
            </span>
            <span className="live">
              <span className="live-label">{t('analysisScreen.integrated')}</span>
              <span className="live-value mono">
                {number(integrated.value, { maximumSignificantDigits: 3 })} {t(integrated.unitKey)}
              </span>
            </span>
          </div>
          <div className="button-row">
            <ExplainerButton topic="detector" onOpen={onExplain} labelKey="explainer.detector.button" />
            <span className="eyebrow">{t('analysisScreen.export')}</span>
            <button type="button" onClick={exportEvents}>
              {t('analysisScreen.exportEvents')}
            </button>
            <button type="button" onClick={exportHistogram}>
              {t('analysisScreen.exportHistogram')}
            </button>
          </div>
        </div>
      </header>

      <div className="analysis-grid">
        <SelectionEditor
          selections={list}
          activeId={activeId}
          overlayId={overlayId}
          fills={fills}
          stats={{ passed: built.passed, weight: built.weight, total: totalWeight }}
          ptRange={definition.ptMinRange}
          massRange={[definition.spec.min, definition.spec.max]}
          onSelect={(id) => setActiveByChannel((a) => ({ ...a, [channel]: id }))}
          onOverlay={setOverlayId}
          onChange={updateSelection}
          onAdd={addSelection}
          onDelete={deleteSelection}
        />

        <section className="panel plot-panel" aria-labelledby="plot-title">
          <div className="panel-head">
            <h2 id="plot-title">{t('plot.title')}</h2>
            <Hint textKey="hint.plot.what" href="https://en.wikipedia.org/wiki/Histogram" />
          </div>
          <div className="plot-controls">
            <label>
              <span>{t('plot.variable')}</span>
              <select value={variable} onChange={(e) => setVariable(e.target.value as Variable)}>
                {VARIABLES.map((v) => (
                  <option key={v} value={v}>
                    {t(`variable.${v}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('plot.range')}</span>
              <span className="window-inputs">
                <input type="number" step="any" value={range.min} onChange={(e) => setRange({ ...range, min: Number(e.target.value) })} />
                <span>–</span>
                <input type="number" step="any" value={range.max} onChange={(e) => setRange({ ...range, max: Number(e.target.value) })} />
              </span>
            </label>
            <label>
              <span>{t('plot.bins')}</span>
              <input type="number" className="mono knob-input" min={10} max={2000} step={10} value={bins} onChange={(e) => setBins(Number(e.target.value))} />
            </label>
            <label className="check">
              <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
              {t('plot.log')}
            </label>
          </div>
          <PlotCanvas
            series={[
              { histogram: built.histogram, label: active.name, color: '--accent' },
              ...(builtOverlay ? [{ histogram: builtOverlay.histogram, label: overlay!.name, color: '--peak' }] : []),
            ]}
            range={range}
            logScale={logScale}
            xLabel={t(`variable.${variable}`)}
            curve={curve}
            shade={fit && variable === 'mass' ? fit.range : null}
          />
          <div className="readout">
            <span className="readout-label">{t('plot.entries')}</span>
            <span className="readout-value mono">{number(Math.round(built.histogram.entries))}</span>
          </div>
        </section>

        <FitPanel enabled={variable === 'mass'} range={fitRange} guess={guess} result={fit} onRange={setFitRange} onGuess={setGuess} onFit={runFit} />

        <PassportPanel
          store={store}
          runVersion={runVersion}
          channel={channel}
          selection={active}
          fit={variable === 'mass' ? fit : null}
          integratedLuminosityM2={run.integratedLuminosityM2}
          sqrtSGeV={sqrtSGeV}
        />

        <EventTable store={store} version={runVersion} mask={mask} selected={selectedEvent} onSelect={setSelectedEvent} />

        {selectedEvent !== null && selectedEvent < store.size && (
          <section className="panel event-panel" aria-labelledby="event-panel-title">
            <div className="panel-head">
              <h2 id="event-panel-title">{t('display.title')}</h2>
              <button type="button" onClick={() => setSelectedEvent(null)}>
                {t('explainer.close')}
              </button>
            </div>
            <EventDisplay
              particles={store.get(selectedEvent).particles}
              massGeV={store.get(selectedEvent).massGeV}
              sqrtSGeV={store.get(selectedEvent).sqrtSGeV}
            />
          </section>
        )}
      </div>
    </div>
  );
}
