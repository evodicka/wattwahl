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

  it('splits texts with several numbers into separately pluralized parts', () => {
    const summary = [
      i18n.t('summary.candidates', { ns: 'kandidaten', count: 1 }),
      i18n.t('summary.leases', { ns: 'kandidaten', count: 3 }),
      i18n.t('summary.live', { ns: 'kandidaten' }),
    ].join(i18n.t('separator'));
    expect(summary).toBe(
      '1 Kandidat · 3 Leasingangebote · Ergebnisse rechnen live neu',
    );
    expect(i18n.t('list.metaCandidates', { ns: 'szenarien', count: 4 })).toBe(
      '4 Kandidaten',
    );
    expect(i18n.t('export.lastAgo', { ns: 'szenarien', count: 1 })).toBe(
      'vor 1 Tag',
    );
    expect(i18n.t('import.replaceBody', { ns: 'szenarien', count: 1 })).toBe(
      'Das vorhandene Szenario wird gelöscht. Exportiere es vorher.',
    );
  });
});
