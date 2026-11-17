import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { exampleScenario } from '../../../../tests/fixtures/exampleScenario';
import { scenarioWithFour } from '../../../../tests/fixtures/fourCandidates';
import { computeResults } from '../../../../tests/fixtures/offerResults';
import type { Scenario } from '../../../domain';
import {
  priceCaseSet,
  requestCompute,
  scenarioUpdated,
  sliderPricesSet,
} from '../../../state';
import { renderApp } from '../../__tests__/renderApp';

// S19: result table, price case, offer cards (boards D5, M8, T2, T4; states Z01 to Z04).

async function open(path: string, scenario: Scenario = scenarioWithFour()) {
  const app = await renderApp(path, { scenarios: [scenario] });
  await act(async () => app.worker.finish(computeResults(scenario)));
  return app;
}

const phone = () => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};
afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

const bodyRows = () =>
  within(screen.getByRole('table', { name: /aufsteigend nach Kosten/ }))
    .getAllByRole('row')
    .slice(1);
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell');

describe('S19: result table on a desktop', () => {
  it('has the columns of the specification, with the price case in the cost header', async () => {
    await open('/ergebnis');
    const table = screen.getByRole('table', {
      name: /aufsteigend nach Kosten/,
    });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual([
      'Kandidat',
      'Angebot',
      'Eignung',
      'Gesamtkosten (Mittel)Spanne günstig bis ungünstig',
      'Kleinste ReserveWeg, Monat',
      'E-Auto km/Jahr',
      'E-Auto am Ende',
      'Verbrenner am Ende',
      'Garantie',
    ]);
    expect(within(table).getByText(/aufsteigend nach Kosten/)).toBeTruthy();
  });

  it('sorts suitable offers by cost and puts the others last, greyed out (Z02, Z03)', async () => {
    await open('/ergebnis');
    const rows = bodyRows();
    expect(rows).toHaveLength(5);
    const names = rows.map((r) => cellsOf(r)[0]?.textContent);
    expect(names.slice(-2)).toEqual(['Model C', 'Model D']);

    const euro = (row: HTMLElement) =>
      Number(
        (cellsOf(row)[3]?.querySelector('b')?.textContent ?? '').replace(
          /\D/g,
          '',
        ),
      );
    const totals = rows.slice(0, 3).map(euro);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));

    const [incomplete, unsuitable] = rows.slice(-2);
    if (!incomplete || !unsuitable) throw new Error('missing rows');
    expect(within(incomplete).getByText('Unvollständig')).toBeTruthy();
    expect(
      within(incomplete).getByText('1 Angabe fehlt: Netto-Akkukapazität'),
    ).toBeTruthy();
    expect(within(unsuitable).getByText('Ungeeignet')).toBeTruthy();
    expect(within(unsuitable).getByText(/nicht fahrbar|SoH/)).toBeTruthy();
    expect(cellsOf(unsuitable)[3]?.textContent).toBe('–');
  });

  it('shows total, span, reserve, EV and petrol kilometres and warranty of a suitable offer', async () => {
    await open('/ergebnis');
    const row = bodyRows().find(
      (r) =>
        cellsOf(r)[0]?.textContent === 'Example EV' &&
        cellsOf(r)[1]?.textContent === 'Kauf',
    );
    if (!row) throw new Error('no purchase row');
    const cells = cellsOf(row);
    expect(cells[3]?.textContent).toMatch(
      /\d+\.\d{3}\s?€.*\d+\.\d{3} – \d+\.\d{3}\s?€/,
    );
    expect(cells[4]?.textContent).toMatch(/\d+\s?km · \d+\s?%.*Weg [AB], /);
    expect(cells[5]?.textContent).toMatch(/^\d+(\.\d{3})?$/);
    expect(cells[6]?.textContent).toMatch(/km$/);
    expect(cells[7]?.textContent).toMatch(/km$/);
    expect(cells[8]?.textContent).toMatch(
      /im Budget|Budget wirkt|ohne Garantie|überschritten/i,
    );
  });

  it('says "Ohne Garantie" for an offer with no warranty', async () => {
    const scenario = exampleScenario();
    scenario.candidates = scenario.candidates.map((c) => ({
      ...c,
      leaseTiers: [],
      vehicleWarranty: { years: 0, km: 0 },
      batteryWarranty: { years: 0, km: 0 },
    }));
    await open('/ergebnis', scenario);
    expect(
      within(
        screen.getByRole('table', { name: /aufsteigend nach Kosten/ }),
      ).getByText('Ohne Garantie'),
    ).toBeTruthy();
  });

  it('a lease offer shows that its tier is the limit', async () => {
    await open('/ergebnis');
    expect(
      within(
        screen.getByRole('table', { name: /aufsteigend nach Kosten/ }),
      ).getByText('Stufe ist die Grenze'),
    ).toBeTruthy();
  });
});

describe('S19: price case', () => {
  it('switches the shown price case, the header and the numbers', async () => {
    const app = await open('/ergebnis');
    const first = () =>
      cellsOf(bodyRows()[0] as HTMLElement)[3]?.querySelector('b')?.textContent;
    const before = first();
    const group = screen.getByRole('group', { name: 'Preisfall' });
    expect(
      within(group)
        .getByRole('button', { name: 'Mittel' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(within(group).queryByRole('button', { name: 'Regler' })).toBeNull();

    fireEvent.click(
      within(group).getByRole('button', { name: 'E-Auto günstig' }),
    );
    expect(app.store.getState().ui.priceCase).toBe('evFavorable');
    expect(
      within(group)
        .getByRole('button', { name: 'E-Auto günstig' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText(/Gesamtkosten \(E-Auto günstig\)/)).toBeTruthy();
    expect(screen.getByTestId('status-line').textContent).toContain(
      'Preisfall E-Auto günstig',
    );
    expect(first()).not.toBe(before);
    // The results hold all price cases: no new computation is started.
    expect(app.worker.computes).toHaveLength(1);
  });
});

describe('S19: states', () => {
  it('names the first steps when there is nothing to compare (Z01)', async () => {
    const empty = exampleScenario();
    empty.candidates = [];
    const app = await open('/ergebnis', empty);
    expect(screen.getByText('Noch nichts zu vergleichen')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Ersten Kandidaten anlegen' }),
    );
    expect(app.router.state.location.pathname).toBe('/kandidaten');
  });

  it('says that the numbers are being computed before the first result', async () => {
    await renderApp('/ergebnis', { scenarios: [scenarioWithFour()] });
    expect(screen.getByText('Wird berechnet …')).toBeTruthy();
    expect(
      screen.queryByRole('table', { name: /aufsteigend nach Kosten/ }),
    ).toBeNull();
  });

  it('marks the numbers as "wird aktualisiert" while a change is computed (Z04)', async () => {
    const app = await open('/ergebnis');
    const table = screen.getByRole('table', {
      name: /aufsteigend nach Kosten/,
    });
    expect(table.getAttribute('aria-busy')).toBeNull();
    const scenario = scenarioWithFour();
    await act(async () => {
      app.store.dispatch(scenarioUpdated({ ...scenario, name: 'Standard 2' }));
    });
    expect(screen.getByTestId('status-line').textContent).toContain(
      'wird aktualisiert',
    );
    // The last result stays on screen, marked as busy.
    expect(
      screen
        .getByRole('table', { name: /aufsteigend nach Kosten/ })
        .getAttribute('aria-busy'),
    ).toBe('true');
  });
});

describe('S19: row opens the offer (frame of the detail view)', () => {
  it('a click on a row opens #/ergebnis/:offerId with its title and a way back', async () => {
    const app = await open('/ergebnis');
    const row = bodyRows()[0];
    if (!row) throw new Error('no row');
    fireEvent.click(row);
    expect(decodeURIComponent(app.router.state.location.pathname)).toMatch(
      /^\/ergebnis\/[\w-]+:(purchase|lease:[\w-]+)$/,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /Example EV|Model B/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: /← Ergebnis/ }));
    expect(app.router.state.location.pathname).toBe('/ergebnis');
  });

  it('the name in the first cell is a link for the keyboard', async () => {
    await open('/ergebnis');
    const row = bodyRows()[0];
    if (!row) throw new Error('no row');
    const link = within(row).getByRole('link');
    expect(link.getAttribute('href')).toContain('/ergebnis/');
  });

  it('an unknown offer leads back to the comparison', async () => {
    const app = await open('/ergebnis/gibt-es-nicht');
    expect(app.router.state.location.pathname).toBe('/ergebnis');
  });
});

describe('S19: result cards on a phone', () => {
  it('shows one card per offer, in the order of the table, with short price case names', async () => {
    phone();
    await open('/ergebnis');
    expect(
      screen.queryByRole('table', { name: /aufsteigend nach Kosten/ }),
    ).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Angebote nach Kosten' }),
    ).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Preisfall' });
    expect(within(group).getByRole('button', { name: 'Günstig' })).toBeTruthy();
    expect(
      within(group).getByRole('button', { name: 'Ungünstig' }),
    ).toBeTruthy();

    const card = screen.getByRole('region', { name: /Example EV · Kauf/ });
    expect(
      within(card).getByText(/Spanne \d+\.\d{3} – \d+\.\d{3}\s?€/),
    ).toBeTruthy();
    expect(within(card).getByText('Kleinste Reserve')).toBeTruthy();
    expect(within(card).getByText('E-Auto pro Jahr')).toBeTruthy();
    // C2b: the EV odometer at the end, like the petrol car's, for a suitable offer only.
    expect(within(card).getByText('E-Auto am Ende')).toBeTruthy();
    expect(within(card).getByText('Verbrenner am Ende')).toBeTruthy();
    expect(
      within(card)
        .getByRole('link', { name: /Details ansehen/ })
        .getAttribute('href'),
    ).toContain('/ergebnis/');

    const incomplete = screen.getByRole('region', { name: /Model C · Kauf/ });
    expect(
      within(incomplete).getByText('1 Angabe fehlt: Netto-Akkukapazität'),
    ).toBeTruthy();
    expect(
      within(incomplete).queryByRole('link', { name: /Details/ }),
    ).toBeNull();
    expect(within(incomplete).queryByText('E-Auto am Ende')).toBeNull();
  });
});

describe('S19: review findings', () => {
  it('shows an error with a retry when the first computation fails', async () => {
    const app = await renderApp('/ergebnis', {
      scenarios: [scenarioWithFour()],
    });
    await act(async () => app.worker.fail('boom'));
    expect(screen.getByText('Die Berechnung ist fehlgeschlagen')).toBeTruthy();
    expect(screen.queryByText('Wird berechnet …')).toBeNull();
    const before = app.worker.computes.length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    });
    expect(app.worker.computes.length).toBe(before + 1);
  });

  it('keeps the last table and says it is outdated when a later computation fails', async () => {
    const app = await open('/ergebnis');
    await act(async () => {
      void app.store.dispatch(requestCompute());
    });
    await act(async () => app.worker.fail('boom'));
    expect(
      screen.getByRole('table', { name: /aufsteigend nach Kosten/ }),
    ).toBeTruthy();
    expect(screen.getByText('Die Zahlen sind nicht aktuell')).toBeTruthy();
  });

  it('a link in an incomplete row does not open an offer', async () => {
    const scenario = exampleScenario();
    scenario.iceVehicle = { ...scenario.iceVehicle, maintenancePerKm: null };
    const app = await open('/ergebnis', scenario);
    const [link] = within(
      screen.getByRole('table', { name: /aufsteigend nach Kosten/ }),
    ).getAllByRole('link', {
      name: 'Fahrprofil',
    });
    if (!link) throw new Error('no link');
    fireEvent.click(link);
    expect(app.router.state.location.pathname).toBe('/fahrprofil');
  });

  it('only a computed offer opens: incomplete and unsuitable rows have no link', async () => {
    await open('/ergebnis');
    const rows = bodyRows();
    for (const row of rows.slice(-2)) {
      expect(within(row).queryByRole('link', { name: /Model/ })).toBeNull();
    }
    expect(within(rows[0] as HTMLElement).getByRole('link')).toBeTruthy();
  });

  it('opens an offer by an encoded deep link and keeps it while results are replaced', async () => {
    const scenario = scenarioWithFour();
    const id = `${scenario.candidates[1]?.id}:purchase`;
    const app = await open(`/ergebnis/${encodeURIComponent(id)}`, scenario);
    expect(app.router.state.location.pathname).toBe(
      `/ergebnis/${encodeURIComponent(id)}`,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Model B · Kauf' }),
    ).toBeTruthy();
    // A change under way: the stale results do not decide that the id is unknown.
    await act(async () => {
      app.store.dispatch(scenarioUpdated({ ...scenario, name: 'Standard 2' }));
    });
    expect(app.router.state.location.pathname).toBe(
      `/ergebnis/${encodeURIComponent(id)}`,
    );
  });

  it('an incomplete offer has no detail view: its id leads back to the comparison', async () => {
    const scenario = scenarioWithFour();
    const id = `${scenario.candidates[2]?.id}:purchase`;
    const app = await open(`/ergebnis/${encodeURIComponent(id)}`, scenario);
    expect(app.router.state.location.pathname).toBe('/ergebnis');
  });

  it('the slider case goes back to "Mittel" when the slider goes', async () => {
    const app = await open('/ergebnis');
    await act(async () => {
      app.store.dispatch(
        sliderPricesSet({
          petrol: 1.9,
          electricity: 0.3,
          petrolEscalationPct: 0,
          electricityEscalationPct: 0,
        }),
      );
      app.store.dispatch(priceCaseSet('slider'));
    });
    expect(app.store.getState().ui.priceCase).toBe('slider');
    await act(async () => {
      app.store.dispatch(sliderPricesSet(null));
    });
    expect(app.store.getState().ui.priceCase).toBe('mid');
    expect(screen.getByTestId('status-line').textContent).toContain(
      'Preisfall Mittel',
    );
  });
});

describe('C4b: hiding the lease offers', () => {
  const leaseSwitch = () => screen.queryByRole('switch', { name: /Leasing/ });

  it('the switch hides the lease rows at once, names how many are hidden, and saves the choice', async () => {
    const app = await open('/ergebnis');
    expect(bodyRows()).toHaveLength(5);
    const toggle = leaseSwitch();
    if (!toggle) throw new Error('no switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(/ausgeblendet/)).toBeNull();

    fireEvent.click(toggle);
    // The results still hold the lease results: the view filters by itself.
    expect(bodyRows()).toHaveLength(4);
    expect(
      screen
        .getByRole('switch', { name: /Leasing/ })
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(screen.getByText('1 Leasingangebot ausgeblendet')).toBeTruthy();
    expect(
      app.store.getState().scenario.byId[scenarioWithFour().id],
    ).toMatchObject({
      includeLeaseOffers: false,
    });

    fireEvent.click(screen.getByRole('switch', { name: /Leasing/ }));
    expect(bodyRows()).toHaveLength(5);
    expect(screen.queryByText(/ausgeblendet/)).toBeNull();
  });

  it('has no switch without lease tiers, unless the lease offers are hidden', async () => {
    const scenario = scenarioWithFour();
    scenario.candidates = scenario.candidates.map((c) => ({
      ...c,
      leaseTiers: [],
    }));
    await open('/ergebnis', scenario);
    expect(leaseSwitch()).toBeNull();
  });

  it('keeps the switch while hidden, even after the last tier is gone', async () => {
    const scenario = scenarioWithFour();
    scenario.includeLeaseOffers = false;
    scenario.candidates = scenario.candidates.map((c) => ({
      ...c,
      leaseTiers: [],
    }));
    await open('/ergebnis', scenario);
    expect(leaseSwitch()?.getAttribute('aria-checked')).toBe('false');
  });

  it('has no switch in a detail view, hiding the leases would take the open offer away', async () => {
    const scenario = scenarioWithFour();
    const purchase = Object.keys(computeResults(scenario))[0];
    if (!purchase) throw new Error('no offer');
    await open(`/ergebnis/${encodeURIComponent(purchase)}`, scenario);
    expect(leaseSwitch()).toBeNull();
  });

  it('the detail route of a hidden lease offer leads back to the comparison', async () => {
    const scenario = scenarioWithFour();
    const lease = Object.keys(computeResults(scenario)).find((id) =>
      id.includes(':lease:'),
    );
    if (!lease) throw new Error('no lease offer');
    const hidden = { ...scenario, includeLeaseOffers: false };
    const app = await renderApp(`/ergebnis/${encodeURIComponent(lease)}`, {
      scenarios: [hidden],
    });
    await act(async () => app.worker.finish(computeResults(scenario)));
    expect(app.router.state.location.pathname).toBe('/ergebnis');
  });
});
