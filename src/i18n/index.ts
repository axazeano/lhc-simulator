import en from './locales/en.json';
import ru from './locales/ru.json';

/**
 * Minimal localisation layer without dependencies.
 * - Flat message catalogues keyed by dotted strings.
 * - `{name}` placeholders; numeric values are formatted with Intl.NumberFormat.
 * - Plural forms live in sibling keys `key.one`, `key.few`, `key.many`, `key.other`
 *   selected with Intl.PluralRules, so each language brings only the categories it needs.
 * Adding a language means adding one JSON file and one entry in LOCALES.
 */

export type Messages = Record<string, string>;

export const LOCALES = {
  ru: { name: 'Русский', messages: ru as Messages },
  en: { name: 'English', messages: en as Messages },
} as const;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_IDS = Object.keys(LOCALES) as Locale[];

export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

export type MessageParams = Record<string, string | number>;

export interface Translator {
  locale: Locale;
  /** Translate a key with optional `{placeholder}` substitution. */
  t(key: string, params?: MessageParams): string;
  /** Pick the plural form of `key` for `count` and substitute `{count}`. */
  plural(key: string, count: number, params?: MessageParams): string;
  /** Format a number for the locale. */
  number(value: number, options?: Intl.NumberFormatOptions): string;
  /** Format a number in scientific notation, e.g. 1.0 × 10³⁴. */
  scientific(value: number, fractionDigits?: number): string;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in LOCALES;
}

export function pickLocale(candidates: readonly string[]): Locale {
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function placeholdersOf(message: string): string[] {
  return Array.from(message.matchAll(PLACEHOLDER), (m) => m[1] ?? '').sort();
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

function toSuperscript(text: string): string {
  return text.split('').map((ch) => SUPERSCRIPT[ch] ?? ch).join('');
}

export function createTranslator(locale: Locale, onMissing?: (key: string) => void): Translator {
  const messages = LOCALES[locale].messages;
  const numberFormat = new Map<string, Intl.NumberFormat>();
  const pluralRules = new Intl.PluralRules(locale);

  const number = (value: number, options: Intl.NumberFormatOptions = {}) => {
    const cacheKey = JSON.stringify(options);
    let format = numberFormat.get(cacheKey);
    if (!format) {
      format = new Intl.NumberFormat(locale, options);
      numberFormat.set(cacheKey, format);
    }
    return format.format(value);
  };

  const substitute = (message: string, params?: MessageParams) =>
    params
      ? message.replace(PLACEHOLDER, (whole, name: string) => {
          const value = params[name];
          if (value === undefined) return whole;
          return typeof value === 'number' ? number(value) : value;
        })
      : message;

  const lookup = (key: string): string | undefined => {
    const message = messages[key];
    if (message === undefined) onMissing?.(key);
    return message;
  };

  return {
    locale,
    number,
    t: (key, params) => substitute(lookup(key) ?? key, params),
    plural: (key, count, params) => {
      const category = pluralRules.select(count);
      const message = lookup(`${key}.${category}`) ?? lookup(`${key}.other`) ?? key;
      return substitute(message, { ...params, count });
    },
    scientific: (value, fractionDigits = 1) => {
      if (value === 0) return number(0);
      const exponent = Math.floor(Math.log10(Math.abs(value)));
      const mantissa = value / 10 ** exponent;
      return `${number(mantissa, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })} × 10${toSuperscript(String(exponent))}`;
    },
  };
}
