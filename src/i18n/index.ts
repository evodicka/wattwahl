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
  formatDecimal,
  formatEuro,
  formatKm,
  formatPercent,
} from './format';
