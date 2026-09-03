const STORAGE_KEY = 'lhc-simulator.progress';

export interface Progress {
  completed: string[];
  currentLevel: string;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      return {
        completed: Array.isArray(parsed.completed) ? parsed.completed.filter((x) => typeof x === 'string') : [],
        currentLevel: typeof parsed.currentLevel === 'string' ? parsed.currentLevel : 'first-beam',
      };
    }
  } catch {
    // storage unavailable or corrupt
  }
  return { completed: [], currentLevel: 'first-beam' };
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}
