import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n/I18nProvider';
import { LOCALES, LOCALE_IDS } from './i18n';
import {
  LHC_MACHINE_CONFIG,
  advance,
  createMachine,
  dump,
  inject,
  setFieldMode,
  setManualField,
  setTargetEnergy,
  type FieldMode,
  type MachineState,
} from './physics/accelerator';
import { ControlPanel } from './ui/ControlPanel';
import { Readouts } from './ui/Readouts';
import { RingCanvas } from './ui/RingCanvas';

export function App() {
  const { t, locale, setLocale } = useI18n();
  const [machine, setMachine] = useState<MachineState>(() => createMachine());
  const [timeSpeed, setTimeSpeed] = useState(1);

  // The simulation loop reads the latest state through refs so that actions and ticks never race.
  const machineRef = useRef(machine);
  const timeSpeedRef = useRef(timeSpeed);
  timeSpeedRef.current = timeSpeed;

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
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      update((state) => advance(state, dt * timeSpeedRef.current));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [update]);

  const config = LHC_MACHINE_CONFIG;
  const energyFraction =
    machine.status === 'empty'
      ? 0
      : (machine.energyGeV - config.injectionEnergyGeV) / (config.maxEnergyGeV - config.injectionEnergyGeV);

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
      </main>

      <footer className="app-footer">{t('footer.sources')}</footer>
    </div>
  );
}
