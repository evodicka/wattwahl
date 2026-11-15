import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../../tests/fixtures/exampleScenario';
import { formatDate, formatTime } from '../../i18n';
import { activeScenarioSet, priceCaseSet, scenarioUpdated } from '../../state';
import { NOW, incompleteResult, renderApp } from '../__tests__/renderApp';

// S16: the status line names scenario, price case, comparison period and the
// time of the calculation (briefing §2) for the results on screen (8.5).

const OTHER_ID = '20000000-0000-4000-8000-000000000001';
const stamp = `${formatDate(NOW)}, ${formatTime(NOW)} Uhr`;
const line = () => screen.getByTestId('status-line');

async function setup() {
  const scenario = { ...exampleScenario(), name: 'Familie' };
  const other = { ...exampleScenario(), id: OTHER_ID, name: 'Single' };
  const app = await renderApp('/ergebnis', { scenarios: [scenario, other] });
  return { ...app, scenario, other };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('S16: status line', () => {
  it('before the first result it names the active scenario and its period', async () => {
    const { scenario } = await setup();
    expect(line().textContent).toContain(
      `Szenario Familie · Preisfall Mittel · Vergleichsdauer ${scenario.parameters.comparisonMonths} Monate`,
    );
    expect(line().textContent).toContain('wird aktualisiert');
    expect(line().textContent).not.toContain('Stand');
  });

  it('with a result it names scenario, price case, period and time of the calculation', async () => {
    const { worker, scenario } = await setup();
    act(() => worker.finish(incompleteResult(scenario.id, 30)));
    await act(async () => {});
    expect(line().textContent).toBe(
      `Szenario Familie · Preisfall Mittel · Vergleichsdauer 30 Monate · Stand ${stamp}`,
    );
  });

  it('names the chosen price case', async () => {
    const { worker, scenario, store } = await setup();
    act(() => worker.finish(incompleteResult(scenario.id, 48)));
    await act(async () => {});
    act(() => {
      store.dispatch(priceCaseSet('evFavorable'));
    });
    expect(line().textContent).toContain('Preisfall E-Auto günstig');
  });

  it('while a new input is computed it keeps naming what the old numbers belong to', async () => {
    const { worker, scenario, store } = await setup();
    act(() => worker.finish(incompleteResult(scenario.id, 48)));
    await act(async () => {});
    act(() => {
      store.dispatch(
        scenarioUpdated({
          ...scenario,
          parameters: { ...scenario.parameters, comparisonMonths: 12 },
        }),
      );
    });
    expect(line().textContent).toContain('wird aktualisiert');
    expect(line().textContent).toContain(
      `Vergleichsdauer 48 Monate · Letzter Stand ${stamp}`,
    );
  });

  it('after a switch of scenario it names the scenario of the shown result until the new one arrives', async () => {
    const { worker, scenario, store } = await setup();
    act(() => worker.finish(incompleteResult(scenario.id, 48)));
    await act(async () => {});
    act(() => {
      store.dispatch(activeScenarioSet(OTHER_ID));
    });
    expect(line().textContent).toContain('wird aktualisiert');
    expect(line().textContent).toContain('Szenario Familie');
  });

  it('after a failed run it marks the shown numbers as outdated (8.10)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { worker, scenario, store } = await setup();
    act(() => worker.finish(incompleteResult(scenario.id, 48)));
    await act(async () => {});
    act(() => {
      store.dispatch(scenarioUpdated({ ...scenario, name: scenario.name }));
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    act(() => worker.fail());
    await act(async () => {});
    expect(line().textContent).toContain('veraltet');
    expect(line().textContent).toContain(`Letzter Stand ${stamp}`);
    expect(line().textContent).not.toContain('wird aktualisiert');
  });
});
