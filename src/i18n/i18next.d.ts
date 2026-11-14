import 'i18next';
import type de from './de.json';

// Typed keys (architecture 8.7): a key that is not in de.json fails the type
// check. tests/i18n/missingKey.typecheck.ts guards this.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof de;
  }
}
