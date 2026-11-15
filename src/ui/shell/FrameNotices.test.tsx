import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../../tests/fixtures/exampleScenario';
import { scenarioUpdated } from '../../state';
import {
  registration,
  resetRegisterStub,
  setNeedRefresh,
} from '../__tests__/registerStub';
import { renderApp } from '../__tests__/renderApp';

// S16: notices of the frame (Z07 and the storage hints of 8.2 and 8.10).

beforeEach(resetRegisterStub);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    expect(screen.getByText('Speicher nicht dauerhaft')).toBeTruthy();
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

describe('S23: update notice (Z08, 6.4)', () => {
  it('appears when a new version is ready and can be put off', async () => {
    await renderApp('/fahrprofil', { scenarios: [exampleScenario()] });
    expect(screen.queryByText('Neue Version verfügbar')).toBeNull();
    act(() => setNeedRefresh(true));
    expect(screen.getByText('Neue Version verfügbar')).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Später' }));
    });
    expect(screen.queryByText('Neue Version verfügbar')).toBeNull();
    expect(registration.updateServiceWorkerCalls).toEqual([]);
  });

  it('saves first, and only then lets the new version take over and reload', async () => {
    const scenario = exampleScenario();
    const app = await renderApp('/fahrprofil', { scenarios: [scenario] });
    const order: string[] = [];
    vi.mocked(app.repository.save).mockImplementation(async () => {
      order.push('save');
      return { status: 'ok' };
    });
    registration.updateServiceWorker = async (reload) => {
      order.push(`update:${String(reload)}`);
    };
    act(() => {
      app.store.dispatch(scenarioUpdated({ ...scenario, name: 'Neu' }));
      setNeedRefresh(true);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));
    });
    expect(order).toEqual(['save', 'update:true']);
  });

  it('does not reload when the edits could not be saved', async () => {
    const scenario = exampleScenario();
    const app = await renderApp('/fahrprofil', { scenarios: [scenario] });
    vi.mocked(app.repository.save).mockResolvedValue({
      status: 'quotaExceeded',
    });
    act(() => {
      app.store.dispatch(scenarioUpdated({ ...scenario, name: 'Neu' }));
      setNeedRefresh(true);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));
    });
    expect(registration.updateServiceWorkerCalls).toEqual([]);
    expect(screen.getByText(/deshalb wird nicht neu geladen/)).toBeTruthy();
  });

  it('reloads without edits to lose, also in a database of a newer app', async () => {
    const scenario = exampleScenario();
    await renderApp('/fahrprofil', { scenarios: [scenario], mode: 'readOnly' });
    act(() => setNeedRefresh(true));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));
    });
    expect(registration.updateServiceWorkerCalls).toEqual([true]);
  });
});

describe('S23: first start (Z18, Z09)', () => {
  const stubNavigator = (values: Record<string, unknown>) =>
    vi.stubGlobal('navigator', { ...window.navigator, ...values });

  it('welcomes once, says that the numbers with "Annahme" are placeholders, and can be closed', async () => {
    await renderApp('/fahrprofil', { settings: { firstRunCompleted: false } });
    expect(screen.getByText('Willkommen bei Wattwahl')).toBeTruthy();
    expect(screen.getByText(/Platzhalter/)).toBeTruthy();
    expect(screen.queryByText(/Zum Home-Bildschirm/)).toBeNull();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Verstanden' }));
    });
    expect(screen.queryByText('Willkommen bei Wattwahl')).toBeNull();
  });

  it('on an iPhone in the browser it adds the hint to install the app (Z09)', async () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      standalone: false,
    });
    await renderApp('/fahrprofil', { settings: { firstRunCompleted: false } });
    expect(screen.getByText(/Zum Home-Bildschirm/)).toBeTruthy();
  });

  it('is not shown again on the next start', async () => {
    await renderApp('/fahrprofil', { scenarios: [exampleScenario()] });
    expect(screen.queryByText('Willkommen bei Wattwahl')).toBeNull();
  });
});
