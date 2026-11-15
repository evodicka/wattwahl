/** German texts (de.json) and Intl-based formatting (architecture 8.7). */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';

/** One namespace per area plus shared texts. */
export const NAMESPACES = [
  'common',
  'fahrprofil',
  'kandidaten',
  'parameter',
  'ergebnis',
  'szenarien',
] as const satisfies readonly (keyof typeof de)[];
// `satisfies` only checks that each entry exists; i18n.test.ts checks that the
// list covers every namespace of de.json.

/**
 * Month keys in calendar order. The core numbers months 0 to 11, so
 * `t(\`months.${MONTH_KEYS[month]}\`)` stays a typed key.
 */
export const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const satisfies readonly (keyof (typeof de)['common']['months'])[];

/**
 * The app's i18next instance. The resource is bundled statically, so the
 * instance is ready synchronously and needs no network (architecture 8.11).
 */
export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  lng: 'de',
  fallbackLng: false,
  resources: { de },
  ns: NAMESPACES,
  defaultNS: 'common',
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export {
  formatConsumption,
  formatDate,
  formatDecimal,
  formatEuro,
  formatInput,
  formatKm,
  formatPercent,
  formatTime,
} from './format';
