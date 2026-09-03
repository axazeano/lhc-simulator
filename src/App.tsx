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
import { generateHiddenParticles, hiddenProcess, loadUniverseSeed } from './physics/collision/hidden';
import { PARTICLE_LABELS, loadCatalog, saveCatalog, type CatalogEntry } from './ui/analysis/catalog';
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
import { AnalysisScreen } from './ui/analysis/AnalysisScreen';
import { ExplainerDialog, isExplainerTopic, type ExplainerTopic } from './ui/explainers/Explainer';
import { GlossaryExplainer } from './ui/explainers/GlossaryExplainer';
import { isMuted, play, setMuted } from './ui/sound';
import { BeamExplainer } from './ui/explainers/BeamExplainer';
import { MagnetExplainer } from './ui/explainers/MagnetExplainer';
import { MassExplainer } from './ui/explainers/MassExplainer';
import { DetectorExplainer } from './ui/explainers/DetectorExplainer';

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
  const [screen, setScreen] = useState<'console' | 'analysis'>(() =>
    new URLSearchParams(window.location.search).get('screen') === 'analysis' ? 'analysis' : 'console',
  );
  // `?explain=beam|magnets|mass` opens an explainer on load, handy for linking and screenshots.
  const [explainer, setExplainer] = useState<ExplainerTopic | null>(() => {
    const requested = new URLSearchParams(window.location.search).get('explain');
    return isExplainerTopic(requested) ? requested : null;
  });
  const [muted, setMutedState] = useState(() => isMuted());
  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) play('click');
  };
  const closeExplainer = useCallback(() => setExplainer(null), []);

  // The simulation loop reads the latest state through refs so that actions and ticks never race.
  const machineRef = useRef(machine);
  const timeSpeedRef = useRef(timeSpeed);
  const beamRef = useRef(beam);
  const cutsRef = useRef(cutsByChannel);
  timeSpeedRef.current = timeSpeed;
  beamRef.current = beam;
  cutsRef.current = cutsByChannel;
  const hiddenRef = useRef<ReturnType<typeof generateHiddenParticles> | null>(null);
  hiddenRef.current ??= generateHiddenParticles(loadUniverseSeed());
  const hidden = hiddenRef.current;
  const runRef = useRef<CollisionRun | null>(null);
  runRef.current ??= new CollisionRun(Date.now() >>> 0, undefined, hidden.map(hiddenProcess));
  const run = runRef.current;
  const [catalog, setCatalog] = useState<CatalogEntry[]>(() => loadCatalog());
  const onCatalog = useCallback((entries: CatalogEntry[]) => {
    setCatalog(entries);
    saveCatalog(entries);
  }, []);
  // Mass markers on the console histogram: only what this player has recorded or discovered.
  const discoveredMarkers = useMemo(
    () =>
      catalog
        .filter((e) => e.matchedId || e.claim?.status === 'confirmed')
        .map((e) => ({ label: e.matchedId ? PARTICLE_LABELS[e.matchedId] ?? e.matchedId : e.name, mass: e.massGeV, channel: e.channel })),
    [catalog],
  );
  // Expose the run for debugging in development builds only; `?demo` pre-fills it with 200 nb⁻¹ at 13 TeV.
  if (import.meta.env.DEV) {
    (window as unknown as { __lhcRun?: CollisionRun; __lhcHidden?: unknown }).__lhcRun = run;
    (window as unknown as { __lhcHidden?: unknown }).__lhcHidden = hidden;
    if (run.stores.mumu.size === 0 && new URLSearchParams(window.location.search).has('demo')) {
      run.fill = 1;
      run.collect(2e39, 13000);
    }
  }
  if (run.fill === 1 && machine.status === 'empty' && run.stores.mumu.size === 0) run.fill = 0;

  const update = useCallback((fn: (state: MachineState) => MachineState) => {
    const previous = machineRef.current;
    const next = fn(previous);
    if (next !== previous) {
      machineRef.current = next;
      setMachine(next);
      if (next.status === 'lost' && previous.status !== 'lost') play('lost');
      else if (previous.status === 'empty' && next.status !== 'empty' && next.status !== 'lost') play('inject');
      // A new fill starts with every injection; recorded events are tagged with it.
      if (previous.status === 'empty' && next.status !== 'empty') runRef.current!.fill += 1;
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
          run.collect(pendingLuminosityM2, centerOfMassEnergyCollider(state.energyGeV));
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
  const cuts = cutsByChannel[channel];
  // Offline analysis: the histogram is rebuilt from the recorded events for the current threshold.
  const histogram = useMemo(() => run.histogramFor(channel, cuts), [run, runVersion, channel, cuts]);
  const snapshot = useMemo(() => run.snapshot(cutsByChannel), [run, runVersion, cutsByChannel]);
  const analysis = useMemo(() => analyseWindow(histogram, massWindow), [histogram, massWindow]);

  const fiveSigmaRef = useRef(false);
  useEffect(() => {
    const reached = analysis.significance >= 5 && analysis.signal >= 20;
    if (reached && !fiveSigmaRef.current) play('fiveSigma');
    fiveSigmaRef.current = reached;
  }, [analysis.significance, analysis.signal]);

  const resetProgress = useCallback(() => {
    if (!window.confirm(t('tutorial.resetConfirm'))) return;
    const fresh = { completed: [], currentLevel: 'first-beam' };
    saveProgress(fresh);
    setProgress(fresh);
    applyLevelRef.current?.(levelById('first-beam'));
  }, [t]);
  const applyLevelRef = useRef<((next: Level) => void) | null>(null);

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
  applyLevelRef.current = applyLevel;

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
      if (machine.status !== 'lost') play('lost');
    } else if (evaluation.completed) {
      setLevelStatus('completed');
      play('complete');
      setProgress((p) => {
        if (p.completed.includes(level.id)) return p;
        const updated = { ...p, completed: [...p.completed, level.id] };
        saveProgress(updated);
        return updated;
      });
    }
  }, [evaluation, levelStatus, level.id, machine.status]);

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
        <div className="header-tools">
          <div className="segmented screen-switch" role="radiogroup">
            <button type="button" role="radio" aria-checked={screen === 'console'} className={screen === 'console' ? 'active' : ''} onClick={() => setScreen('console')}>
              {t('nav.console')}
            </button>
            <button type="button" role="radio" aria-checked={screen === 'analysis'} className={screen === 'analysis' ? 'active' : ''} onClick={() => setScreen('analysis')}>
              {t('nav.analysis')}
            </button>
          </div>
          <button type="button" className="explain-button" onClick={() => setExplainer('glossary')}>
            {t('explainer.glossary.title')}
          </button>
          <button type="button" className="explain-button" onClick={toggleMuted} aria-pressed={!muted}>
            {muted ? t('sound.off') : t('sound.on')}
          </button>
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
        </div>
      </header>

      {screen === 'analysis' && (
        <AnalysisScreen
          run={run}
          runVersion={runVersion}
          channel={channel}
          onChannel={onChannel}
          onExplain={setExplainer}
          sqrtSGeV={machine.status === 'empty' ? 13000 : centerOfMassEnergyCollider(machine.energyGeV)}
          hidden={hidden}
          catalog={catalog}
          onCatalog={onCatalog}
        />
      )}

      {screen === 'console' && (
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
        onResetProgress={resetProgress}
      />
      )}

      {screen === 'console' && (
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
              markers={discoveredMarkers.filter((m) => m.channel === channel)}
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
            recorded={snapshot.recordedByChannel[channel]}
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
      )}

      <footer className="app-footer">{t('footer.sources')}</footer>

      {explainer && (
        <ExplainerDialog topic={explainer} onClose={closeExplainer}>
          {explainer === 'beam' && (
            <BeamExplainer beam={beam} energyGeV={machine.status === 'empty' ? config.injectionEnergyGeV : machine.energyGeV} />
          )}
          {explainer === 'magnets' && <MagnetExplainer machine={machine} />}
          {explainer === 'mass' && <MassExplainer channel={channel} />}
          {explainer === 'detector' && <DetectorExplainer store={run.stores[channel]} version={runVersion} />}
          {explainer === 'glossary' && <GlossaryExplainer />}
        </ExplainerDialog>
      )}
    </div>
  );
}
