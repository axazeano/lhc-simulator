import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n/I18nProvider';
import { LOCALES, LOCALE_IDS } from './i18n';
import {
  LHC_DESIGN_BEAM,
  LHC_MACHINE_CONFIG,
  advance,
  centerOfMassEnergyCollider,
  createMachine,
  dump,
  inject,
  lorentzBeta,
  lorentzGamma,
  luminosityM2S,
  setFieldMode,
  setManualField,
  setTargetEnergy,
  type BeamParameters,
  type FieldMode,
  type MachineState,
} from './physics/accelerator';
import { analyseWindow, type MassWindow } from './physics/analysis/window';
import { CollisionRun, crossSectionNb, processById } from './physics/collision';
import type { SelectionCuts } from './physics/detector/detector';
import { AnalysisPanel, VIEW_PRESETS } from './ui/AnalysisPanel';
import { BeamPanel } from './ui/BeamPanel';
import { ControlPanel } from './ui/ControlPanel';
import { HistogramCanvas } from './ui/HistogramCanvas';
import { Readouts } from './ui/Readouts';
import { RingCanvas } from './ui/RingCanvas';

/** Collisions happen whenever a beam is circulating and not being ramped. */
function isColliding(machine: MachineState): boolean {
  return machine.status === 'stable' || machine.status === 'injected';
}

const COLLECT_INTERVAL_MS = 100;

export function App() {
  const { t, locale, setLocale } = useI18n();
  const [machine, setMachine] = useState<MachineState>(() => createMachine());
  const [timeSpeed, setTimeSpeed] = useState(1);
  const [beam, setBeam] = useState<BeamParameters>(LHC_DESIGN_BEAM);
  const [cuts, setCuts] = useState<SelectionCuts>({ muonPtMinGeV: 3 });
  const [view, setView] = useState<MassWindow>(VIEW_PRESETS[0]!.view);
  const [massWindow, setMassWindow] = useState<MassWindow>(VIEW_PRESETS[0]!.window);
  const [logScale, setLogScale] = useState(true);
  const [showKnownMasses, setShowKnownMasses] = useState(false);
  const [runVersion, setRunVersion] = useState(0);

  // The simulation loop reads the latest state through refs so that actions and ticks never race.
  const machineRef = useRef(machine);
  const timeSpeedRef = useRef(timeSpeed);
  const beamRef = useRef(beam);
  const cutsRef = useRef(cuts);
  timeSpeedRef.current = timeSpeed;
  beamRef.current = beam;
  cutsRef.current = cuts;
  const runRef = useRef<CollisionRun | null>(null);
  runRef.current ??= new CollisionRun(Date.now() >>> 0);
  const run = runRef.current;

  const update = useCallback((fn: (state: MachineState) => MachineState) => {
    const next = fn(machineRef.current);
    if (next !== machineRef.current) {
      machineRef.current = next;
      setMachine(next);
    }
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let pendingLuminosityM2 = 0;
    let lastCollect = last;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      const gameDt = dt * timeSpeedRef.current;
      update((state) => advance(state, gameDt));
      const state = machineRef.current;
      if (isColliding(state)) {
        const gamma = lorentzGamma(state.energyGeV);
        const beta = lorentzBeta(state.energyGeV);
        pendingLuminosityM2 += luminosityM2S(beamRef.current, LHC_MACHINE_CONFIG.revolutionFrequencyHz, gamma, beta) * gameDt;
      }
      if (now - lastCollect >= COLLECT_INTERVAL_MS) {
        lastCollect = now;
        if (pendingLuminosityM2 > 0 && isColliding(state)) {
          run.collect(pendingLuminosityM2, centerOfMassEnergyCollider(state.energyGeV), cutsRef.current);
          pendingLuminosityM2 = 0;
          setRunVersion((v) => v + 1);
        } else {
          pendingLuminosityM2 = 0;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [update, run]);

  const config = LHC_MACHINE_CONFIG;
  const energyFraction =
    machine.status === 'empty'
      ? 0
      : (machine.energyGeV - config.injectionEnergyGeV) / (config.maxEnergyGeV - config.injectionEnergyGeV);

  const colliding = isColliding(machine);
  const luminosityCm2S = useMemo(() => {
    if (machine.status === 'empty') return null;
    const gamma = lorentzGamma(machine.energyGeV);
    const beta = lorentzBeta(machine.energyGeV);
    return luminosityM2S(beam, config.revolutionFrequencyHz, gamma, beta) * 1e-4;
  }, [machine.status, machine.energyGeV, beam, config.revolutionFrequencyHz]);
  const collisionRatePerS =
    luminosityCm2S === null
      ? null
      : crossSectionNb(processById('inelastic'), centerOfMassEnergyCollider(machine.energyGeV)) * 1e-33 * luminosityCm2S;

  // Readouts of the run are derived on every version bump (about ten times per second).
  const snapshot = useMemo(() => run.snapshot(), [run, runVersion]);
  const analysis = useMemo(() => analyseWindow(run.histogram, massWindow), [run, runVersion, massWindow]);

  const resetRun = useCallback(() => {
    run.reset();
    setRunVersion((v) => v + 1);
  }, [run]);

  const onCuts = (next: SelectionCuts) => {
    setCuts(next);
    resetRun();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="eyebrow">{t('app.stage')}</p>
        </div>
        <label className="language">
          <span className="eyebrow">{t('app.language')}</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
            {LOCALE_IDS.map((id) => (
              <option key={id} value={id}>
                {LOCALES[id].name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="layout">
        <div className="ring-wrap">
          <RingCanvas machine={machine} energyFraction={energyFraction} />
        </div>
        <ControlPanel
          machine={machine}
          timeSpeed={timeSpeed}
          onInject={() => update((s) => inject(s))}
          onDump={() => update((s) => dump(s))}
          onTargetEnergy={(e) => update((s) => setTargetEnergy(s, e))}
          onFieldMode={(mode: FieldMode) => update((s) => setFieldMode(s, mode))}
          onManualField={(b) => update((s) => setManualField(s, b))}
          onTimeSpeed={setTimeSpeed}
        />
        <Readouts machine={machine} />
        <BeamPanel
          beam={beam}
          colliding={colliding}
          luminosityCm2S={luminosityCm2S}
          integratedLuminosityM2={snapshot.integratedLuminosityM2}
          collisionRatePerS={colliding ? collisionRatePerS : null}
          collisions={snapshot.collisions}
          onBeam={setBeam}
        />
        <div className="histogram-panel panel">
          <HistogramCanvas
            histogram={run.histogram}
            version={runVersion}
            view={view}
            window={massWindow}
            logScale={logScale}
            showKnownMasses={showKnownMasses}
          />
        </div>
        <AnalysisPanel
          cuts={cuts}
          window={massWindow}
          view={view}
          logScale={logScale}
          showKnownMasses={showKnownMasses}
          entries={snapshot.entries}
          analysis={analysis}
          onCuts={onCuts}
          onWindow={setMassWindow}
          onView={(nextView, nextWindow) => {
            setView(nextView);
            if (nextWindow) setMassWindow(nextWindow);
          }}
          onLogScale={setLogScale}
          onShowKnownMasses={setShowKnownMasses}
          onReset={resetRun}
        />
      </main>

      <footer className="app-footer">{t('footer.sources')}</footer>
    </div>
  );
}
