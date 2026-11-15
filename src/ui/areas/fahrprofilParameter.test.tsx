import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PARAMETER_DEFAULTS, type Scenario } from '../../domain';
import { selectActiveScenario } from '../../state';
import { renderApp } from '../__tests__/renderApp';

// S17: Fahrprofil and Parameter (boards D1, M1, D4, M7).

type App = Awaited<ReturnType<typeof renderApp>>;
const active = (app: App): Scenario => {
  const scenario = selectActiveScenario(app.store.getState());
  if (!scenario) throw new Error('no active scenario');
  return scenario;
};

/** Types into a field and leaves it, as a user does. */
function enter(label: string | RegExp, text: string, index = 0) {
  const input = screen.getAllByLabelText(label)[index];
  if (!input) throw new Error(`no field ${String(label)}`);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
  return input;
}

describe('S17: TC15 (UI): entering decimals', () => {
  it('accepts a decimal comma and a decimal point', async () => {
    const app = await renderApp('/fahrprofil');
    enter(/^Verbrauch Stadt/, '12,5');
    expect(active(app).iceVehicle.consumptionLPer100Km.city).toBe(12.5);
    enter(/^Verbrauch Land/, '12.5');
    expect(active(app).iceVehicle.consumptionLPer100Km.rural).toBe(12.5);
  });

  it('shows the message at the field for a negative number', async () => {
    const app = await renderApp('/fahrprofil');
    const input = enter(/^Verbrauch Stadt/, '-3');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(
      (input.getAttribute('aria-describedby') ?? '').split(' ').at(-1) ?? '',
    );
    expect(message?.textContent).toContain('Negativ nicht möglich');
    expect(active(app).iceVehicle.consumptionLPer100Km.city).toBeNull();
  });

  it('shows the message for an empty required field and stores nothing', async () => {
    const app = await renderApp('/fahrprofil');
    enter(/^Wartung und Reifen/, '0,04');
    expect(active(app).iceVehicle.maintenancePerKm).toBe(0.04);
    const input = enter(/^Wartung und Reifen/, '');
    expect(active(app).iceVehicle.maintenancePerKm).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(
      screen.getAllByText(/Ohne diesen Wert wird nicht gerechnet/).length,
    ).toBeGreaterThan(0);
  });

  it('rejects text that is no number', async () => {
    const app = await renderApp('/fahrprofil');
    enter(/^Verbrauch Stadt/, 'abc');
    expect(screen.getByText(/Keine Zahl/)).toBeTruthy();
    expect(active(app).iceVehicle.consumptionLPer100Km.city).toBeNull();
  });

  it('shows the unit at the field and the number keyboard', async () => {
    await renderApp('/fahrprofil');
    const input = screen.getByLabelText(/^Verbrauch Stadt/);
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.closest('div')?.textContent).toContain('l/100 km');
  });
});

describe('S17: Fahrprofil', () => {
  it('shows the route sum and the round trip', async () => {
    await renderApp('/fahrprofil');
    enter(/^Weg Stadt/, '10');
    expect(
      screen.getAllByText(/Einfache Strecke 10 km/).length,
    ).toBeGreaterThan(0);
  });

  it('warns about a route over 300 km without blocking it', async () => {
    const app = await renderApp('/fahrprofil');
    enter(/^Weg Autobahn/, '320');
    expect(screen.getAllByText(/Weg über 300 km/).length).toBeGreaterThan(0);
    expect(active(app).workplaces.a.commute.highway).toBe(320);
  });

  it('toggles a weekday and asks for at least one', async () => {
    const app = await renderApp('/fahrprofil');
    const group = screen.getAllByRole('group', {
      name: 'Besuchte Wochentage',
    })[0];
    if (!group) throw new Error('no weekday group');
    fireEvent.click(within(group).getByRole('button', { name: 'Montag' }));
    expect(active(app).workplaces.a.weekdays).toEqual(['mon']);
    fireEvent.click(within(group).getByRole('button', { name: 'Montag' }));
    expect(active(app).workplaces.a.weekdays).toEqual([]);
    expect(
      screen.getAllByText('Mindestens einen Wochentag wählen.').length,
    ).toBeGreaterThan(0);
  });

  it('keeps the petrol prices in order', async () => {
    await renderApp('/fahrprofil');
    enter(/^Benzinpreis Minimum/, '2,00');
    enter(/^Mittel/, '1,50');
    expect(screen.getByText(/aufsteigend/)).toBeTruthy();
  });

  it('marks a changed default and resets it', async () => {
    const app = await renderApp('/fahrprofil');
    enter(/^Freie Tage pro Jahr/, '10');
    expect(active(app).workplaces.a.freeDaysPerYear).toBe(10);
    expect(screen.getAllByText('● geändert')[0]).toBeTruthy();
    const [reset] = screen.getAllByRole('button', {
      name: /Freie Tage pro Jahr zurücksetzen/,
    });
    if (!reset) throw new Error('no reset button');
    fireEvent.click(reset);
    expect(active(app).workplaces.a.freeDaysPerYear).toBe(30);
  });
});

describe('S17: Parameter', () => {
  const labelOf = (path: string): string => {
    const input = document.getElementById(`f-${path}`);
    return (input as HTMLInputElement | null)?.labels?.[0]?.textContent ?? '';
  };

  it('marks every placeholder of the parameter list as "Annahme"', async () => {
    await renderApp('/parameter');
    const placeholders = PARAMETER_DEFAULTS.filter(
      (e) => e.flag === 'placeholder',
    );
    expect(placeholders.length).toBe(12);
    for (const entry of placeholders) {
      if (entry.path === 'parameters.monthlyTempC') {
        expect(
          screen.getByText('Monatstemperaturen').parentElement?.textContent,
        ).toContain('Annahme');
      } else if (entry.path === 'parameters.warrantyReferenceMonth') {
        expect(
          document.getElementById('s2g')?.parentElement?.textContent,
        ).toContain('Annahme');
      } else if (entry.path.startsWith('workplaces.')) {
        expect(
          document.getElementById('s5')?.parentElement?.textContent,
        ).toContain('Annahme');
      } else {
        expect(labelOf(entry.path), entry.path).toContain('Annahme');
      }
    }
  });

  it('marks every required input and lists the missing ones (Z16)', async () => {
    await renderApp('/parameter');
    for (const entry of PARAMETER_DEFAULTS.filter(
      (e) => e.flag === 'required',
    )) {
      if (entry.path.startsWith('iceVehicle.')) continue; // edited in the Fahrprofil
      expect(labelOf(entry.path), entry.path).toContain('Pflicht');
    }
    expect(
      screen.getByText(/Ohne diese Werte wird nicht gerechnet/),
    ).toBeTruthy();
  });

  it('shows a changed value with its default and resets it', async () => {
    const app = await renderApp('/parameter');
    enter(/^Autobahn-Abschlag/, '8');
    expect(active(app).parameters.highwayDiscountPct).toBe(8);
    expect(screen.getAllByText('● geändert')[0]).toBeTruthy();
    expect(screen.getByText(/Standard 12/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /Autobahn-Abschlag zurücksetzen/ }),
    );
    expect(active(app).parameters.highwayDiscountPct).toBe(12);
  });

  it('shows the warranty reference month as changed only after the user set it', async () => {
    const app = await renderApp('/parameter');
    expect(active(app).parameters.warrantyReferenceMonthSetByUser).toBe(false);
    const group = screen.getByRole('group', {
      name: /Stichtag der Garantieberechnung/,
    });
    fireEvent.change(within(group).getByLabelText('Monat'), {
      target: { value: '3' },
    });
    expect(active(app).parameters.warrantyReferenceMonth.month).toBe(3);
    expect(active(app).parameters.warrantyReferenceMonthSetByUser).toBe(true);
    fireEvent.click(
      screen.getByRole('button', {
        name: /Stichtag der Garantieberechnung zurücksetzen/,
      }),
    );
    expect(active(app).parameters.warrantyReferenceMonth).toEqual({
      month: 11,
      year: 2026,
    });
    expect(active(app).parameters.warrantyReferenceMonthSetByUser).toBe(false);
  });

  it('saves the export reminder interval on the device', async () => {
    const app = await renderApp('/parameter');
    enter('Export-Erinnerung', '7');
    expect(app.store.getState().scenario.settings.exportReminderDays).toBe(7);
  });
});

describe('S17: traffic light colours', () => {
  const pick = (name: string, color: string) =>
    fireEvent.change(screen.getByLabelText(name), { target: { value: color } });

  it('saves a chosen colour on the device', async () => {
    const app = await renderApp('/parameter');
    await act(async () => pick('Farbe Gelb', '#ccaa00'));
    expect(
      app.store.getState().scenario.settings.trafficLightColors?.yellow,
    ).toBe('#ccaa00');
  });

  it('resets to the theme colours', async () => {
    const app = await renderApp('/parameter');
    await act(async () => pick('Farbe Rot', '#ff0000'));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Ampelfarben' })).getByRole(
        'button',
        { name: 'Zurücksetzen' },
      ),
    );
    expect(
      app.store.getState().scenario.settings.trafficLightColors,
    ).toBeNull();
  });
});
