import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../../../tests/fixtures/exampleScenario';
import { computeResults } from '../../../../tests/fixtures/offerResults';
import type { Scenario } from '../../../domain';
import { selectScenarios } from '../../../state';
import { NOW, renderApp } from '../../__tests__/renderApp';

// S22: scenario list, comparison, export and import (boards D7, M10; states Z10 to Z12, Z19).

// jsdom has no modal dialog; the stubs stand in for showModal and close.
beforeEach(() => {
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
  vi.restoreAllMocks();
});

const second = (): Scenario => ({
  ...exampleScenario(),
  id: '00000000-0000-4000-8000-0000000000b1',
  name: 'Teurer Strom',
  parameters: {
    ...exampleScenario().parameters,
    electricityPrice: { min: 0.4, mid: 0.5, max: 0.6 },
  },
});

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const names = (app: {
  store: Parameters<typeof selectScenarios>[0] extends never
    ? never
    : { getState: () => Parameters<typeof selectScenarios>[0] };
}) => selectScenarios(app.store.getState()).map((s) => s.name);

describe('S22: scenario list', () => {
  it('lists the scenarios, marks the active one and activates another', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario(), second()],
    });
    expect(
      screen.getByRole('heading', { level: 3, name: /Standard.*aktiv|aktiv/ }),
    ).toBeTruthy();
    fireEvent.click(button('„Teurer Strom“ aktivieren'));
    expect(app.store.getState().scenario.activeId).toBe(second().id);
  });

  it('renames inline and refuses an empty name and a name that is taken', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario(), second()],
    });
    fireEvent.click(button('„Teurer Strom“ umbenennen'));
    const field = screen.getByRole('textbox', { name: /Name/ });
    fireEvent.change(field, {
      target: { value: exampleScenario().name.toUpperCase() },
    });
    fireEvent.click(button('Speichern'));
    expect(
      screen.getByText('Ein Szenario mit diesem Namen gibt es schon.'),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), {
      target: { value: ' ' },
    });
    fireEvent.click(button('Speichern'));
    expect(screen.getByText('Der Name darf nicht leer sein.')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), {
      target: { value: 'Neuer Name' },
    });
    fireEvent.click(button('Speichern'));
    expect(names(app)).toContain('Neuer Name');
    expect(screen.queryByRole('textbox', { name: /Name/ })).toBeNull();
  });

  it('duplicates, and creates an empty one and a copy of the active one', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
    });
    const base = exampleScenario().name;
    fireEvent.click(button(`„${base}“ duplizieren`));
    expect(names(app)).toEqual([base, `${base} (Kopie)`]);
    fireEvent.click(button('Leer'));
    expect(names(app).at(-1)).toBe('Neues Szenario');
    const created = selectScenarios(app.store.getState()).at(-1);
    expect(created?.candidates).toEqual([]);
    expect(app.store.getState().scenario.activeId).toBe(created?.id);
    fireEvent.click(button('Kopie des aktiven Szenarios'));
    expect(names(app).at(-1)).toBe('Neues Szenario (2)');
  });

  it('Z19: delete asks first; cancel keeps it, confirm removes it from the database and the list', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario(), second()],
    });
    fireEvent.click(button('„Teurer Strom“ löschen'));
    const dialog = screen.getByRole('dialog', {
      name: /löschen\?/,
      hidden: true,
    });
    expect(within(dialog).getByText(/„Teurer Strom“ löschen\?/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Abbrechen', hidden: true }),
    );
    expect(app.repository.delete).not.toHaveBeenCalled();
    fireEvent.click(button('„Teurer Strom“ löschen'));
    await act(async () => {
      fireEvent.click(
        within(
          screen.getByRole('dialog', { name: /löschen\?/, hidden: true }),
        ).getByRole('button', { name: 'Löschen', hidden: true }),
      );
    });
    expect(app.repository.delete).toHaveBeenCalledWith(second().id);
    expect(names(app)).toEqual([exampleScenario().name]);
  });

  it('a delete the storage refuses shows a message and keeps the scenario', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario(), second()],
    });
    vi.mocked(app.repository.delete).mockResolvedValue({ status: 'readOnly' });
    fireEvent.click(button('„Teurer Strom“ löschen'));
    await act(async () => {
      fireEvent.click(
        within(
          screen.getByRole('dialog', { name: /löschen\?/, hidden: true }),
        ).getByRole('button', { name: 'Löschen', hidden: true }),
      );
    });
    expect(await screen.findByText('Löschen nicht möglich')).toBeTruthy();
    expect(names(app)).toContain('Teurer Strom');
  });
});

describe('S22: review fixes', () => {
  it('a refused delete keeps the scenario in the comparison', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario(), second()],
    });
    vi.mocked(app.repository.delete).mockResolvedValue({ status: 'readOnly' });
    const box = screen.getByRole('checkbox', {
      name: /Teurer Strom im Vergleich/,
    }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    fireEvent.click(button('„Teurer Strom“ löschen'));
    await act(async () => {
      fireEvent.click(
        within(
          screen.getByRole('dialog', { name: /löschen\?/, hidden: true }),
        ).getByRole('button', { name: 'Löschen', hidden: true }),
      );
    });
    expect(await screen.findByText('Löschen nicht möglich')).toBeTruthy();
    expect(
      (
        screen.getByRole('checkbox', {
          name: /Teurer Strom im Vergleich/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it('a full storage on delete shows no "read only" text of its own', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario(), second()],
    });
    vi.mocked(app.repository.delete).mockResolvedValue({
      status: 'quotaExceeded',
    });
    fireEvent.click(button('„Teurer Strom“ löschen'));
    await act(async () => {
      fireEvent.click(
        within(
          screen.getByRole('dialog', { name: /löschen\?/, hidden: true }),
        ).getByRole('button', { name: 'Löschen', hidden: true }),
      );
    });
    expect(screen.queryByText('Löschen nicht möglich')).toBeNull();
    expect(screen.getByText('Speicher voll', { exact: false })).toBeTruthy();
  });

  it('the rename field takes the focus, and the rename button gets it back', async () => {
    await renderApp('/szenarien', { scenarios: [exampleScenario(), second()] });
    fireEvent.click(button('„Teurer Strom“ umbenennen'));
    const field = screen.getByRole('textbox', { name: /Name/ });
    expect(document.activeElement).toBe(field);
    fireEvent.click(button('Abbrechen'));
    expect(document.activeElement).toBe(button('„Teurer Strom“ umbenennen'));
  });

  it('an import that throws says so instead of staying silent', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
    });
    vi.mocked(app.repository.writeImport).mockRejectedValue(new Error('idb'));
    const file = {
      format: 'eauto-export',
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      scenarios: [exampleScenario()],
    };
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Datei auswählen'), {
        target: { files: [new File([JSON.stringify(file)], 'x.json')] },
      });
    });
    expect(
      await screen.findByText('Das Einlesen ist fehlgeschlagen'),
    ).toBeTruthy();
  });

  it('a replace import under the same ids computes the comparison again', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario(), second()],
    });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: new RegExp(`^${exampleScenario().name} im Vergleich$`),
      }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Teurer Strom im Vergleich/ }),
    );
    await vi.waitFor(() => expect(app.worker.compares).toHaveLength(1));
    await act(async () => app.worker.finishCompare({}));
    await vi.waitFor(() => expect(app.worker.compares).toHaveLength(2));
    await act(async () => app.worker.finishCompare({}));
    const before = app.worker.compares.length;
    // The stores are loaded again with the same ids but new contents (an import).
    vi.mocked(app.repository.loadAll).mockResolvedValue({
      scenarios: [exampleScenario(), { ...second(), name: 'Teurer Strom' }],
      readOnly: [],
      invalid: [],
    });
    const file = {
      format: 'eauto-export',
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      scenarios: [exampleScenario(), second()],
    };
    fireEvent.click(
      screen.getByRole('radio', {
        name: 'Alle vorhandenen Szenarien ersetzen',
      }),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Datei auswählen'), {
        target: { files: [new File([JSON.stringify(file)], 'x.json')] },
      });
    });
    await act(async () => {
      fireEvent.click(
        within(
          screen.getByRole('dialog', {
            name: 'Alle Szenarien ersetzen?',
            hidden: true,
          }),
        ).getByRole('button', { name: 'Ersetzen', hidden: true }),
      );
    });
    await vi.waitFor(() =>
      expect(app.worker.compares.length).toBeGreaterThan(before),
    );
  });
});

describe('S22: comparison', () => {
  it('asks for two scenarios, then computes and shows the table with the difference', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario(), second()],
    });
    await act(async () => app.worker.finish(computeResults(exampleScenario())));
    expect(
      screen.getByText(
        'Wähle mindestens zwei Szenarien, um sie zu vergleichen.',
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: new RegExp(`^${exampleScenario().name} im Vergleich$`),
      }),
    );
    expect(
      screen.getByText(
        'Wähle mindestens zwei Szenarien, um sie zu vergleichen.',
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Teurer Strom im Vergleich/ }),
    );
    await vi.waitFor(() => expect(app.worker.compares).toHaveLength(1));
    expect(screen.getByText('Der Vergleich wird berechnet …')).toBeTruthy();
    await act(async () =>
      app.worker.finishCompare(computeResults(exampleScenario())),
    );
    await vi.waitFor(() => expect(app.worker.compares).toHaveLength(2));
    await act(async () => app.worker.finishCompare(computeResults(second())));
    const table = await screen.findByRole('table', {
      name: /Gesamtkosten der Flotte je Kandidat/,
      hidden: true,
    });
    expect(
      within(table).getByRole('columnheader', {
        name: /Gesamtkosten, Teurer Strom/,
        hidden: true,
      }),
    ).toBeTruthy();
    expect(
      within(table).getByRole('columnheader', {
        name: 'Unterschied',
        hidden: true,
      }),
    ).toBeTruthy();
    const purchase = within(table).getByRole('row', {
      name: /Kauf/,
      hidden: true,
    });
    // Both scenarios have the offer, so there is a difference in euros.
    expect(purchase.textContent).toMatch(/€/);
    expect(purchase.textContent).not.toContain('nicht berechnet');
  });

  it('a failed comparison says so', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario(), second()],
    });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: new RegExp(`^${exampleScenario().name} im Vergleich$`),
      }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Teurer Strom im Vergleich/ }),
    );
    await vi.waitFor(() => expect(app.worker.compares).toHaveLength(1));
    await act(async () => {
      app.worker.compares[0]?.reject(new Error('x'));
    });
    expect(
      await screen.findByText('Der Vergleich ist nicht möglich'),
    ).toBeTruthy();
  });
});

function jsonFile(content: unknown, name = 'x.json') {
  return new File(
    [typeof content === 'string' ? content : JSON.stringify(content)],
    name,
    {
      type: 'application/json',
    },
  );
}

describe('S22: export and import', () => {
  it('exports everything and one scenario, names the file and the records it skipped', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
    });
    vi.mocked(app.repository.exportFile).mockResolvedValue({
      fileName: 'eauto-export-2026-11-14-v1.json',
      content: '{}',
      skipped: ['abc'],
    });
    await act(async () => {
      fireEvent.click(button('Alle Szenarien exportieren'));
    });
    expect(app.repository.exportFile).toHaveBeenCalledWith(undefined);
    expect(click).toHaveBeenCalled();
    expect(
      await screen.findByText('Datei: eauto-export-2026-11-14-v1.json'),
    ).toBeTruthy();
    expect(
      screen.getByText(/1 Szenario konnte nicht gelesen werden/),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(button(/Nur „.*“ exportieren/));
    });
    expect(app.repository.exportFile).toHaveBeenLastCalledWith([
      exampleScenario().id,
    ]);
    click.mockRestore();
  });

  it('Z11: a broken file names where the problem is and says nothing was overwritten', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
    });
    const input = screen.getByLabelText('Datei auswählen');
    await act(async () => {
      fireEvent.change(input, { target: { files: [jsonFile('{ not json')] } });
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Import nicht möglich');
    expect(alert.textContent).toContain(
      'Die Datei: Die Datei ist kein gültiges JSON',
    );
    expect(alert.textContent).toContain('Es wurde nichts überschrieben.');
    expect(app.repository.writeImport).not.toHaveBeenCalled();
  });

  it('Z11: an error inside a scenario points to its field in German', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
    });
    const broken = JSON.parse(JSON.stringify(exampleScenario()));
    broken.candidates[0].purchasePrice = -5;
    const file = {
      format: 'eauto-export',
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      scenarios: [broken],
    };
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Datei auswählen'), {
        target: { files: [jsonFile(file)] },
      });
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Szenario 1 der Datei');
    expect(alert.textContent).not.toContain('scenarios[0]');
    expect(app.repository.writeImport).not.toHaveBeenCalled();
  });

  it('Z12: "ersetzen" warns and asks before it imports', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
    });
    fireEvent.click(
      screen.getByRole('radio', {
        name: 'Alle vorhandenen Szenarien ersetzen',
      }),
    );
    expect(
      screen.getAllByText('Alle Szenarien ersetzen?').length,
    ).toBeGreaterThan(0);
    const file = {
      format: 'eauto-export',
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      scenarios: [exampleScenario()],
    };
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Datei auswählen'), {
        target: { files: [jsonFile(file)] },
      });
    });
    expect(app.repository.writeImport).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', {
      name: 'Alle Szenarien ersetzen?',
      hidden: true,
    });
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Ersetzen', hidden: true }),
      );
    });
    expect(app.repository.writeImport).toHaveBeenCalledWith(
      expect.any(Array),
      'replace',
    );
    expect(await screen.findByText('Die Datei wurde eingelesen.')).toBeTruthy();
  });

  it('"hinzufügen" imports at once, without a question', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
    });
    const file = {
      format: 'eauto-export',
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      scenarios: [exampleScenario()],
    };
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Datei auswählen'), {
        target: { files: [jsonFile(file)] },
      });
    });
    expect(app.repository.writeImport).toHaveBeenCalledWith(
      expect.any(Array),
      'add',
    );
  });

  it('an import the storage refuses says so', async () => {
    const app = await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
    });
    vi.mocked(app.repository.writeImport).mockResolvedValue({
      status: 'readOnly',
    });
    const file = {
      format: 'eauto-export',
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      scenarios: [exampleScenario()],
    };
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Datei auswählen'), {
        target: { files: [jsonFile(file)] },
      });
    });
    expect(
      await screen.findByText(
        'Der Speicher ist nur lesbar oder gerade geschlossen. Es wurde nichts verändert.',
      ),
    ).toBeTruthy();
  });
});

describe('S22: export reminder (Z10)', () => {
  const old = new Date(NOW.getTime() - 45 * 86_400_000).toISOString();

  it('shows in the frame on every other page, with a way to the export, and can be closed', async () => {
    const app = await renderApp('/ergebnis', {
      scenarios: [exampleScenario()],
      settings: { lastExportAt: old },
    });
    expect(screen.getByText('Letzter Export vor 45 Tagen')).toBeTruthy();
    fireEvent.click(button('Jetzt exportieren'));
    expect(app.router.state.location.pathname).toBe('/szenarien');
    // On the page itself the reminder is shown once, not twice.
    expect(screen.getAllByText('Letzter Export vor 45 Tagen')).toHaveLength(1);
    fireEvent.click(button('Später'));
    expect(screen.queryByText('Letzter Export vor 45 Tagen')).toBeNull();
  });

  it('a first start without any export reminds as well', async () => {
    await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
      settings: { lastExportAt: null },
    });
    expect(screen.getAllByText('Noch nie exportiert').length).toBeGreaterThan(
      0,
    );
  });

  it('is gone after an export', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await renderApp('/szenarien', {
      scenarios: [exampleScenario()],
      settings: { lastExportAt: old },
    });
    expect(screen.getByText('Letzter Export vor 45 Tagen')).toBeTruthy();
    await act(async () => {
      fireEvent.click(button('Alle Szenarien exportieren'));
    });
    expect(screen.queryByText('Letzter Export vor 45 Tagen')).toBeNull();
  });
});
