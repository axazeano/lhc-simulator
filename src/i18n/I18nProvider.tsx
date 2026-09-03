import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, createTranslator, isLocale, pickLocale, type Locale, type Translator } from './index';

const STORAGE_KEY = 'lhc-simulator.locale';

interface I18nContextValue extends Translator {
  setLocale(locale: Locale): void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // storage may be unavailable
  }
  if (typeof navigator !== 'undefined') return pickLocale(navigator.languages ?? [navigator.language]);
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const translator = createTranslator(locale, (key) => {
      if (import.meta.env.DEV) console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
    });
    return { ...translator, setLocale };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
