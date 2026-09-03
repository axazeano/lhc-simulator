import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n/I18nProvider';
import { LOCALES, LOCALE_IDS } from './i18n';
import {
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
import { CollisionRun, DEFAULT_CUTS, crossSectionNb, processById, type Channel, type CutsByChannel } from './physics/collision';
import type { SelectionCuts } from './physics/detector/detector';
import { evaluateLevel, levelById, type Level, type LevelStatus, type Snapshot } from './tutorial/levels';
import { loadProgress, saveProgress } from './tutorial/progress';
import { AnalysisPanel, VIEW_PRESETS } from './ui/AnalysisPanel';
import { BeamPanel } from './ui/BeamPanel';
import { ControlPanel } from './ui/ControlPanel';
import { HistogramCanvas } from './ui/HistogramCanvas';
import { Readouts } from './ui/Readouts';
import { RingCanvas } from './ui/RingCanvas';
import { TutorialPanel } from './ui/TutorialPanel';
import { ExplainerDialog, type ExplainerTopic } from './ui/explainers/Explainer';
import { BeamExplainer } from './ui/explainers/BeamExplainer';
import { MagnetExplainer } from './ui/explainers/MagnetExplainer';
import { MassExplainer } from './ui/explainers/MassExplainer';

/** Collisions happen whenever a beam is circulating and not being ramped. */
function isColliding(machine: MachineState): boolean {
  return machine.status === 'stable' || machine.status === 'injected';
}

const COLLECT_INTERVAL_MS = 100;

function machineForLevel(level: Level): MachineState {
  let m = createMachine();
  m = setTargetEnergy(m, level.setup.targetEnergyGeV);
  m = setFieldMode(m, level.setup.fieldMode);
  if (level.setup.manualFieldT !== undefined) m = setManualField(m, level.setup.manualFieldT);
  return m;
}

export function App() {
  const { t, locale, setLocale } = useI18n();
  const [progress, setProgress] = useState(() => loadProgress());
  const [level, setLevel] = useState<Level>(() => levelById(loadProgress().currentLevel));
  const [levelStatus, setLevelStatus] = useState<LevelStatus>('playing');
  const [quizCorrect, setQuizCorrect] = useState<ReadonlySet<string>>(() => new Set());
  const [quizWrong, setQuizWrong] = useState<ReadonlySet<string>>(() => new Set());

  const [machine, setMachine] = useState<MachineState>(() => machineForLevel(level));
  const [timeSpeed, setTimeSpeed] = useState(level.setup.timeSpeed);
  const [beam, setBeam] = useState<BeamParameters>(level.setup.beam);
  const [channel, setChannel] = useState<Channel>(level.setup.channel);
  const [cutsByChannel, setCutsByChannel] = useState<CutsByChannel>(() => ({
    ...DEFAULT_CUTS,
    [level.setup.channel]: level.setup.cuts,
  }));
  const [view, setView] = useState<MassWindow>(level.setup.view);
  const [massWindow, setMassWindow] = useState<MassWindow>(level.setup.window);
  const [logScale, setLogScale] = useState(true);
  const [showKnownMasses, setShowKnownMasses] = useState(false);
  const [runVersion, setRunVersion] = useState(0);
  // `?explain=beam|magnets|mass` opens an explainer on load, handy for linking and screenshots.
  const [explainer, setExplainer] = useState<ExplainerTopic | null>(() => {
    const requested = new URLSearchParams(window.location.search).get('explain');
    return requested === 'beam' || requested === 'magnets' || requested === 'mass' ? requested : null;
  });
  const closeExplainer = useCallback(() => setExplainer(null), []);

  // The simulation loop reads the latest state through refs so that actions and ticks never race.
  const machineRef = useRef(machine);
  const timeSpeedRef = useRef(timeSpeed);
  const beamRef = useRef(beam);
  const cutsRef = useRef(cutsByChannel);
  timeSpeedRef.current = timeSpeed;
  beamRef.current = beam;
  cutsRef.current = cutsByChannel;
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
  const histogram = run.histograms[channel];
  const analysis = useMemo(() => analyseWindow(histogram, massWindow), [histogram, runVersion, massWindow]);
  const cuts = cutsByChannel[channel];

  const resetRun = useCallback(() => {
    run.reset();
    setRunVersion((v) => v + 1);
  }, [run]);

  const applyLevel = useCallback(
    (next: Level) => {
      const m = machineForLevel(next);
      machineRef.current = m;
      setMachine(m);
      setTimeSpeed(next.setup.timeSpeed);
      setBeam(next.setup.beam);
      setChannel(next.setup.channel);
      setCutsByChannel({ ...DEFAULT_CUTS, [next.setup.channel]: next.setup.cuts });
      setView(next.setup.view);
      setMassWindow(next.setup.window);
      setQuizCorrect(new Set());
      setQuizWrong(new Set());
      setLevelStatus('playing');
      setLevel(next);
      resetRun();
      setProgress((p) => {
        const updated = { ...p, currentLevel: next.id };
        saveProgress(updated);
        return updated;
      });
    },
    [resetRun],
  );

  const levelSnapshot: Snapshot = useMemo(
    () => ({
      machine,
      beam,
      luminosityCm2S,
      colliding,
      run: snapshot,
      channel,
      analysis,
      window: massWindow,
      cuts,
      integratedLuminosityFb: snapshot.integratedLuminosityM2 / 1e43,
      quizCorrect,
    }),
    [machine, beam, luminosityCm2S, colliding, snapshot, channel, analysis, massWindow, cuts, quizCorrect],
  );
  const evaluation = useMemo(() => evaluateLevel(level, levelSnapshot), [level, levelSnapshot]);

  useEffect(() => {
    if (levelStatus !== 'playing') return;
    if (evaluation.failed) {
      setLevelStatus('failed');
    } else if (evaluation.completed) {
      setLevelStatus('completed');
      setProgress((p) => {
        if (p.completed.includes(level.id)) return p;
        const updated = { ...p, completed: [...p.completed, level.id] };
        saveProgress(updated);
        return updated;
      });
    }
  }, [evaluation, levelStatus, level.id]);

  const completedSet = useMemo(() => new Set(progress.completed), [progress.completed]);

  const onAnswer = (questionId: string, option: number) => {
    const question = level.quiz.find((q) => q.id === questionId);
    if (!question) return;
    if (option === question.correct) {
      setQuizCorrect((s) => new Set([...s, questionId]));
      setQuizWrong((s) => {
        const next = new Set(s);
        next.delete(questionId);
        return next;
      });
    } else {
      setQuizWrong((s) => new Set([...s, questionId]));
    }
  };

  const onNext = () => {
    const ids = ['first-beam', 'ramp', 'why-collider', 'luminosity', 'first-peak', 'z-boson', 'higgs-gammagamma', 'four-leptons', 'sandbox'];
    const i = ids.indexOf(level.id);
    const nextId = ids[i + 1];
    if (nextId) applyLevel(levelById(nextId));
  };

  const onCuts = (next: SelectionCuts) => {
    setCutsByChannel((c) => ({ ...c, [channel]: next }));
    run.resetChannel(channel);
    setRunVersion((v) => v + 1);
  };

  const onChannel = (next: Channel) => {
    if (next === channel) return;
    setChannel(next);
    const preset = VIEW_PRESETS[next][0]!;
    setView(preset.view);
    setMassWindow(preset.window);
  };

  const { access, visible } = level;

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

      <TutorialPanel
        level={level}
        completed={completedSet}
        status={levelStatus}
        evaluation={evaluation}
        quizCorrect={quizCorrect}
        quizWrong={quizWrong}
        onSelectLevel={(id) => applyLevel(levelById(id))}
        onAnswer={onAnswer}
        onRestart={() => applyLevel(level)}
        onNext={onNext}
      />

      <main className="layout">
        <div className="ring-wrap">
          <RingCanvas machine={machine} energyFraction={energyFraction} />
        </div>
        <ControlPanel
          machine={machine}
          timeSpeed={timeSpeed}
          access={access}
          onInject={() => update((s) => inject(s))}
          onDump={() => update((s) => dump(s))}
          onTargetEnergy={(e) => update((s) => setTargetEnergy(s, e))}
          onFieldMode={(mode: FieldMode) => update((s) => setFieldMode(s, mode))}
          onManualField={(b) => update((s) => setManualField(s, b))}
          onTimeSpeed={setTimeSpeed}
          onExplain={setExplainer}
        />
        {visible.readouts && <Readouts machine={machine} />}
        {visible.beam && (
          <BeamPanel
            beam={beam}
            colliding={colliding}
            luminosityCm2S={luminosityCm2S}
            integratedLuminosityM2={snapshot.integratedLuminosityM2}
            collisionRatePerS={colliding ? collisionRatePerS : null}
            collisions={snapshot.collisions}
            locked={!access.beam}
            onBeam={setBeam}
            onExplain={setExplainer}
          />
        )}
        {visible.histogram && (
          <div className="histogram-panel panel">
            <HistogramCanvas
              histogram={histogram}
              channel={channel}
              version={runVersion}
              view={view}
              window={massWindow}
              logScale={logScale}
              showKnownMasses={showKnownMasses}
            />
          </div>
        )}
        {visible.histogram && (
          <AnalysisPanel
            access={access}
            channel={channel}
            cuts={cuts}
            window={massWindow}
            view={view}
            logScale={logScale}
            showKnownMasses={showKnownMasses}
            entries={snapshot.entriesByChannel[channel]}
            analysis={analysis}
            onChannel={onChannel}
            onCuts={onCuts}
            onWindow={setMassWindow}
            onView={(nextView, nextWindow) => {
              setView(nextView);
              if (nextWindow) setMassWindow(nextWindow);
            }}
            onLogScale={setLogScale}
            onShowKnownMasses={setShowKnownMasses}
            onReset={resetRun}
            onExplain={setExplainer}
          />
        )}
      </main>

      <footer className="app-footer">{t('footer.sources')}</footer>

      {explainer && (
        <ExplainerDialog topic={explainer} onClose={closeExplainer}>
          {explainer === 'beam' && (
            <BeamExplainer beam={beam} energyGeV={machine.status === 'empty' ? config.injectionEnergyGeV : machine.energyGeV} />
          )}
          {explainer === 'magnets' && <MagnetExplainer machine={machine} />}
          {explainer === 'mass' && <MassExplainer channel={channel} />}
        </ExplainerDialog>
      )}
    </div>
  );
}
