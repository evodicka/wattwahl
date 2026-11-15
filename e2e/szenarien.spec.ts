import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { open, seedScenario } from './helpers';

// S22: scenarios, comparison, export and import (boards D7, M10; states Z10 to Z12, Z19).

/** Waits until the autosave has written the candidate: reads the stored records. */
async function waitSaved(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('eauto');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const all = db
                .transaction('scenarios')
                .objectStore('scenarios')
                .getAll();
              all.onsuccess = () => {
                db.close();
                resolve(
                  all.result.reduce(
                    (n: number, r: { data: { candidates: unknown[] } }) =>
                      n + r.data.candidates.length,
                    0,
                  ),
                );
              };
              all.onerror = () => reject(all.error);
            };
          }),
      ),
    )
    .toBeGreaterThan(0);
}

/** Waits until the database holds this many scenarios (the autosave is debounced). */
async function waitRecords(page: Page, count: number) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('eauto');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const total = db
                .transaction('scenarios')
                .objectStore('scenarios')
                .count();
              total.onsuccess = () => {
                db.close();
                resolve(total.result);
              };
              total.onerror = () => reject(total.error);
            };
          }),
      ),
    )
    .toBe(count);
}

async function exportAll(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Alle Szenarien exportieren' })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^eauto-export-\d{4}-\d{2}-\d{2}-v\d+\.json$/,
  );
  const path = await file.path();
  return readFile(path, 'utf8');
}

const withoutTime = (content: string) => {
  const parsed = JSON.parse(content);
  delete parsed.exportedAt;
  return parsed;
};

const cards = (page: Page) =>
  page.getByRole('heading', { level: 3 }).filter({ hasNotText: /^$/ });

test.describe('S22: export and import', () => {
  test('TC14: an export read into an empty browser brings every scenario back unchanged', async ({
    page,
    browser,
  }) => {
    await seedScenario(page);
    await waitSaved(page);
    await open(page, '/szenarien');
    await page
      .getByRole('button', { name: /Kopie des aktiven Szenarios/ })
      .click();
    await expect(cards(page)).toHaveCount(2);
    await page.getByRole('button', { name: /^„.*“ aktivieren$/ }).click();
    const before = await exportAll(page);
    expect(withoutTime(before).scenarios).toHaveLength(2);

    // An empty browser: a new context has no storage at all.
    const fresh = await browser.newContext({ acceptDownloads: true });
    const other = await fresh.newPage();
    await open(other, '/szenarien');
    await other
      .getByRole('radio', { name: 'Alle vorhandenen Szenarien ersetzen' })
      .check();
    await other.getByLabel('Datei auswählen').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(before),
    });
    await other.getByRole('button', { name: 'Ersetzen', exact: true }).click();
    await expect(other.getByText('Die Datei wurde eingelesen.')).toBeVisible();
    await expect(cards(other)).toHaveCount(2);

    // And the same again after a reload: it was written to the database.
    await other.reload();
    await expect(cards(other)).toHaveCount(2);
    const after = await exportAll(other);
    expect(withoutTime(after)).toEqual(withoutTime(before));
    await fresh.close();
  });

  test('Q7: a broken file says where it is wrong and changes nothing', async ({
    page,
  }) => {
    await seedScenario(page);
    await waitSaved(page);
    await open(page, '/szenarien');
    const before = await cards(page).allInnerTexts();
    const file = (content: string) => ({
      name: 'x.json',
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    });
    const input = page.getByLabel('Datei auswählen');

    await input.setInputFiles(file('{ not json'));
    await expect(page.getByRole('alert')).toContainText(
      'Die Datei ist kein gültiges JSON',
    );
    await expect(page.getByRole('alert')).toContainText(
      'Es wurde nichts überschrieben.',
    );

    await input.setInputFiles(
      file(
        JSON.stringify({
          format: 'eauto-export',
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          scenarios: [{ bogus: true }],
        }),
      ),
    );
    await expect(page.getByRole('alert')).toContainText('Szenario 1 der Datei');
    await expect(cards(page)).toHaveText(before);
    await page.reload();
    await expect(cards(page)).toHaveText(before);
  });

  test('Z10: the reminder appears for a first export and for an old one, and goes after an export', async ({
    page,
  }) => {
    await seedScenario(page);
    await waitSaved(page);
    await page.reload();
    await expect(page.getByText('Noch nie exportiert')).toBeVisible();
    await page
      .getByRole('status')
      .getByRole('button', { name: 'Jetzt exportieren' })
      .click();
    await expect(page).toHaveURL(/#\/szenarien$/);
    await exportAll(page);
    await expect(page.getByText('Noch nie exportiert')).toHaveCount(0);

    // 15 days later the reminder is due again (interval: 14 days).
    await page.clock.install({
      time: new Date(Date.now() + 15 * 86_400_000),
    });
    await page.reload();
    await expect(page.getByText('Letzter Export vor 15 Tagen')).toBeVisible();
    await page.getByRole('button', { name: 'Später' }).click();
    await expect(page.getByText('Letzter Export vor 15 Tagen')).toHaveCount(0);
  });
});

test.describe('S22: scenario list', () => {
  test('creates, duplicates, renames and deletes; a name that is taken is refused', async ({
    page,
  }) => {
    await seedScenario(page);
    await waitSaved(page);
    await open(page, '/szenarien');
    await page.getByRole('button', { name: 'Leer', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 3, name: /Neues Szenario/ }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '„Neues Szenario“ duplizieren' })
      .click();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Neues Szenario (Kopie)' }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: '„Neues Szenario (Kopie)“ umbenennen' })
      .click();
    await page.getByRole('textbox', { name: /Name/ }).fill('neues szenario');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(
      page.getByText('Ein Szenario mit diesem Namen gibt es schon.'),
    ).toBeVisible();
    await page.getByRole('textbox', { name: /Name/ }).fill('Zweiter Versuch');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Zweiter Versuch' }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: '„Zweiter Versuch“ löschen' })
      .click();
    await expect(
      page.getByRole('dialog', { name: /„Zweiter Versuch“ löschen\?/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Zweiter Versuch' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '„Zweiter Versuch“ löschen' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Löschen', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Zweiter Versuch' }),
    ).toHaveCount(0);

    // Gone for good: also after a reload, once the rest is saved.
    await waitRecords(page, 2);
    await page.reload();
    await expect(cards(page)).toHaveCount(2);
    await expect(
      page.getByRole('heading', { level: 3, name: 'Zweiter Versuch' }),
    ).toHaveCount(0);
  });

  test('deleting every scenario leaves an empty one', async ({ page }) => {
    await open(page, '/szenarien');
    await page.getByRole('button', { name: /^„Standard“ löschen$/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Löschen', exact: true })
      .click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page)).toContainText('Standard');
  });
});

test.describe('S22: scenario comparison', () => {
  test('compares a scenario with a copy that has other prices', async ({
    page,
  }) => {
    await seedScenario(page);
    await waitSaved(page);
    await open(page, '/szenarien');
    await page
      .getByRole('button', { name: /Kopie des aktiven Szenarios/ })
      .click();
    await expect(cards(page)).toHaveCount(2);
    // The copy is active: raise its electricity price.
    await open(page, '/parameter');
    const price = page.locator('[id="f-parameters.electricityPrice.mid"]');
    await price.fill('0,34');
    await price.blur();
    await open(page, '/szenarien');
    await expect(
      page.getByText('Wähle mindestens zwei Szenarien, um sie zu vergleichen.'),
    ).toBeVisible();
    for (const box of await page.getByRole('checkbox').all()) await box.check();
    await expect(page.getByText('Der Vergleich wird berechnet …')).toBeHidden({
      timeout: 15_000,
    });
    await page.getByText('Dieselben Werte als Tabelle').click();
    const table = page.getByRole('table', { name: /Gesamtkosten der Flotte/ });
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveCount(4);
    const purchase = table.getByRole('row', { name: /Modell A · Kauf/ });
    await expect(purchase).toContainText('€');
    await expect(purchase).not.toContainText('nicht berechnet');
    await expect(
      page.getByRole('img', { name: /Gestapelte Balken/ }),
    ).toBeVisible();
  });
});

test.describe('S22: accessibility (Q10) and layout', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`no axe violations at ${width} px, ${colorScheme}`, async ({
        page,
        browserName,
      }) => {
        test.fixme(
          browserName === 'firefox',
          'Firefox crashes in the accessibility analysis of pages with lazy chunks on CI (cause unknown, architecture 11.2).',
        );
        await seedScenario(page);
        await waitSaved(page);
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await open(page, '/szenarien');
        await page
          .getByRole('button', { name: /Kopie des aktiven Szenarios/ })
          .click();
        for (const box of await page.getByRole('checkbox').all())
          await box.check();
        await expect(
          page.getByRole('img', { name: /Gestapelte Balken/ }),
        ).toBeVisible();
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `szenarien: ${v.id} ${v.help}`),
        ).toEqual([]);
      });
    }
  }

  test('the page stays inside the screen at 390 px and the controls reach the keyboard', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page, '/szenarien');
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.getByRole('button', { name: 'Leer', exact: true }).focus();
    await page.keyboard.press(tab);
    await expect(
      page.getByRole('button', { name: /Kopie des aktiven Szenarios/ }),
    ).toBeFocused();
  });
});

// Screenshots for the comparison with D7 and M10 (chromium only, screenshots/s22/, ignored by git).
test.describe('S22: screenshots', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Screenshots come from one engine.',
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`scenarios at ${width} px, ${colorScheme}`, async ({ page }) => {
        await seedScenario(page);
        await waitSaved(page);
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await open(page, '/szenarien');
        await page
          .getByRole('button', { name: /Kopie des aktiven Szenarios/ })
          .click();
        for (const box of await page.getByRole('checkbox').all())
          await box.check();
        await expect(
          page.getByRole('img', { name: /Gestapelte Balken/ }),
        ).toBeVisible();
        await page.screenshot({
          path: `screenshots/s22/szenarien-${width}-${colorScheme}.png`,
          fullPage: true,
        });
      });
    }
  }
});
