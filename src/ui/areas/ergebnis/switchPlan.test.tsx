import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  exportWith,
  loadExportScenario,
} from '../../../../tests/helpers/exportScenario';
import { computeResults } from '../../../../tests/fixtures/offerResults';
import type { Scenario } from '../../../domain';
import { selectActiveScenario } from '../../../state';
import { renderApp } from '../../__tests__/renderApp';
import { unsuitableText } from '../../forms/candidateStatus';

// C3b: the mode "mit Wechsel" in the views (spec "Auswertung", "Parameterliste").

let base: Scenario;
beforeAll(() => {
  base = loadExportScenario();
});
const switched = () =>
  exportWith(base, { minReserveKm: 10, sohPlanMode: 'switch' });
const corsaPath = (scenario: Scenario) => {
  const candidate = scenario.candidates.find(
    (c) => c.name === 'Opel Corsa 2023',
  );
  return `/ergebnis/${encodeURIComponent(`${candidate?.id}:purchase`)}`;
};

async function open(path: string, scenario: Scenario) {
  const app = await renderApp(path, { scenarios: [scenario] });
  await act(async () => app.worker.finish(computeResults(scenario)));
  return app;
}

describe('C3b: parameter SoH-Plan', () => {
  it('stores the choice and disables the SoH reference with the reason', async () => {
    const app = await renderApp('/parameter');
    const plan = screen.getByLabelText('SoH-Plan') as HTMLSelectElement;
    const reference = screen.getByLabelText(
      'SoH-Bezug der Eignungsprüfung',
    ) as HTMLSelectElement;
    expect(plan.value).toBe('fixed');
    expect(reference.disabled).toBe(false);
    fireEvent.change(plan, { target: { value: 'switch' } });
    const active = selectActiveScenario(app.store.getState());
    expect(active?.parameters.sohPlanMode).toBe('switch');
    expect(reference.disabled).toBe(true);
    const hint = document.getElementById(
      (reference.getAttribute('aria-describedby') ?? '').split(' ')[0] ?? '',
    );
    expect(hint?.textContent).toMatch(
      /prüft die App die Eignung zum jeweiligen Zeitpunkt/,
    );
    // The stored reference is kept.
    expect(active?.parameters.sohReference).toBe('end');
    fireEvent.change(plan, { target: { value: 'fixed' } });
    expect(reference.disabled).toBe(false);
  });
});

describe('C3b: marks and details', () => {
  it('marks "mit Wechsel" at the offer that follows the plan with switch points and at no other', async () => {
    await open('/ergebnis', switched());
    const table = screen.getByRole('table', {
      name: /aufsteigend nach Kosten/,
    });
    const marked = within(table)
      .getAllByRole('row')
      .filter((row) => within(row).queryByText('mit Wechsel'));
    expect(
      marked.map((row) => within(row).getAllByRole('cell')[0]?.textContent),
    ).toEqual(['Opel Corsa 2023', 'Opel Corsa 2024']);
  });

  it('shows no mark in mode fixed', async () => {
    await open('/ergebnis', exportWith(base, { minReserveKm: 10 }));
    expect(screen.queryByText('mit Wechsel')).toBeNull();
  });

  it('the detail view stands on the start, tells the plan state over time and names the switch month in words', async () => {
    const scenario = switched();
    await open(corsaPath(scenario), scenario);
    await screen.findByRole('region', {
      name: /^Heatmap der Reichweitenreserve/,
    });
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('0');
    expect(screen.getByTestId('plan-state').textContent).toMatch(
      /Zeitpunkt Start: .* 0 Einträge ruhen.* 0 Einträgen/,
    );
    fireEvent.change(slider, { target: { value: slider.max } });
    expect(screen.getByTestId('plan-state').textContent).toMatch(
      /Zeitpunkt Ende: /,
    );
    expect(screen.getByTestId('plan-state').textContent).not.toMatch(
      / 0 Einträge ruhen/,
    );
    expect(
      screen.getByText(/Januar: E-Auto bis Monat 30, danach Verbrenner/),
    ).toBeTruthy();
    expect(
      screen.getByText(/für die Optionsmenge am Start optimal/),
    ).toBeTruthy();
    expect(screen.getByTestId('switch-comparison').textContent).toMatch(
      /\d+\s?€ günstiger als der feste Plan/,
    );
  });

  it('the assignment plan writes the switch as text in the cell', async () => {
    const scenario = switched();
    await open(corsaPath(scenario), scenario);
    const region = await screen.findByRole('region', {
      name: /^Zuordnungsplan, seitlich/,
    });
    const wednesday = within(region).getByRole('row', { name: /Mi/ });
    expect(
      within(wednesday).getAllByText('E→A bis M30, dann E ruht').length,
    ).toBe(1);
    // Every month that tips has its text; the cells of other weekdays say it too.
    expect(
      within(wednesday).getAllByText(/^E→A bis M\d+, dann /).length,
    ).toBeGreaterThan(2);
  });
});

describe('C3b: the reason names the month', () => {
  it('appends the time the last way tips, or says it is not suitable from the start', () => {
    const both = {
      kind: 'both' as const,
      weekday: 'fri' as const,
      month: 0,
      reserveKm: { a: 12, b: 57 },
      minReserveKm: 58,
      soh: 0.93,
    };
    expect(unsuitableText({ ...both, afterMonths: 54 }, 'table')).toMatch(
      /Der letzte Weg kippt nach 54 Monaten\.$/,
    );
    expect(unsuitableText({ ...both, afterMonths: 0 }, 'table')).toMatch(
      /Schon am Start nicht geeignet\.$/,
    );
    expect(unsuitableText(both, 'table')).not.toMatch(/kippt/);
    expect(
      unsuitableText(
        {
          kind: 'strict',
          way: 'a',
          month: 0,
          reserveKm: 12,
          minReserveKm: 14,
          soh: 0.93,
          afterMonths: 13,
        },
        'card',
      ),
    ).toMatch(/Weg A kippt nach 13 Monaten\.$/);
  });
});
