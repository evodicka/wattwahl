import { describe, expect, it } from 'vitest';
import de from './de.json';
import { MONTH_KEYS, NAMESPACES, i18n } from './index';

describe('language file (architecture 8.7)', () => {
  it('has one namespace per area plus common', () => {
    expect(Object.keys(de).sort()).toEqual([...NAMESPACES].sort());
  });

  it('is initialized synchronously in German without loading anything', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toBe('de');
    expect(i18n.t('appName')).toBe('Wattwahl');
    expect(i18n.t('nav.szenarien')).toBe('Szenarien und Daten');
    expect(i18n.t('title', { ns: 'ergebnis' })).toBe('Ergebnis');
  });

  it('MONTH_KEYS lists every month in calendar order', () => {
    expect([...MONTH_KEYS]).toEqual(Object.keys(de.common.months));
    expect([...MONTH_KEYS]).toEqual(Object.keys(de.common.monthsShort));
    expect(i18n.t(`months.${MONTH_KEYS[0]}`)).toBe('Januar');
    expect(i18n.t(`monthsShort.${MONTH_KEYS[2]}`)).toBe('Mär');
  });

  it('uses plural forms where a count is shown', () => {
    expect(i18n.t('status.periodShort', { count: 1 })).toBe('1 Monat');
    expect(i18n.t('status.periodShort', { count: 48 })).toBe('48 Monate');
    expect(i18n.t('card.missingTitle', { ns: 'kandidaten', count: 1 })).toBe(
      'Es fehlt 1 Angabe',
    );
    expect(i18n.t('card.missingTitle', { ns: 'kandidaten', count: 3 })).toBe(
      'Es fehlen 3 Angaben',
    );
  });
});
