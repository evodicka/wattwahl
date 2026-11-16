import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  exampleCandidate,
  exampleScenario,
} from '../../../../tests/fixtures/exampleScenario';
import { scenarioWithFour } from '../../../../tests/fixtures/fourCandidates';
import { computeResults } from '../../../../tests/fixtures/offerResults';
import {
  planPerState,
  winterRest,
} from '../../../../tests/fixtures/planScenarios';
import type { Scenario } from '../../../domain';
import { renderApp } from '../../__tests__/renderApp';

// S20: cost bars, reserve heatmap, assignment plan and warranty (boards D5, D6, M8, M9).

const purchasePath = (scenario: Scenario, index = 0) =>
  `/ergebnis/${encodeURIComponent(`${scenario.candidates[index]?.id}:purchase`)}`;

async function open(path: string, scenario: Scenario) {
  const app = await renderApp(path, { scenarios: [scenario] });
  await act(async () => app.worker.finish(computeResults(scenario)));
  return app;
}

const heatCells = (region: HTMLElement) =>
  Array.from(region.querySelectorAll<HTMLElement>('tbody td'));

describe('S20: cost bars', () => {
  it('shows one bar per computed offer, sorted like the table, without incomplete or unsuitable ones', async () => {
    await open('/ergebnis', scenarioWithFour());
    const chart = await screen.findByRole('img', { name: /Gestapelte Balken/ });
    const labels = within(chart)
      .getAllByText(/ · /)
      .map((el) => el.textContent);
    expect(labels).toHaveLength(3);
    expect(labels.join()).not.toMatch(/Model C|Model D/);
    // The same order as the table: ascending by total.
    const values = Array.from(chart.querySelectorAll('span'))
      .map((el) => el.textContent ?? '')
      .filter((text) => /^\d{1,3}(\.\d{3})*\s€$/.test(text))
      .map((text) => Number(text.replace(/\D/g, '')));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('draws the four cost parts of every offer and a span stroke', async () => {
    await open('/ergebnis', exampleScenario());
    const chart = await screen.findByRole('img', { name: /Gestapelte Balken/ });
    // 2 offers x 4 parts = 8 bars; each span has a line and two end strokes.
    expect(chart.querySelectorAll('svg rect')).toHaveLength(8);
    expect(chart.querySelectorAll('svg line').length).toBeGreaterThanOrEqual(6);
  });

  it('has the same values as a table, with the parts and the total', async () => {
    await open('/ergebnis', exampleScenario());
    await screen.findByRole('img', { name: /Gestapelte Balken/ });
    const summary = screen.getByText('Als Tabelle lesen');
    const table = within(summary.closest('details') as HTMLElement).getByRole(
      'table',
    );
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Angebot',
      'Anschaffung oder Leasing',
      'Strom',
      'Benzin',
      'Wartung und Reifen',
      'Gesamt',
    ]);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('names the Fahrprofil gap instead of drawing nothing when no offer is computed', async () => {
    const scenario = exampleScenario();
    scenario.candidates = scenario.candidates.map((c) => ({
      ...c,
      netCapacityKwh: null,
    }));
    await open('/ergebnis', scenario);
    expect(screen.queryByRole('img', { name: /Gestapelte Balken/ })).toBeNull();
  });
});

describe('S20: reserve heatmap', () => {
  it('shows 24 cells and every cell has colour, symbol, number and the light as text', async () => {
    const scenario = exampleScenario();
    await open(purchasePath(scenario), scenario);
    const region = await screen.findByRole('region', {
      name: /^Heatmap der Reichweitenreserve/,
    });
    const cells = heatCells(region);
    expect(cells).toHaveLength(24);
    for (const cell of cells) {
      expect(cell.className).toMatch(/green|yellow|red/);
      expect(cell.textContent).toMatch(/[✓▲✕]/);
      expect(cell.textContent).toMatch(/\d/);
      expect(cell.textContent).toMatch(/Grün|Gelb|Rot/);
    }
    expect(within(region).getByText('Weg A')).toBeTruthy();
    expect(within(region).getByText('Weg B')).toBeTruthy();
  });

  it('C2b: cells under the Kilometerreserve are red with their own symbol and text, the reserve is still shown', async () => {
    const scenario = exampleScenario();
    scenario.parameters.minReserveKm = 40;
    await open(purchasePath(scenario), scenario);
    const region = await screen.findByRole('region', {
      name: /^Heatmap der Reichweitenreserve/,
    });
    const below = heatCells(region).filter((c) => c.textContent?.includes('⊘'));
    expect(below.length).toBeGreaterThan(0);
    for (const cell of below) {
      expect(cell.className).toMatch(/red/);
      expect(cell.textContent).toMatch(/Rot, unter der Kilometerreserve/);
      // The number is the reserve itself, not negative: it is below R, not below 0.
      expect(cell.textContent).toMatch(/\d/);
      expect(cell.textContent).not.toMatch(/[−-]\d/);
    }
    expect(
      screen.getByText(/unter der Kilometerreserve von 40\s?km/),
    ).toBeTruthy();
    const list = screen
      .getAllByText('Als Tabelle lesen')
      .map((s) => s.closest('details') as HTMLElement)
      .find((d) => d.querySelector('li'));
    expect(
      within(list as HTMLElement).getAllByText(/unter der Kilometerreserve$/)
        .length,
    ).toBe(below.length);
  });

  it('without a Kilometerreserve no cell has the symbol and the legend does not name it', async () => {
    const scenario = exampleScenario();
    await open(purchasePath(scenario), scenario);
    const region = await screen.findByRole('region', {
      name: /^Heatmap der Reichweitenreserve/,
    });
    expect(heatCells(region).some((c) => c.textContent?.includes('⊘'))).toBe(
      false,
    );
    expect(screen.queryByText(/unter der Kilometerreserve von/)).toBeNull();
  });

  it('names SoH and threshold, and the threshold changes the colours', async () => {
    const strict = exampleScenario();
    strict.parameters.trafficLightGreenFromPct = 90;
    await open(purchasePath(strict), strict);
    const regionStrict = await screen.findByRole('region', {
      name: /^Heatmap der Reichweitenreserve/,
    });
    expect(screen.getByText(/Ampel grün ab 90\s%/)).toBeTruthy();
    const greenStrict = heatCells(regionStrict).filter((c) =>
      c.className.includes('green'),
    ).length;
    const redStrict = heatCells(regionStrict).filter((c) =>
      c.className.includes('red'),
    ).length;
    expect(redStrict).toBe(0);
    expect(
      heatCells(regionStrict).filter((c) => c.className.includes('yellow'))
        .length,
    ).toBeGreaterThan(0);

    const loose = exampleScenario();
    loose.parameters.trafficLightGreenFromPct = 5;
    await open(purchasePath(loose), loose);
    const regions = await screen.findAllByRole('region', {
      name: /^Heatmap der Reichweitenreserve/,
    });
    const regionLoose = regions[regions.length - 1] as HTMLElement;
    const greenLoose = heatCells(regionLoose).filter((c) =>
      c.className.includes('green'),
    ).length;
    expect(greenLoose).toBeGreaterThan(greenStrict);
  });

  describe('C2b: suitability over time', () => {
    const slider = () => screen.getByRole('slider', { name: 'Zeitpunkt' });
    const region = () =>
      screen.getByRole('region', { name: /^Heatmap der Reichweitenreserve/ });

    it('has a labelled slider with a step per year, standing on the end where the check is made', async () => {
      const scenario = exampleScenario();
      await open(purchasePath(scenario), scenario);
      await screen.findByRole('region', {
        name: /^Heatmap der Reichweitenreserve/,
      });
      // D = 48 months: 0, 12, 24, 36 and 48.
      expect(slider().getAttribute('min')).toBe('0');
      expect(slider().getAttribute('max')).toBe('4');
      expect(slider().getAttribute('step')).toBe('1');
      expect((slider() as HTMLInputElement).value).toBe('4');
      expect(slider().getAttribute('aria-valuetext')).toMatch(
        /^Ende, E-Auto-Kilometerstand [\d.]+\s?km, SoH 94,0\s?%$/,
      );
      expect(
        screen.getByText(/SoH am Ende der Vergleichsdauer 94,0\s?%/),
      ).toBeTruthy();
    });

    it('stands on the start if the SoH reference is the start', async () => {
      const scenario = exampleScenario();
      scenario.parameters.sohReference = 'start';
      await open(purchasePath(scenario), scenario);
      await screen.findByRole('region', {
        name: /^Heatmap der Reichweitenreserve/,
      });
      expect((slider() as HTMLInputElement).value).toBe('0');
      expect(screen.getByText(/SoH am Start 100,0\s?%/)).toBeTruthy();
    });

    it('shows the cells of the chosen point in time', async () => {
      const scenario = exampleScenario();
      await open(purchasePath(scenario), scenario);
      await screen.findByRole('region', {
        name: /^Heatmap der Reichweitenreserve/,
      });
      const offerId = `${scenario.candidates[0]?.id}:purchase`;
      const result = computeResults(scenario)[offerId]?.mid;
      if (result?.status !== 'ok') throw new Error('no result');
      const january = () => heatCells(region())[0] as HTMLElement;
      const shows = (pointIndex: number) =>
        String(
          Math.round(
            result.timeline.points[pointIndex]?.cells[0]?.reserveKm ?? NaN,
          ),
        );
      // The reserve of way A in January, from the point's own cells.
      expect(january().textContent).toContain(shows(4));
      fireEvent.change(slider(), { target: { value: '2' } });
      expect(screen.getByText(/SoH nach 24 Monaten/)).toBeTruthy();
      expect(slider().getAttribute('aria-valuetext')).toMatch(/^Monat 24, /);
      expect(january().textContent).toContain(shows(2));
      fireEvent.change(slider(), { target: { value: '0' } });
      expect(screen.getByText(/SoH am Start 100,0\s?%/)).toBeTruthy();
      expect(january().textContent).toContain(shows(0));
      // A full battery has more reserve than an aged one.
      expect(
        result.timeline.points[0]?.cells[0]?.reserveKm ?? 0,
      ).toBeGreaterThan(result.timeline.points[4]?.cells[0]?.reserveKm ?? 0);
    });

    it('is operable with the keyboard: arrow keys are the native range behaviour', async () => {
      const scenario = exampleScenario();
      await open(purchasePath(scenario), scenario);
      await screen.findByRole('region', {
        name: /^Heatmap der Reichweitenreserve/,
      });
      // A native range input takes arrow keys by itself; it must be one, enabled and focusable.
      const input = slider() as HTMLInputElement;
      expect(input.tagName).toBe('INPUT');
      expect(input.type).toBe('range');
      expect(input.disabled).toBe(false);
      expect(input.tabIndex).toBeGreaterThanOrEqual(0);
    });

    it('lists the cells that tip with their limit in words, and says the rest stays suitable', async () => {
      const scenario = exampleScenario();
      scenario.parameters.minReserveKm = 50;
      await open(purchasePath(scenario), scenario);
      await screen.findByRole('region', {
        name: /^Heatmap der Reichweitenreserve/,
      });
      const section = screen.getByRole('heading', {
        name: 'Zeitgrenzen der Eignung',
      }).parentElement as HTMLElement;
      const items = within(section).getAllByRole('listitem');
      expect(items).toHaveLength(5);
      for (const item of items) {
        expect(item.textContent).toMatch(
          /^.+, \p{L}+: (geeignet bis Monat \d+|nicht geeignet oder weniger als einen Monat geeignet)$/u,
        );
      }
      expect(
        within(section).getByText(/Alle anderen Zellen bleiben bis zum Ende/),
      ).toBeTruthy();
    });

    it('says so if no cell tips', async () => {
      const scenario = exampleScenario();
      await open(purchasePath(scenario), scenario);
      await screen.findByRole('region', {
        name: /^Heatmap der Reichweitenreserve/,
      });
      expect(
        screen.getByText(
          'Alle Wege sind in allen Monaten bis zum Ende der Vergleichsdauer geeignet.',
        ),
      ).toBeTruthy();
    });

    it('says that the course holds for this plan only', async () => {
      const scenario = exampleScenario();
      await open(purchasePath(scenario), scenario);
      await screen.findByRole('region', {
        name: /^Heatmap der Reichweitenreserve/,
      });
      expect(screen.getByText(/Der Verlauf gilt bei diesem Plan/)).toBeTruthy();
    });
  });

  it('lists the cells as text under "Als Tabelle lesen"', async () => {
    const scenario = exampleScenario();
    await open(purchasePath(scenario), scenario);
    await screen.findByRole('region', {
      name: /^Heatmap der Reichweitenreserve/,
    });
    const details = screen
      .getAllByText('Als Tabelle lesen')
      .map((s) => s.closest('details') as HTMLElement);
    const list = details.find((d) => d.querySelector('li'));
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(
      24,
    );
    expect(
      within(list as HTMLElement).getAllByText(/^Weg A, Januar: /),
    ).toHaveLength(1);
  });

  it('the choice of offer opens another offer', async () => {
    const scenario = exampleScenario();
    const app = await open(purchasePath(scenario), scenario);
    await screen.findByRole('region', {
      name: /^Heatmap der Reichweitenreserve/,
    });
    const select = screen.getByLabelText('Kandidat');
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual([
      'Example EV · Kauf',
      expect.stringMatching(/^Example EV · Leasing 15\.000/),
    ]);
    const lease = within(select).getAllByRole('option')[1] as HTMLOptionElement;
    fireEvent.change(select, { target: { value: lease.value } });
    expect(decodeURIComponent(app.router.state.location.pathname)).toMatch(
      /:lease:/,
    );
  });
});

describe('S20: assignment plan', () => {
  const planRegion = () =>
    screen.findByRole('region', { name: /^Zuordnungsplan, seitlich/ });

  it('TC16: shows E→A for "only A" and E→B for both on Monday, in words', async () => {
    const scenario = planPerState();
    await open(purchasePath(scenario), scenario);
    const region = await planRegion();
    const monday = within(region).getByRole('row', { name: /Mo/ });
    expect(
      within(monday).getAllByRole('img', {
        name: 'nur Büro besetzt: E-Auto fährt zu Büro',
      }),
    ).toHaveLength(12);
    expect(
      within(monday).getAllByRole('img', {
        name: 'beide Stätten besetzt: E-Auto fährt zu Werk',
      }),
    ).toHaveLength(12);
  });

  it('TC12: "E ruht" in January on Monday and that month is highlighted as a change', async () => {
    const scenario = winterRest();
    await open(purchasePath(scenario), scenario);
    const region = await planRegion();
    const monday = within(region).getByRole('row', { name: /Mo/ });
    const resting = within(monday).getAllByRole('img', {
      name: 'nur Büro besetzt: Verbrenner fährt zu Büro, E-Auto ruht',
    });
    expect(resting).toHaveLength(1);
    const cells = Array.from(monday.querySelectorAll('td'));
    expect(cells.filter((c) => c.className.includes('change'))).toHaveLength(1);
    expect(cells[0]?.className).toContain('change');
  });

  it('explains the symbols in a legend with the workplace names', async () => {
    const scenario = planPerState();
    await open(purchasePath(scenario), scenario);
    await planRegion();
    const legend = screen.getByRole('group', {
      name: 'Legende des Zuordnungsplans',
    });
    expect(within(legend).getByText('E-Auto')).toBeTruthy();
    expect(within(legend).getByText('Verbrenner')).toBeTruthy();
    expect(within(legend).getByText('Büro (Weg A)')).toBeTruthy();
    expect(within(legend).getByText('Werk (Weg B)')).toBeTruthy();
  });
});

describe('S20: warranty', () => {
  it('a bought new car shows its budget, its source and the extra cost of the budget', async () => {
    const scenario = exampleScenario();
    await open(purchasePath(scenario), scenario);
    const section = (
      await screen.findByRole('heading', { name: 'Garantie' })
    ).closest('section') as HTMLElement;
    expect(within(section).getByText('Jahresbudget')).toBeTruthy();
    expect(within(section).getByText(/20\.000\skm pro Jahr/)).toBeTruthy();
    expect(
      within(section).getByText(/Akku-Restgarantie 160\.000\skm ÷ 8,0 Jahre/),
    ).toBeTruthy();
    expect(within(section).getByText('Geplante E-Auto-Kilometer')).toBeTruthy();
    expect(
      within(section).getByText('Jahre bis zur Kilometergrenze'),
    ).toBeTruthy();
    expect(
      within(section).getByText('Mehrkosten durch Garantie-Budget:'),
    ).toBeTruthy();
  });

  it('a lease says that its tier is the limit and shows no budget', async () => {
    const scenario = exampleScenario();
    const leaseId = `${scenario.candidates[0]?.id}:lease:${scenario.candidates[0]?.leaseTiers[0]?.id}`;
    await open(`/ergebnis/${encodeURIComponent(leaseId)}`, scenario);
    const section = (
      await screen.findByRole('heading', { name: 'Garantie' })
    ).closest('section') as HTMLElement;
    expect(
      within(section).getByText(/Bei Leasing ist die Stufe die Grenze/),
    ).toBeTruthy();
    expect(within(section).queryByText('Jahresbudget')).toBeNull();
  });

  it('Z13: no warranty at all is said so, without a budget', async () => {
    const scenario = exampleScenario();
    scenario.candidates = [
      {
        ...exampleCandidate(),
        leaseTiers: [],
        vehicleWarranty: { years: 0, km: 0 },
        batteryWarranty: { years: 0, km: 0 },
      },
    ];
    await open(purchasePath(scenario), scenario);
    const section = (
      await screen.findByRole('heading', { name: 'Garantie' })
    ).closest('section') as HTMLElement;
    expect(within(section).getByText('Ohne Garantie')).toBeTruthy();
    expect(
      within(section).getByText(
        'Beide Garantien sind abgelaufen. Kein Jahresbudget.',
      ),
    ).toBeTruthy();
  });

  it('Z20: a used car shows the remaining warranty the app worked out, with its inputs', async () => {
    const scenario = exampleScenario();
    scenario.parameters.warrantyReferenceMonth = { month: 3, year: 2025 };
    scenario.candidates = [
      {
        ...exampleCandidate(),
        condition: 'used',
        firstRegistration: { month: 3, year: 2022 },
        mileageKm: 80000,
        vehicleWarranty: { years: 3, km: 100000 },
        batteryWarranty: { years: 6, km: 140000 },
        leaseTiers: [],
      },
    ];
    await open(purchasePath(scenario), scenario);
    const section = (
      await screen.findByRole('heading', { name: 'Garantie' })
    ).closest('section') as HTMLElement;
    expect(
      within(section).getByText(
        'Restgarantie zum Stichtag 03/2025 (berechnet)',
      ),
    ).toBeTruthy();
    expect(
      within(section).getByText(
        /Erstzulassung 03\/2022, Laufleistung 80\.000\skm, Alter 3,0 Jahre/,
      ),
    ).toBeTruthy();
    expect(
      within(section).getByText(/Fahrzeug 3 J \/ 100\.000\skm → abgelaufen/),
    ).toBeTruthy();
    expect(
      within(section).getByText(
        /Akku 6 J \/ 140\.000\skm → 3,0 Jahre \/ 60\.000\skm/,
      ),
    ).toBeTruthy();
    expect(within(section).getByText('Fahrzeug ohne Garantie')).toBeTruthy();
    expect(
      within(section)
        .getByRole('link', { name: 'Stichtag in den Parametern ändern' })
        .getAttribute('href'),
    ).toBe('/parameter');
  });
});

describe('S20: warranty, more states', () => {
  it('Z17: a plan over the budget says so with the extra cost and the km limit', async () => {
    const scenario = exampleScenario();
    const results = computeResults(scenario);
    const id = `${scenario.candidates[0]?.id}:purchase`;
    const result = results[id]?.mid;
    if (result?.status !== 'ok') throw new Error('no ok result');
    results[id] = {
      ...results[id],
      mid: {
        ...result,
        evKmPerYear: 24000,
        costs: { ...result.costs, budgetExtraCost: 1200 },
        warranty: {
          ...result.warranty,
          budgetExceeded: true,
          yearsToKmLimit: { vehicle: 4.1, battery: 6.7 },
        },
      },
    };
    const app = await renderApp(purchasePath(scenario), {
      scenarios: [scenario],
    });
    await act(async () => app.worker.finish(results));
    const section = (
      await screen.findByRole('heading', { name: 'Garantie' })
    ).closest('section') as HTMLElement;
    expect(within(section).getByText('Budget überschritten')).toBeTruthy();
    expect(
      within(section).getByText(
        /^Geplant 24\.000\skm, Budget 20\.000\skm\. Die Kilometergrenze ist nach 4,1 Jahre erreicht\. Mehrkosten 1\.200\s€\.$/,
      ),
    ).toBeTruthy();
    expect(within(section).getByText('pro Jahr, über dem Budget')).toBeTruthy();
  });

  it('a lease with both warranties expired shows the tier as the limit, not "ohne Garantie"', async () => {
    const scenario = exampleScenario();
    scenario.candidates = scenario.candidates.map((c) => ({
      ...c,
      vehicleWarranty: { years: 0, km: 0 },
      batteryWarranty: { years: 0, km: 0 },
    }));
    const candidate = scenario.candidates[0];
    const leaseId = `${candidate?.id}:lease:${candidate?.leaseTiers[0]?.id}`;
    await open(`/ergebnis/${encodeURIComponent(leaseId)}`, scenario);
    const section = (
      await screen.findByRole('heading', { name: 'Garantie' })
    ).closest('section') as HTMLElement;
    expect(
      within(section).getByText(/Bei Leasing ist die Stufe die Grenze/),
    ).toBeTruthy();
    expect(
      within(section).queryByText(
        'Beide Garantien sind abgelaufen. Kein Jahresbudget.',
      ),
    ).toBeNull();
    expect(within(section).getByText('Fahrzeug ohne Garantie')).toBeTruthy();
  });

  it('with the budget switched off as a target the budget is told to be a hint', async () => {
    const scenario = exampleScenario();
    scenario.parameters.warrantyBudgetAsTarget = false;
    await open(purchasePath(scenario), scenario);
    const section = (
      await screen.findByRole('heading', { name: 'Garantie' })
    ).closest('section') as HTMLElement;
    expect(
      within(section).getByText(
        /als Ziel ausgeschaltet, der Wert ist nur ein Hinweis/,
      ),
    ).toBeTruthy();
    expect(within(section).getByText('Jahresbudget')).toBeTruthy();
  });

  it('marks a changed month of the plan with a symbol and a text, not by colour alone', async () => {
    const scenario = winterRest();
    await open(purchasePath(scenario), scenario);
    const region = await screen.findByRole('region', {
      name: /^Zuordnungsplan, seitlich/,
    });
    const monday = within(region).getByRole('row', { name: /Mo/ });
    expect(
      within(monday).getAllByText('Plan weicht vom Sommerplan ab'),
    ).toHaveLength(1);
    expect(monday.querySelectorAll('td')[0]?.textContent).toContain('◆');
  });
});

describe('S20: the rest of the detail view', () => {
  it('names total, range and suitability and links the scenario comparison', async () => {
    const scenario = exampleScenario();
    const app = await open(purchasePath(scenario), scenario);
    await screen.findByRole('region', {
      name: /^Heatmap der Reichweitenreserve/,
    });
    expect(screen.getByText(/Gesamtkosten \(Mittel\)/)).toBeTruthy();
    expect(screen.getByText(/^Spanne \d/)).toBeTruthy();
    expect(screen.getByTestId('status-line').textContent).toContain(
      'Preisfall Mittel',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Zum Szenariovergleich' }),
    );
    expect(app.router.state.location.pathname).toBe('/szenarien');
  });
});
