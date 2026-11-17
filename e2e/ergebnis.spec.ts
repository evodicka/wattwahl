import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open, seedScenario } from './helpers';

// S19: result table, price case and offer cards (boards D5, M8, T2, T4).

const table = (page: Page) => page.getByRole('table');

test.describe('S19: result table', () => {
  test('shows the entered candidate with its offers and a price case that changes the costs', async ({
    page,
  }) => {
    await seedScenario(page);
    await open(page, '/ergebnis');
    await expect(table(page)).toBeVisible();
    await expect(table(page).getByRole('row')).toHaveCount(3);
    await expect(page.getByTestId('status-line')).toContainText(
      'Preisfall Mittel',
    );
    const purchase = table(page).getByRole('row', { name: /Modell A Kauf/ });
    const mid = await purchase
      .getByRole('cell')
      .nth(3)
      .locator('b')
      .innerText();

    await page.getByRole('button', { name: 'E-Auto günstig' }).click();
    await expect(
      page.getByText(/Gesamtkosten \(E-Auto günstig\)/),
    ).toBeVisible();
    await expect(page.getByTestId('status-line')).toContainText(
      'Preisfall E-Auto günstig',
    );
    await expect(purchase.getByRole('cell').nth(3).locator('b')).not.toHaveText(
      mid,
    );
  });

  test('an input in another area leads to "wird aktualisiert" and then to new values', async ({
    page,
  }) => {
    await seedScenario(page);
    await open(page, '/ergebnis');
    const cost = table(page)
      .getByRole('row', { name: /Modell A Kauf/ })
      .getByRole('cell')
      .nth(3)
      .locator('b');
    const before = await cost.innerText();

    await page.getByRole('link', { name: 'Parameter' }).first().click();
    const price = page.locator('[id="f-parameters.electricityPrice.mid"]');
    await price.fill('0,33');
    await price.blur();
    await page.getByRole('link', { name: 'Ergebnis' }).first().click();
    await expect(page.getByTestId('status-line')).toContainText(
      /wird aktualisiert|Stand/,
    );
    await expect(async () => {
      expect(await cost.innerText()).not.toBe(before);
    }).toPass({ timeout: 5000 });
    await expect(page.getByTestId('status-line')).not.toContainText(
      'wird aktualisiert',
    );
  });

  test('a click on a row opens the offer and the way back works', async ({
    page,
  }) => {
    await seedScenario(page);
    await open(page, '/ergebnis');
    await table(page)
      .getByRole('row', { name: /Modell A Kauf/ })
      .click();
    await expect(page).toHaveURL(/#\/ergebnis\/.+/);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Modell A · Kauf' }),
    ).toBeVisible();
    await page.getByRole('link', { name: /← Ergebnis/ }).click();
    await expect(page).toHaveURL(/#\/ergebnis$/);
  });

  test('at 1024 px the table scrolls sideways and the first column stays', async ({
    page,
  }) => {
    await seedScenario(page);
    await page.setViewportSize({ width: 1024, height: 900 });
    await open(page, '/ergebnis');
    const box = table(page).locator('xpath=..');
    const metrics = await box.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(metrics.scroll).toBeGreaterThan(metrics.client);
    const first = table(page)
      .getByRole('row', { name: /Modell A Kauf/ })
      .getByRole('cell')
      .first();
    const before = await first.boundingBox();
    await box.evaluate((el) => {
      el.scrollLeft = 150;
    });
    const after = await first.boundingBox();
    expect(after?.x).toBeCloseTo(before?.x ?? 0, 0);
    const page_ = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(page_).toBeLessThanOrEqual(0);
  });
});

test.describe('S19: offer cards below 900 px', () => {
  test('at 820 px the cards stand in two columns, at 390 px in one', async ({
    page,
  }) => {
    await seedScenario(page);
    await page.setViewportSize({ width: 820, height: 900 });
    await open(page, '/ergebnis');
    await expect(table(page)).toHaveCount(0);
    const cards = page.getByRole('region', { name: /Modell A ·/ });
    await expect(cards).toHaveCount(2);
    const [a, b] = [
      await cards.nth(0).boundingBox(),
      await cards.nth(1).boundingBox(),
    ];
    expect(Math.abs((a?.y ?? 0) - (b?.y ?? 1))).toBeLessThan(2);

    await page.setViewportSize({ width: 390, height: 900 });
    const [c, d] = [
      await cards.nth(0).boundingBox(),
      await cards.nth(1).boundingBox(),
    ];
    expect((d?.y ?? 0) - (c?.y ?? 0)).toBeGreaterThan(50);
    await expect(
      page.getByRole('button', { name: 'Günstig', exact: true }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('S19: accessibility (Q10)', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`no axe violations in the result area at ${width} px, ${colorScheme}`, async ({
        page,
        browserName,
      }) => {
        await seedScenario(page);
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await open(page, '/ergebnis');
        await expect(
          page.getByRole('heading', { level: 2 }).first(),
        ).toBeVisible();
        // The chart is a lazy chunk: analyse the page with it, not with its
        // loading text. Not in Firefox, where the analysis of the chart page
        // crashes on the CI runner (see e2e/ergebnis-detail.spec.ts).
        if (browserName !== 'firefox') {
          await expect(
            page.getByRole('img', { name: /Gestapelte Balken/ }),
          ).toBeVisible();
        }
        let result = await new AxeBuilder({ page }).analyze();
        expect(result.violations.map((v) => `list: ${v.id} ${v.help}`)).toEqual(
          [],
        );
        // A second analysis on the same page, after the lazy chunks of the
        // detail view are loaded, crashes Firefox on the CI runner. The detail
        // view has its own analysis in e2e/ergebnis-detail.spec.ts, which runs
        // in every engine.
        if (browserName === 'firefox') return;
        await page
          .getByRole('link', { name: /Modell A/ })
          .first()
          .click();
        // The heatmap and the plan are lazy chunks too.
        await expect(
          page.getByRole('region', { name: /^Heatmap/ }),
        ).toBeVisible();
        await expect(
          page.getByRole('region', { name: /^Zuordnungsplan, seitlich/ }),
        ).toBeVisible();
        result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `offer: ${v.id} ${v.help}`),
        ).toEqual([]);
      });
    }
  }

  test('the keyboard reaches the price case and the offer links', async ({
    page,
    browserName,
  }) => {
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await seedScenario(page);
    await open(page, '/ergebnis');
    await page.getByRole('button', { name: 'Mittel' }).focus();
    await page.keyboard.press(tab);
    await expect(
      page.getByRole('button', { name: 'E-Auto günstig' }),
    ).toBeFocused();
    await page.getByRole('link', { name: 'Modell A' }).first().focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/ergebnis\/.+/);
  });
});

test.describe('C4b: hiding the lease offers', () => {
  test('the switch leaves only the purchase rows, survives a reload and brings the leases back', async ({
    page,
  }) => {
    await seedScenario(page);
    await open(page, '/ergebnis');
    await expect(table(page).getByRole('row')).toHaveCount(3);

    const toggle = page.getByRole('switch', { name: /Leasing anzeigen/ });
    await toggle.click();
    await expect(table(page).getByRole('row')).toHaveCount(2);
    await expect(
      table(page).getByRole('row', { name: /Modell A Kauf/ }),
    ).toBeVisible();
    await expect(page.getByText('1 Leasingangebot ausgeblendet')).toBeVisible();

    // The autosave writes after 300 ms of quiet; the choice belongs to the scenario.
    await page.waitForTimeout(600);
    await page.reload();
    await expect(table(page).getByRole('row')).toHaveCount(2);
    await expect(
      page.getByRole('switch', { name: /Leasing anzeigen/ }),
    ).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('switch', { name: /Leasing anzeigen/ }).click();
    await expect(table(page).getByRole('row')).toHaveCount(3);
    await expect(page.getByText(/ausgeblendet/)).toHaveCount(0);
  });
});

// Screenshots for the comparison with D5, M8, T2 and T4 (chromium only,
// screenshots/s19/, ignored by git).
test.describe('S19: screenshots', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Screenshots come from one engine.',
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 1024, 820, 390]) {
      test(`result at ${width} px, ${colorScheme}`, async ({ page }) => {
        await seedScenario(page);
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await open(page, '/ergebnis');
        await expect(page.getByText(/Modell A/).first()).toBeVisible();
        await page.screenshot({
          path: `screenshots/s19/ergebnis-${width}-${colorScheme}.png`,
          fullPage: true,
        });
      });
    }
  }
});
