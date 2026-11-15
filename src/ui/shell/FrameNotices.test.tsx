import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../../tests/fixtures/exampleScenario';
import { scenarioUpdated } from '../../state';
import { renderApp } from '../__tests__/renderApp';

// S16: notices of the frame (Z07 and the storage hints of 8.2 and 8.10).

afterEach(() => {
  vi.useRealTimers();
});

async function afterSave(status: 'quotaExceeded' | 'closed') {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const scenario = exampleScenario();
  const app = await renderApp('/fahrprofil', { scenarios: [scenario] });
  vi.mocked(app.repository.save).mockResolvedValue({ status });
  await act(async () => {
    app.store.dispatch(scenarioUpdated({ ...scenario, name: 'X' }));
    await vi.advanceTimersByTimeAsync(300);
  });
  return app;
}

describe('S16: frame notices', () => {
  it('Z07: a full storage asks for an export and leads to Szenarien und Daten', async () => {
    const { router } = await afterSave('quotaExceeded');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Speicher voll');
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Jetzt exportieren' }),
      );
    });
    expect(router.state.location.pathname).toBe('/szenarien');
    // The notice stays: changes are still not saved.
    expect(screen.getByRole('alert').textContent).toContain('Speicher voll');
  });

  it('a newer tab asks for a reload', async () => {
    await afterSave('closed');
    expect(screen.getByRole('status').textContent).toContain(
      'Neuere Version in einem anderen Tab',
    );
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeTruthy();
  });

  it('a database of a newer app is shown as read only', async () => {
    await renderApp('/fahrprofil', {
      scenarios: [exampleScenario()],
      mode: 'readOnly',
    });
    expect(screen.getByRole('status').textContent).toContain('Nur lesbar');
  });

  it('refused persistent storage on the first start is a hint that can be closed', async () => {
    await renderApp('/fahrprofil', {
      settings: { firstRunCompleted: false },
      persistence: 'denied',
    });
    expect(screen.getByRole('status').textContent).toContain(
      'Speicher nicht dauerhaft',
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    });
    expect(screen.queryByText('Speicher nicht dauerhaft')).toBeNull();
  });

  it('without a problem the frame shows no notice', async () => {
    await renderApp('/fahrprofil', { scenarios: [exampleScenario()] });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
