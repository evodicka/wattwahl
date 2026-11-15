import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open, seedScenario } from './helpers';

// S21: price slider (boards D5, M8, T2, T4) and Rechenweg (boards D6, M9).

const table = (page: Page) =>
  page.getByRole('table', { name: /aufsteigend nach Kosten/ });
const cost = (page: Page) =>
  table(page)
    .getByRole('row', { name: /Modell A Kauf/ })
    .getByRole('cell')
    .nth(3)
    .locator('b');

async function openDetail(page: Page) {
  await open(page, '/ergebnis');
  await page
    .getByRole('link', { name: /^(Details ansehen: )?Modell A/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Modell A ·/ }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: /^Heatmap/ })).toBeVisible();
}

test.describe('S21: price slider', () => {
  test('changes the costs at once, is not saved, and a reload brings the mid prices back', async ({
    page,
  }) => {
    await seedScenario(page);
    await open(page, '/ergebnis');
    await expect(table(page)).toBeVisible();
    const before = await cost(page).innerText();
    await expect(
      page.getByText('Regler entsprechen dem Mittel, nichts geändert.'),
    ).toBeVisible();

    await page.getByLabel('Benzinpreis').fill('3');
    await expect(page.getByText('● geändert, nicht gespeichert')).toBeVisible();
    await expect(page.getByTestId('status-line')).toContainText(
      'Preisfall Regler',
    );
    await expect(page.getByText(/Gesamtkosten \(Regler\)/)).toBeVisible();
    await expect(cost(page)).not.toHaveText(before);

    await page.waitForTimeout(800);
    await page.reload();
    await expect(
      page.getByText('Regler entsprechen dem Mittel, nichts geändert.'),
    ).toBeVisible();
    await expect(page.getByTestId('status-line')).toContainText(
      'Preisfall Mittel',
    );
    await expect(cost(page)).toHaveText(before);
  });

  test('"Als Szenario speichern" makes a scenario with these prices and uses it', async ({
    page,
  }) => {
    await seedScenario(page);
    await open(page, '/ergebnis');
    await page.getByLabel('Benzinpreis').fill('2.5');
    await page.getByRole('button', { name: 'Als Szenario speichern' }).click();
    await expect(page.getByRole('complementary')).toContainText(
      'Standard · Preis-Regler',
    );
    await expect(
      page.getByText('Regler entsprechen dem Mittel, nichts geändert.'),
    ).toBeVisible();
    // The new scenario holds the price as its mid price.
    await expect(page.getByLabel('Benzinpreis')).toHaveAttribute(
      'aria-valuetext',
      '2,50 €/l',
    );
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByRole('complementary')).toContainText(
      'Standard · Preis-Regler',
    );
    await expect(page.getByLabel('Benzinpreis')).toHaveAttribute(
      'aria-valuetext',
      '2,50 €/l',
    );
  });

  test('sliding back to the original value is no change and cannot be saved', async ({
    page,
  }) => {
    await seedScenario(page);
    await open(page, '/ergebnis');
    await page.getByLabel('Benzinpreis').fill('2.5');
    await expect(
      page.getByRole('button', { name: 'Als Szenario speichern' }),
    ).toBeEnabled();
    await page.getByLabel('Benzinpreis').fill('1.9');
    await expect(
      page.getByText('Regler entsprechen dem Mittel, nichts geändert.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Als Szenario speichern' }),
    ).toBeDisabled();
    await expect(page.getByTestId('status-line')).toContainText(
      'Preisfall Mittel',
    );
  });

  test('"Zurücksetzen" goes back to the mid prices', async ({ page }) => {
    await seedScenario(page);
    await open(page, '/ergebnis');
    await page.getByLabel('Heimstrompreis').fill('0.45');
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(page.getByLabel('Heimstrompreis')).toHaveAttribute(
      'aria-valuetext',
      '0,30 €/kWh',
    );
    await expect(page.getByTestId('status-line')).toContainText(
      'Preisfall Mittel',
    );
  });

  test('stays inside the page at 390 px and 820 px, and the sliders reach the keyboard', async ({
    page,
    browserName,
  }) => {
    await seedScenario(page);
    // One page load: a second goto to the same address may reload the page, and
    // the scenario is written a moment after the last input.
    await open(page, '/ergebnis');
    for (const width of [820, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByLabel('Benzinpreis')).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${width} px`).toBeLessThanOrEqual(0);
    }
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.getByLabel('Benzinpreis').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('● geändert, nicht gespeichert')).toBeVisible();
    await page.keyboard.press(tab);
    await expect(page.getByLabel('Heimstrompreis')).toBeFocused();
  });
});

test.describe('S21: Rechenweg', () => {
  test('is computed when opened and shows the steps behind the numbers with their formulas', async ({
    page,
  }) => {
    await seedScenario(page);
    await openDetail(page);
    const summary = page.getByText('Rechenweg anzeigen');
    await expect(page.getByText('Zahlen dieses Angebots')).toBeHidden();
    await summary.click();
    await expect(page.getByText('Zahlen dieses Angebots')).toBeVisible();
    // The numbers come first; the same step is also in its formula family below.
    const purchase = page
      .locator('li[data-result-path="costs.acquisition"]')
      .first();
    await expect(purchase).toContainText('Formel F8.purchase');
    await expect(purchase).toContainText('P − P · (1 − w)^(D / 12)');
    await expect(purchase).toContainText('purchasePrice = 40.000');
    await expect(page.locator('li[data-formula="F3.u"]').first()).toContainText(
      'Annahme',
    );
    await page.locator('summary', { hasText: 'Akkualterung' }).click();
    await expect(
      page.locator('li[data-formula="F2.soh"]').first(),
    ).toBeVisible();
    // Closed again: nothing stays in the page.
    await summary.click();
    await expect(page.getByText('Zahlen dieses Angebots')).toBeHidden();
  });

  test('at 390 px an open Rechenweg does not move the page', async ({
    page,
  }) => {
    await seedScenario(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await openDetail(page);
    await page.getByText('Rechenweg anzeigen').click();
    await page.getByText('Alle Rechenschritte').scrollIntoViewIfNeeded();
    await page
      .locator('summary', { hasText: 'Reichweite bei Monatstemperatur' })
      .click();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('no axe violations with the Rechenweg open', async ({
    page,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox crashes in the accessibility analysis of pages with lazy chunks on CI (cause unknown, architecture 11.2).',
    );
    await seedScenario(page);
    await openDetail(page);
    await page.getByText('Rechenweg anzeigen').click();
    await expect(page.getByText('Zahlen dieses Angebots')).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.map((v) => `trace: ${v.id} ${v.help}`)).toEqual(
      [],
    );
  });
});

// Screenshots for the comparison with D5, D6, M8, M9, T2 and T4 (chromium
// only, screenshots/s21/, ignored by git).
test.describe('S21: screenshots', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Screenshots come from one engine.',
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 820, 390]) {
      test(`slider and Rechenweg at ${width} px, ${colorScheme}`, async ({
        page,
      }) => {
        await seedScenario(page);
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await open(page, '/ergebnis');
        await page.getByLabel('Benzinpreis').fill('2.4');
        await expect(page.getByTestId('status-line')).not.toContainText(
          'wird aktualisiert',
        );
        await page.screenshot({
          path: `screenshots/s21/slider-${width}-${colorScheme}.png`,
          fullPage: true,
        });
        await page.getByRole('button', { name: 'Zurücksetzen' }).click();
        await openDetail(page);
        await page.getByText('Rechenweg anzeigen').click();
        await expect(page.getByText('Zahlen dieses Angebots')).toBeVisible();
        await page.screenshot({
          path: `screenshots/s21/rechenweg-${width}-${colorScheme}.png`,
          fullPage: true,
        });
      });
    }
  }
});
