import { describe, expect, it } from 'vitest';
import de from './de.json';
import { NAMESPACES, i18n } from './index';

describe('language file (architecture 8.7)', () => {
  it('has one namespace per area plus common', () => {
    expect(Object.keys(de).sort()).toEqual([...NAMESPACES].sort());
  });

  it('resolves keys in German without loading anything', () => {
    expect(i18n.language).toBe('de');
    expect(i18n.t('appName')).toBe('Wattwahl');
    expect(i18n.t('nav.szenarien')).toBe('Szenarien und Daten');
    expect(i18n.t('title', { ns: 'ergebnis' })).toBe('Ergebnis');
  });
});
