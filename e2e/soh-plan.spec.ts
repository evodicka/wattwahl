import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open } from './helpers';

// C3b: the SoH plan "mit Wechsel" in the app, with the export of the published
// app (docs/acceptance), which has used cars that tip during the comparison.

const EXPORT = readFileSync(
  'docs/acceptance/eauto-export-2026-11-16-v2_3.json',
);

async function importExport(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/szenarien');
  await page
    .getByRole('radio', { name: 'Alle vorhandenen Szenarien ersetzen' })
    .check();
  await page.getByLabel('Datei auswählen').setInputFiles({
    name: 'export.json',
    mimeType: 'application/json',
    buffer: EXPORT,
  });
  await page.getByRole('button', { name: 'Ersetzen', exact: true }).click();
  await expect(page.getByText('Die Datei wurde eingelesen.')).toBeVisible();
}

/** Kilometerreserve 10 km and SoH plan "mit Wechsel", set through the form. */
async function chooseSwitchPlan(page: Page) {
  await open(page, '/parameter');
  const reserve = page.locator('[id="f-parameters.minReserveKm"]');
  await reserve.fill('10');
  await reserve.blur();
  await page.getByLabel('SoH-Plan').selectOption({ label: 'mit Wechsel' });
}

async function openCorsa(page: Page) {
  await open(page, '/ergebnis');
  await page
    .getByRole('link', { name: /^(Details ansehen: )?Opel Corsa 2023/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Opel Corsa 2023 ·/ }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: /^Heatmap/ })).toBeVisible();
  await expect(
    page.getByRole('region', { name: /^Zuordnungsplan, seitlich/ }),
  ).toBeVisible();
}

test.describe('C3b: SoH plan', () => {
  test('the choice survives a reload and disables the SoH reference with the reason', async ({
    page,
  }) => {
    await open(page, '/parameter');
    const reference = page.getByLabel('SoH-Bezug der Eignungsprüfung');
    await expect(reference).toBeEnabled();
    await page.getByLabel('SoH-Plan').selectOption({ label: 'mit Wechsel' });
    await expect(reference).toBeDisabled();
    await expect(
      page.getByText(/prüft die App die Eignung zum jeweiligen Zeitpunkt/),
    ).toBeVisible();
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByLabel('SoH-Plan')).toHaveValue('switch');
    await expect(
      page.getByLabel('SoH-Bezug der Eignungsprüfung'),
    ).toBeDisabled();
  });

  test('marks the offers that switch and shows the plan state, the month and the cell text', async ({
    page,
  }) => {
    await importExport(page);
    await chooseSwitchPlan(page);
    await open(page, '/ergebnis');
    const table = page.getByRole('table', { name: /aufsteigend nach Kosten/ });
    await expect(
      table
        .getByRole('row', { name: /Opel Corsa 2023/ })
        .getByText('mit Wechsel'),
    ).toBeVisible();
    await expect(
      table
        .getByRole('row', { name: /MG4 Urban/ })
        .first()
        .getByText('mit Wechsel'),
    ).toHaveCount(0);

    await openCorsa(page);
    const slider = page.getByRole('slider', { name: 'Zeitpunkt' });
    await expect(slider).toHaveValue('0');
    await expect(page.getByTestId('plan-state')).toContainText(
      'Zeitpunkt Start',
    );
    await expect(
      page.getByText(/Januar: E-Auto bis Monat 30, danach Verbrenner/),
    ).toBeVisible();
    await slider.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('plan-state')).toContainText(
      'Zeitpunkt Ende',
    );
    await expect(page.getByTestId('plan-state')).not.toContainText(
      ' 0 Einträge ruhen',
    );
    await expect(page.getByTestId('switch-comparison')).toContainText(
      'günstiger als der feste Plan',
    );
    const plan = page.getByRole('region', {
      name: /^Zuordnungsplan, seitlich/,
    });
    await expect(
      plan.getByText('E→A bis M30, dann E ruht').first(),
    ).toBeVisible();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`no axe violations in the detail view with switch points at ${width} px, ${colorScheme}`, async ({
        page,
      }) => {
        await importExport(page);
        await chooseSwitchPlan(page);
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await openCorsa(page);
        await expect(page.getByTestId('plan-state')).toBeVisible();
        await expect(
          page.getByText('E→A bis M30, dann E ruht').first(),
        ).toBeVisible();
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `switch plan: ${v.id} ${v.help}`),
        ).toEqual([]);
      });
    }
  }

  test('no axe violations on the parameter page with the SoH reference disabled', async ({
    page,
    browserName,
  }) => {
    // Known defect (architecture 11.2): in Firefox the analysis of the
    // parameter page ends with "Page crashed" as soon as any select was
    // changed, also on the main branch before the SoH plan. Chromium and
    // WebKit run it.
    test.fixme(
      browserName === 'firefox',
      'Firefox crashes in the accessibility analysis after a select was changed (cause unknown).',
    );
    await open(page, '/parameter');
    await page.getByLabel('SoH-Plan').selectOption({ label: 'mit Wechsel' });
    await expect(
      page.getByLabel('SoH-Bezug der Eignungsprüfung'),
    ).toBeDisabled();
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.map((v) => `parameter: ${v.id} ${v.help}`),
    ).toEqual([]);
  });
});
