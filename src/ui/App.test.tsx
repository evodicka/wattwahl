import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { App } from './App';

describe('App', () => {
  it('takes its heading from the language file (architecture 8.7)', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Wattwahl' })).toBeTruthy();
  });
});
