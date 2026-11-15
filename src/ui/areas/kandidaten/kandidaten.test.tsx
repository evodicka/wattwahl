import { act, fireEvent, screen, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXAMPLE_IDS,
  exampleCandidate,
  exampleScenario,
} from '../../../../tests/fixtures/exampleScenario';
import { computeResults } from '../../../../tests/fixtures/offerResults';
import type { Scenario } from '../../../domain';
import { selectActiveScenario } from '../../../state';
import { renderApp } from '../../__tests__/renderApp';
import { routes } from '../../router';
import { AreaBoundary } from '../../shell/AreaBoundary';

// S18: candidate list and form (boards D2, M2, D3, M3 to M6; states Z01 to Z03, Z19 to Z22).

let counter = 0;
const randomId = () =>
  `60000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const ID_B = '00000000-0000-4000-8000-0000000000b2';

type App = Awaited<ReturnType<typeof renderApp>>;
const active = (app: App): Scenario => {
  const scenario = selectActiveScenario(app.store.getState());
  if (!scenario) throw new Error('no active scenario');
  return scenario;
};

/** Opens the app with the scenario and answers the first compute with real results. */
async function open(path: string, scenario: Scenario = exampleScenario()) {
  const app = await renderApp(path, { scenarios: [scenario], randomId });
  await act(async () => app.worker.finish(computeResults(scenario)));
  return app;
}

const withIncomplete = (): Scenario => {
  const scenario = exampleScenario();
  scenario.candidates = [
    ...scenario.candidates,
    {
      ...exampleCandidate(),
      id: ID_B,
      name: 'Model C',
      netCapacityKwh: null,
      leaseTiers: [],
    },
  ];
  return scenario;
};

function enter(label: string | RegExp, text: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
  return input;
}

beforeEach(() => {
  counter = 0;
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});
afterEach(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('S18: candidate list', () => {
  it('shows the empty state with the first step (Z01) and creates a candidate', async () => {
    const app = await renderApp('/kandidaten', { randomId });
    expect(screen.getByText('Noch kein Kandidat')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Ersten Kandidaten anlegen' }),
    );
    expect(active(app).candidates).toHaveLength(1);
    expect(app.router.state.location.pathname).toBe(
      `/kandidaten/${active(app).candidates[0]?.id}`,
    );
  });

  it('shows a suitable card with the smallest reserve and its offers', async () => {
    await open('/kandidaten');
    const card = screen.getByRole('region', { name: 'Example EV' });
    expect(within(card).getByText(/Geeignet|Knapp/)).toBeTruthy();
    expect(within(card).getByText(/Kleinste Reserve/)).toBeTruthy();
    expect(within(card).getByText('Kauf')).toBeTruthy();
    expect(within(card).getByText(/Leasing 15\.000/)).toBeTruthy();
  });

  it('an incomplete card names the missing fields and the others are computed (Z02)', async () => {
    await open('/kandidaten', withIncomplete());
    const incomplete = screen.getByRole('region', { name: 'Model C' });
    expect(within(incomplete).getByText('Unvollständig')).toBeTruthy();
    expect(within(incomplete).getByText('Es fehlt 1 Angabe')).toBeTruthy();
    expect(within(incomplete).getByText('Netto-Akkukapazität')).toBeTruthy();
    expect(
      within(incomplete).getByRole('button', { name: /Ergänzen/ }),
    ).toBeTruthy();
    const other = screen.getByRole('region', { name: 'Example EV' });
    expect(within(other).queryByText(/Es fehlt/)).toBeNull();
    expect(within(other).getByText(/Geeignet|Knapp/)).toBeTruthy();
  });

  it('duplicates a candidate and lists both', async () => {
    const app = await open('/kandidaten');
    fireEvent.click(
      screen.getByRole('button', { name: 'Duplizieren: Example EV' }),
    );
    expect(active(app).candidates.map((c) => c.name)).toEqual([
      'Example EV',
      'Example EV (Kopie)',
    ]);
    expect(
      screen.getByRole('region', { name: 'Example EV (Kopie)' }),
    ).toBeTruthy();
  });

  it('deletes only after the confirmation (Z19)', async () => {
    const app = await open('/kandidaten');
    fireEvent.click(
      screen.getByRole('button', { name: 'Löschen: Example EV' }),
    );
    expect(active(app).candidates).toHaveLength(1);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(
      within(dialog).getByText('Kandidat „Example EV“ löschen?'),
    ).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Löschen', hidden: true }),
    );
    expect(active(app).candidates).toHaveLength(0);
  });
});

describe('S18: candidate form on a desktop', () => {
  it('shows all groups and the jump menu', async () => {
    await open(`/kandidaten/${EXAMPLE_IDS.candidate}`);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Example EV bearbeiten' }),
    ).toBeTruthy();
    for (const group of [
      'Allgemein',
      'Akku',
      'Preis',
      'Leasingangebote',
      'Fahrzeuggarantie',
      'Akkugarantie',
    ]) {
      expect(screen.getByRole('heading', { name: group })).toBeTruthy();
    }
    const menu = screen.getByRole('navigation', {
      name: 'Gruppen im Formular',
    });
    expect(within(menu).getAllByRole('button')).toHaveLength(6);
    expect(screen.queryByText(/Schritt 1 von 4/)).toBeNull();
  });

  it('saves a typed value into the scenario (TC15 on the form)', async () => {
    const app = await open(`/kandidaten/${EXAMPLE_IDS.candidate}`);
    enter(/^Netto-Akkukapazität/, '72,5');
    expect(active(app).candidates[0]?.netCapacityKwh).toBe(72.5);
    enter(/^Kaufpreis/, '-5');
    expect(screen.getByText(/Negativ nicht möglich/)).toBeTruthy();
    expect(active(app).candidates[0]?.purchasePrice).toBe(40000);
  });

  it('shows the used-car fields only for a used car and clears them for a new one (Z20)', async () => {
    const app = await open(`/kandidaten/${EXAMPLE_IDS.candidate}`);
    expect(screen.queryByLabelText(/^Laufleistung/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Zustand/), {
      target: { value: 'used' },
    });
    expect(screen.getByLabelText(/^Laufleistung/)).toBeTruthy();
    expect(screen.getByRole('group', { name: /Erstzulassung/ })).toBeTruthy();
    expect(screen.getByText(/Gebraucht ohne Erstzulassung/)).toBeTruthy();
    enter(/^Laufleistung/, '80.000');
    expect(active(app).candidates[0]?.mileageKm).toBe(80000);
    fireEvent.change(screen.getByLabelText(/^Zustand/), {
      target: { value: 'new' },
    });
    expect(active(app).candidates[0]).toMatchObject({
      mileageKm: 0,
      firstRegistration: null,
    });
  });

  it('warns about a first registration after the Stichtag without blocking it (Z22)', async () => {
    const app = await open(`/kandidaten/${EXAMPLE_IDS.candidate}`);
    fireEvent.change(screen.getByLabelText(/^Zustand/), {
      target: { value: 'used' },
    });
    const group = screen.getByRole('group', { name: /Erstzulassung/ });
    fireEvent.change(within(group).getByLabelText('Monat'), {
      target: { value: '6' },
    });
    const year = within(group).getByLabelText('Jahr');
    fireEvent.change(year, { target: { value: '2027' } });
    fireEvent.blur(year);
    expect(active(app).candidates[0]?.firstRegistration).toEqual({
      month: 6,
      year: 2027,
    });
    expect(screen.getByText(/Liegt nach dem Stichtag 03\/2026/)).toBeTruthy();
  });

  it('warns when cold is above mild and still stores it', async () => {
    const app = await open(`/kandidaten/${EXAMPLE_IDS.candidate}`);
    const group = screen.getByRole('group', { name: 'Stadt' });
    const cold = within(group).getByLabelText(/^Kalt/);
    fireEvent.change(cold, { target: { value: '500' } });
    fireEvent.blur(cold);
    expect(screen.getByText(/Kalt ist größer als mild/)).toBeTruthy();
    expect(active(app).candidates[0]?.rangeKm.city.cold).toBe(500);
  });

  it('asks to check the warranty values after a migration and clears the hint (Z21)', async () => {
    const scenario = exampleScenario();
    scenario.candidates = scenario.candidates.map((c) => ({
      ...c,
      warrantyNeedsReview: true,
    }));
    const app = await open(`/kandidaten/${EXAMPLE_IDS.candidate}`, scenario);
    expect(screen.getByText('Garantiewerte prüfen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Werte stimmen' }));
    expect(active(app).candidates[0]?.warrantyNeedsReview).toBe(false);
    expect(screen.queryByText('Garantiewerte prüfen')).toBeNull();
  });

  it('adds lease offers up to four and not a fifth', async () => {
    const app = await open(`/kandidaten/${EXAMPLE_IDS.candidate}`);
    const add = screen.getByRole('button', { name: 'Leasingstufe hinzufügen' });
    for (let i = 0; i < 3; i += 1) fireEvent.click(add);
    expect(active(app).candidates[0]?.leaseTiers).toHaveLength(4);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Mehr als vier Stufen/)).toBeTruthy();
  });

  it('does not store a second offer of the same tier', async () => {
    const app = await open(`/kandidaten/${EXAMPLE_IDS.candidate}`);
    fireEvent.click(
      screen.getByRole('button', { name: 'Leasingstufe hinzufügen' }),
    );
    // The new tier is 10.000; setting it to 15.000 collides with the first.
    const second = document.getElementById(
      'f-candidates.0.leaseTiers.1.tierKmPerYear',
    );
    if (!second) throw new Error('no second tier field');
    fireEvent.change(second, { target: { value: '15.000' } });
    fireEvent.blur(second);
    expect(screen.getByText('Diese Stufe gibt es schon.')).toBeTruthy();
    expect(
      active(app).candidates[0]?.leaseTiers.map((t) => t.tierKmPerYear),
    ).toEqual([15000, 10000]);
  });

  it('removes a lease offer after the confirmation', async () => {
    const app = await open(`/kandidaten/${EXAMPLE_IDS.candidate}`);
    fireEvent.click(screen.getByRole('button', { name: /^Entfernen: Stufe/ }));
    const dialog = screen.getByRole('dialog', {
      name: /Leasingstufe .* entfernen/,
      hidden: true,
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Entfernen', hidden: true }),
    );
    expect(active(app).candidates[0]?.leaseTiers).toHaveLength(0);
  });

  it('an unknown candidate leads back to the list', async () => {
    const app = await open('/kandidaten/gibt-es-nicht');
    expect(app.router.state.location.pathname).toBe('/kandidaten');
  });
});

describe('S18: candidate form on a phone', () => {
  const phone = () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };

  it('leads through four steps with a back and a next button', async () => {
    phone();
    const app = await open(`/kandidaten/${EXAMPLE_IDS.candidate}`);
    expect(screen.getByText('Schritt 1 von 4')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Preis' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Akku' })).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Zurück' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByText('Schritt 2 von 4')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Akku' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(
      screen.getByRole('heading', { name: 'Fahrzeuggarantie' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByText('Schritt 4 von 4')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Leasingangebote' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(app.router.state.location.pathname).toBe('/kandidaten');
  });
});

describe('S18: error boundary of the area', () => {
  it('a failing candidate area leaves the other areas usable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const [rootRoute] = routes;
    if (!rootRoute) throw new Error('no root route');
    const Broken = () => {
      throw new Error('broken');
    };
    const broken: RouteObject[] = [
      {
        path: rootRoute.path,
        element: rootRoute.element,
        errorElement: rootRoute.errorElement,
        children: rootRoute.children?.map((child) =>
          child.path === 'kandidaten'
            ? {
                path: 'kandidaten',
                handle: child.handle,
                element: (
                  <AreaBoundary area="kandidaten">
                    <Broken />
                  </AreaBoundary>
                ),
              }
            : child,
        ),
      },
    ];
    const app = await renderApp('/kandidaten', { routes: broken });
    expect(screen.getByRole('alert').textContent).toContain('Kandidaten');
    await act(() => app.router.navigate('/parameter'));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Parameter' }),
    ).toBeTruthy();
    vi.restoreAllMocks();
  });
});
