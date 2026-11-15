import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exampleScenario } from '../../../../tests/fixtures/exampleScenario';
import {
  computeResults,
  explainOffer,
} from '../../../../tests/fixtures/offerResults';
import type { Scenario, SliderPrices } from '../../../domain';
import { formatEuro } from '../../../i18n';

// The text of a node has its no-break spaces turned into spaces by Testing Library.
const plain = (text: string) => text.replace(/\u00a0/g, ' ');
import { selectActiveScenario, selectScenarios } from '../../../state';
import { renderApp } from '../../__tests__/renderApp';

// S21: Rechenweg (boards D6, M9) and price slider (boards D5, M8, T2, T4).

const offerIdOf = (scenario: Scenario) =>
  `${scenario.candidates[0]?.id}:purchase`;
const pathOf = (scenario: Scenario) =>
  `/ergebnis/${encodeURIComponent(offerIdOf(scenario))}`;

async function open(
  path: string,
  scenario: Scenario = exampleScenario(),
  slider?: SliderPrices,
) {
  const app = await renderApp(path, { scenarios: [scenario] });
  await act(async () =>
    app.worker.finish(
      computeResults(scenario, slider ? { sliderPrices: slider } : {}),
    ),
  );
  return app;
}

/** jsdom does not toggle a <details> on a click, so the state and the event are set as a browser would. */
function toggle(details: HTMLDetailsElement, isOpen: boolean) {
  act(() => {
    details.open = isOpen;
    details.dispatchEvent(new Event('toggle'));
  });
}

const traceDetails = async () => {
  const summary = await screen.findByText('Rechenweg anzeigen');
  return summary.closest('details') as HTMLDetailsElement;
};

describe('S21: Rechenweg', () => {
  it('is not computed until it is opened, then for this offer and price case only', async () => {
    const scenario = exampleScenario();
    const app = await open(pathOf(scenario), scenario);
    const details = await traceDetails();
    expect(app.worker.explains).toHaveLength(0);
    toggle(details, true);
    expect(app.worker.explains).toHaveLength(1);
    expect(app.worker.explains[0]?.request).toMatchObject({
      offerId: offerIdOf(scenario),
      priceCase: 'mid',
    });
    expect(screen.getByText('Der Rechenweg wird berechnet …')).toBeTruthy();
    expect(app.store.getState().result.trace?.result).toBeNull();
  });

  it('shows the steps behind the numbers of the result, with their values, formulas and inputs (Q6)', async () => {
    const scenario = exampleScenario();
    const app = await open(pathOf(scenario), scenario);
    toggle(await traceDetails(), true);
    const answer = explainOffer(scenario, offerIdOf(scenario), 'mid');
    await act(async () => app.worker.finishExplain(answer));

    const numbers = screen
      .getByText('Zahlen dieses Angebots')
      .closest('section') as HTMLElement;
    const rows = Array.from(numbers.querySelectorAll('li[data-result-path]'));
    const byPath = (path: string) =>
      rows.find(
        (li) => li.getAttribute('data-result-path') === path,
      ) as HTMLElement;
    if (answer.result.status !== 'ok') throw new Error('not ok');
    const costs = answer.result.costs;
    expect(
      within(byPath('costs.acquisition')).getByText(
        plain(formatEuro(costs.acquisition)),
      ),
    ).toBeTruthy();
    expect(
      within(byPath('costs.electricity')).getByText(
        plain(formatEuro(costs.electricity)),
      ),
    ).toBeTruthy();
    expect(
      within(byPath('costs.maintenance')).getByText(
        plain(formatEuro(costs.maintenance)),
      ),
    ).toBeTruthy();
    // Each row names the formula and shows it and its inputs.
    const purchase = byPath('costs.acquisition');
    expect(
      within(purchase).getByText('Anschaffung (Wertverlust)'),
    ).toBeTruthy();
    expect(within(purchase).getByText('Formel F8.purchase')).toBeTruthy();
    expect(within(purchase).getByText('P − P · (1 − w)^(D / 12)')).toBeTruthy();
    expect(
      within(purchase).getByText(
        /Eingaben: purchasePrice = 40\.000, depreciationPctPerYear = 15, comparisonMonths = 48/,
      ),
    ).toBeTruthy();
    // The smallest reserve cell is there (km and percent), the other 23 are not.
    expect(
      rows.filter((li) =>
        li.getAttribute('data-result-path')?.startsWith('reserves['),
      ),
    ).toHaveLength(2);
  });

  it('lists every step by formula family, 25 at a time', async () => {
    const scenario = exampleScenario();
    const app = await open(pathOf(scenario), scenario);
    toggle(await traceDetails(), true);
    const answer = explainOffer(scenario, offerIdOf(scenario), 'mid');
    await act(async () => app.worker.finishExplain(answer));
    const title = screen
      .getAllByText('Reichweite bei Monatstemperatur')
      .find((el) => el.closest('summary'));
    const family = title?.closest('details') as HTMLElement;
    const count = answer.trace.filter((e) =>
      e.formula.startsWith('F1.'),
    ).length;
    expect(within(family).getByText(`${count} Schritte`)).toBeTruthy();
    expect(family.querySelectorAll('li')).toHaveLength(25);
    fireEvent.click(
      within(family).getByRole('button', {
        name: `Weitere ${count - 25} Schritte zeigen`,
      }),
    );
    expect(family.querySelectorAll('li').length).toBeGreaterThan(25);
  });

  it('marks a step with a placeholder parameter as "Annahme"', async () => {
    const scenario = exampleScenario();
    const app = await open(pathOf(scenario), scenario);
    toggle(await traceDetails(), true);
    await act(async () =>
      app.worker.finishExplain(
        explainOffer(scenario, offerIdOf(scenario), 'mid'),
      ),
    );
    const rows = Array.from(
      document.querySelectorAll('li[data-formula="F3.u"]'),
    );
    expect(within(rows[0] as HTMLElement).getByText('Annahme')).toBeTruthy();
    const price = document.querySelector(
      'li[data-formula="F7.Fm"]',
    ) as HTMLElement;
    expect(within(price).queryByText('Annahme')).toBeNull();
  });

  it('keeps nothing when it is closed', async () => {
    const scenario = exampleScenario();
    const app = await open(pathOf(scenario), scenario);
    const details = await traceDetails();
    toggle(details, true);
    await act(async () =>
      app.worker.finishExplain(
        explainOffer(scenario, offerIdOf(scenario), 'mid'),
      ),
    );
    expect(app.store.getState().result.trace).not.toBeNull();
    toggle(details, false);
    expect(app.store.getState().result.trace).toBeNull();
  });

  it('computes again for the new price case when the price case changes while it is open', async () => {
    const scenario = exampleScenario();
    const app = await open(pathOf(scenario), scenario);
    toggle(await traceDetails(), true);
    await act(async () =>
      app.worker.finishExplain(
        explainOffer(scenario, offerIdOf(scenario), 'mid'),
      ),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'E-Auto günstig' }));
    });
    expect(app.worker.explains).toHaveLength(2);
    expect(app.worker.explains[1]?.request).toMatchObject({
      priceCase: 'evFavorable',
    });
  });

  it('says that it failed, keeps the inputs, and tries again on request', async () => {
    const scenario = exampleScenario();
    const app = await open(pathOf(scenario), scenario);
    toggle(await traceDetails(), true);
    await act(async () => app.worker.failExplain('boom'));
    expect(
      screen.getByText('Der Rechenweg konnte nicht berechnet werden'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    });
    expect(app.worker.explains).toHaveLength(2);
    expect(selectActiveScenario(app.store.getState())).toBe(scenario);
  });
});

const slider = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;

describe('S21: price slider', () => {
  it('shows four sliders at the mid prices of the scenario, unchanged and not saveable', async () => {
    await open('/ergebnis');
    expect(slider('Benzinpreis').value).toBe('1.9');
    expect(slider('Benzinpreis').getAttribute('aria-valuetext')).toBe(
      '1,90 €/l',
    );
    expect(slider('Heimstrompreis').getAttribute('aria-valuetext')).toBe(
      '0,30 €/kWh',
    );
    expect(
      slider('Preissteigerung Benzin').getAttribute('aria-valuetext'),
    ).toBe('0,0 % pro Jahr');
    expect(slider('Preissteigerung Strom')).toBeTruthy();
    expect(
      screen.getByText('Regler entsprechen dem Mittel, nichts geändert.'),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Als Szenario speichern',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Zurücksetzen',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('a change shows the slider case, marks the change and the numbers as updating, and is not saved', async () => {
    const app = await open('/ergebnis');
    await act(async () => {
      fireEvent.change(slider('Benzinpreis'), { target: { value: '2.4' } });
    });
    expect(app.store.getState().ui.sliderPrices).toEqual({
      petrol: 2.4,
      electricity: 0.3,
      petrolEscalationPct: 0,
      electricityEscalationPct: 0,
    });
    expect(slider('Benzinpreis').getAttribute('aria-valuetext')).toBe(
      '2,40 €/l',
    );
    expect(
      screen
        .getByRole('button', { name: 'Regler' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('● geändert, nicht gespeichert')).toBeTruthy();
    expect(screen.getByTestId('status-line').textContent).toContain(
      'Preisfall Regler',
    );
    expect(screen.getByTestId('status-line').textContent).toContain(
      'wird aktualisiert',
    );
    // The scenario itself is untouched and nothing is saved.
    expect(app.store.getState().scenario.dirty).toEqual([]);
    // The last table stays, dimmed, until the numbers of the slider arrive.
    const table = screen.getByRole('table', {
      name: /aufsteigend nach Kosten/,
    });
    expect(table.getAttribute('aria-busy')).toBe('true');
  });

  it('shows the numbers of the slider case when they arrive', async () => {
    const scenario = exampleScenario();
    const prices = {
      petrol: 2.4,
      electricity: 0.3,
      petrolEscalationPct: 0,
      electricityEscalationPct: 0,
    };
    const app = await open('/ergebnis', scenario, prices);
    await act(async () => {
      fireEvent.change(slider('Benzinpreis'), { target: { value: '2.4' } });
    });
    await act(async () =>
      app.worker.finish(computeResults(scenario, { sliderPrices: prices })),
    );
    expect(screen.getByText(/Gesamtkosten \(Regler\)/)).toBeTruthy();
  });

  it('a reset puts the slider back to the mid prices and the table to "Mittel"', async () => {
    const app = await open('/ergebnis');
    await act(async () => {
      fireEvent.change(slider('Heimstrompreis'), { target: { value: '0.45' } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(app.store.getState().ui.sliderPrices).toBeNull();
    expect(app.store.getState().ui.priceCase).toBe('mid');
    expect(slider('Heimstrompreis').value).toBe('0.3');
    expect(screen.queryByRole('button', { name: 'Regler' })).toBeNull();
  });

  it('"Als Szenario speichern" makes a new scenario with the prices and puts the slider away', async () => {
    const app = await open('/ergebnis');
    await act(async () => {
      fireEvent.change(slider('Benzinpreis'), { target: { value: '2.4' } });
      fireEvent.change(slider('Preissteigerung Strom'), {
        target: { value: '3' },
      });
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Als Szenario speichern' }),
      );
    });
    const scenarios = selectScenarios(app.store.getState());
    expect(scenarios.map((s) => s.name)).toEqual([
      'Example',
      'Example · Preis-Regler',
    ]);
    const saved = scenarios[1];
    expect(saved?.iceVehicle.petrolPrice.mid).toBe(2.4);
    expect(saved?.parameters.electricityEscalationPct).toBe(3);
    expect(selectActiveScenario(app.store.getState())?.id).toBe(saved?.id);
    expect(app.store.getState().ui.sliderPrices).toBeNull();
    expect(scenarios[0]?.iceVehicle.petrolPrice.mid).toBe(1.9);
  });

  it('asks for the prices when one is missing', async () => {
    const scenario = exampleScenario();
    scenario.parameters.electricityPrice = { min: null, mid: null, max: null };
    await open('/ergebnis', scenario);
    expect(screen.queryByLabelText('Benzinpreis')).toBeNull();
    expect(
      screen.getByText(/Der Regler braucht die Preise für Benzin und Strom/),
    ).toBeTruthy();
  });
});
