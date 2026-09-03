import { describe, expect, it } from 'vitest';
import {
  LOCALES,
  LOCALE_IDS,
  PLURAL_CATEGORIES,
  createTranslator,
  pickLocale,
  placeholdersOf,
  type Locale,
  type PluralCategory,
} from './index';

const PLURAL_SUFFIX = new RegExp(`\\.(${PLURAL_CATEGORIES.join('|')})$`);

/** Base key with any plural suffix removed. */
function baseKey(key: string): string {
  return key.replace(PLURAL_SUFFIX, '');
}

function baseKeys(locale: Locale): Set<string> {
  return new Set(Object.keys(LOCALES[locale].messages).map(baseKey));
}

describe('translation catalogues', () => {
  it('every locale defines the same set of keys', () => {
    const [reference, ...others] = LOCALE_IDS;
    const referenceKeys = baseKeys(reference!);
    for (const locale of others) {
      const keys = baseKeys(locale);
      const missing = [...referenceKeys].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !referenceKeys.has(k));
      expect({ locale, missing, extra }).toEqual({ locale, missing: [], extra: [] });
    }
  });

  it('every plural key has all categories its language needs', () => {
    for (const locale of LOCALE_IDS) {
      const required = new Intl.PluralRules(locale).resolvedOptions().pluralCategories as PluralCategory[];
      const messages = LOCALES[locale].messages;
      const pluralBases = new Set(
        Object.keys(messages)
          .filter((k) => PLURAL_SUFFIX.test(k))
          .map(baseKey),
      );
      for (const base of pluralBases) {
        for (const category of required) {
          expect(messages[`${base}.${category}`], `${locale}: ${base}.${category}`).toBeDefined();
        }
      }
    }
  });

  it('placeholders match across locales', () => {
    const [reference, ...others] = LOCALE_IDS;
    const referenceMessages = LOCALES[reference!].messages;
    for (const locale of others) {
      const messages = LOCALES[locale].messages;
      for (const [key, message] of Object.entries(referenceMessages)) {
        const counterpart = messages[key];
        if (counterpart === undefined) continue; // plural categories may differ
        expect(placeholdersOf(counterpart), `${locale}: ${key}`).toEqual(placeholdersOf(message));
      }
    }
  });

  it('no message is empty', () => {
    for (const locale of LOCALE_IDS) {
      for (const [key, message] of Object.entries(LOCALES[locale].messages)) {
        expect(message.trim(), `${locale}: ${key}`).not.toBe('');
      }
    }
  });
});

describe('translator', () => {
  it('substitutes placeholders and formats numbers per locale', () => {
    const ru = createTranslator('ru');
    const en = createTranslator('en');
    expect(ru.t('duration.minutes', { value: 1234.5 })).toBe('1 234,5 мин'.replace(' ', ' '));
    expect(en.t('duration.minutes', { value: 1234.5 })).toBe('1,234.5 min');
  });

  it('picks Russian plural forms', () => {
    const ru = createTranslator('ru');
    expect(ru.plural('bunches', 1)).toBe('1 сгусток');
    expect(ru.plural('bunches', 3)).toBe('3 сгустка');
    expect(ru.plural('bunches', 12)).toBe('12 сгустков');
    expect(ru.plural('bunches', 21)).toBe('21 сгусток');
  });

  it('picks English plural forms', () => {
    const en = createTranslator('en');
    expect(en.plural('bunches', 1)).toBe('1 bunch');
    expect(en.plural('bunches', 2808)).toBe('2,808 bunches');
  });

  it('reports missing keys and falls back to the key itself', () => {
    const missing: string[] = [];
    const t = createTranslator('en', (key) => missing.push(key));
    expect(t.t('nope.nothing')).toBe('nope.nothing');
    expect(missing).toEqual(['nope.nothing']);
  });

  it('formats scientific notation with superscripts', () => {
    const en = createTranslator('en');
    expect(en.scientific(1.0e34)).toBe('1.0 × 10³⁴');
    expect(en.scientific(3.75e-6, 2)).toBe('3.75 × 10⁻⁶');
  });

  it('chooses a supported locale from browser preferences', () => {
    expect(pickLocale(['de-DE', 'en-US'])).toBe('en');
    expect(pickLocale(['ru-RU'])).toBe('ru');
    expect(pickLocale(['fr'])).toBe('ru');
  });
});
