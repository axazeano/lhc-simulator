const STORAGE_KEY = 'lhc-simulator.progress';

export interface Progress {
  /** Completed tutorial levels. */
  completed: string[];
  currentLevel: string;
  /** Completed research-programme missions; kept even if the catalog entry that earned one is deleted. */
  missions: string[];
  /** Discovery claims refuted on later data. */
  falseClaims: number;
}

export const EMPTY_PROGRESS: Progress = { completed: [], currentLevel: 'first-beam', missions: [], falseClaims: 0 };

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      return {
        completed: strings(parsed.completed),
        currentLevel: typeof parsed.currentLevel === 'string' ? parsed.currentLevel : 'first-beam',
        missions: strings(parsed.missions),
        falseClaims: typeof parsed.falseClaims === 'number' && parsed.falseClaims >= 0 ? Math.floor(parsed.falseClaims) : 0,
      };
    }
  } catch {
    // storage unavailable or corrupt
  }
  return { ...EMPTY_PROGRESS };
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}
