import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exampleScenario } from '../../../tests/fixtures/exampleScenario';
import { scenarioUpdated } from '../../state';
import { incompleteResult, renderApp } from '../__tests__/renderApp';

// S24: the hidden hooks the end-to-end tests read for Q1 (time), Q2 (is a run
// going) and Q5 (hash). They are in the shell, so every area has them.

const probe = () => screen.getByTestId('result-probe');

describe('S24: result probe', () => {
  it('is in every area, hidden, and reports a run in progress without a hash', async () => {
    await renderApp('/parameter', { scenarios: [exampleScenario()] });
    expect(probe().hidden).toBe(true);
    expect(probe().getAttribute('data-updating')).toBe('true');
    expect(probe().hasAttribute('data-result-hash')).toBe(false);
  });

  it('carries scenario, hash and time of a result that belongs to the current input', async () => {
    const scenario = exampleScenario();
    const { worker } = await renderApp('/parameter', {
      scenarios: [scenario],
    });
    act(() => worker.finish(incompleteResult(scenario.id, 48)));
    await act(async () => {});
    expect(probe().getAttribute('data-updating')).toBe('false');
    expect(probe().getAttribute('data-scenario-id')).toBe(scenario.id);
    expect(probe().getAttribute('data-result-hash')).toBe('fake-hash');
    expect(
      Number(probe().getAttribute('data-compute-ms')),
    ).toBeGreaterThanOrEqual(0);
  });

  it('drops hash and time again while a new input is computed', async () => {
    const scenario = exampleScenario();
    const { worker, store } = await renderApp('/parameter', {
      scenarios: [scenario],
    });
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
    expect(probe().getAttribute('data-updating')).toBe('true');
    expect(probe().hasAttribute('data-result-hash')).toBe(false);
    expect(probe().hasAttribute('data-compute-ms')).toBe(false);
  });
});
