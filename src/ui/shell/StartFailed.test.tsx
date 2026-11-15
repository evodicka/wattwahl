import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import { StartFailed } from './StartFailed';

// S16: a failed start names its cause; only a storage problem blames storage.

const renderCause = (cause: 'storage' | 'other') =>
  render(
    <I18nextProvider i18n={i18n}>
      <StartFailed cause={cause} />
    </I18nextProvider>,
  );

describe('S16: start error', () => {
  it('unreadable storage says so', () => {
    renderCause('storage');
    expect(screen.getByRole('alert').textContent).toContain(
      'Die gespeicherten Daten lassen sich nicht laden',
    );
  });

  it('any other failure shows the general text and asks for a reload', () => {
    renderCause('other');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Die App konnte nicht starten');
    expect(alert.textContent).toContain('Lade die Seite neu');
    expect(alert.textContent).not.toContain('Speicher');
  });
});
