import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open, seedScenario } from './helpers';

// S20: cost bars, reserve heatmap, assignment plan and warranty (boards D5, D6, M8, M9).

async function openDetail(page: Page) {
  await open(page, '/ergebnis');
  const link = page
    .getByRole('link', { name: /^(Details ansehen: )?Modell A/ })
    .first();
  await link.click();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Modell A ·/ }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: /^Heatmap/ })).toBeVisible();
  await expect(
    page.getByRole('region', { name: /^Zuordnungsplan, seitlich/ }),
  ).toBeVisible();
}

test.describe('S20: cost bars', () => {
  test('draw a bar per computed offer with the span and a table alternative', async ({
    page,
  }) => {
    await seedScenario(page);
    await open(page, '/ergebnis');
    const chart = page.getByRole('img', { name: /Gestapelte Balken/ });
    await expect(chart).toBeVisible();
    await expect(chart.locator('svg rect')).toHaveCount(8);
    await page.getByText('Als Tabelle lesen').click();
    await expect(
      page.getByRole('columnheader', { name: 'Gesamt', exact: true }),
    ).toBeVisible();
  });

  test('stay inside the page at 390 px', async ({ page }) => {
    await seedScenario(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page, '/ergebnis');
    await expect(
      page.getByRole('img', { name: /Gestapelte Balken/ }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('S20: detail view', () => {
  test('shows reserve, plan and warranty of an offer', async ({ page }) => {
    await seedScenario(page);
    await openDetail(page);
    const heatmap = page.getByRole('region', { name: /^Heatmap/ });
    expect(await heatmap.locator('tbody td').count()).toBe(24);
    await expect(page.getByRole('heading', { name: 'Garantie' })).toBeVisible();
    await expect(
      page.getByText('Mehrkosten durch Garantie-Budget:'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Zum Szenariovergleich' }),
    ).toBeVisible();
  });

  test('at 390 px the heatmap and the plan scroll sideways and the page does not', async ({
    page,
  }) => {
    await seedScenario(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await openDetail(page);
    for (const name of [/^Heatmap/, /^Zuordnungsplan, seitlich/]) {
      const region = page.getByRole('region', { name });
      const sizes = await region.evaluate((el) => ({
        scroll: el.scrollWidth,
        client: el.clientWidth,
      }));
      expect(sizes.scroll).toBeGreaterThan(sizes.client);
      await region.evaluate((el) => {
        el.scrollLeft = 200;
      });
      expect(await region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      // The page stays put and the row header stays in view.
      const scrolled = await page.evaluate(() => ({
        x: window.scrollX,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      }));
      expect(scrolled.x).toBe(0);
      expect(scrolled.overflow).toBeLessThanOrEqual(0);
      const [box, rowHeader] = [
        await region.boundingBox(),
        await region.locator('tbody th[scope="row"]').first().boundingBox(),
      ];
      expect(rowHeader?.x).toBeGreaterThanOrEqual((box?.x ?? 0) - 1);
    }
  });

  test('the scroll regions scroll with the arrow keys', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'Safari moves a focused region with the arrow keys only with full keyboard access.',
    );
    await seedScenario(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await openDetail(page);
    const region = page.getByRole('region', { name: /^Heatmap/ });
    await region.focus();
    await expect(region).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => region.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
  });

  test('another offer can be chosen', async ({ page }) => {
    await seedScenario(page);
    await openDetail(page);
    await page
      .getByLabel('Kandidat')
      .selectOption({ label: 'Modell A · Leasing 15.000 km' });
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Modell A · Leasing 15.000 km',
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Bei Leasing ist die Stufe die Grenze/),
    ).toBeVisible();
  });
});

test.describe('S20: accessibility (Q10)', () => {
  // One analysis per page: a second analysis on the same page made Firefox
  // crash now and then, so the charts and the detail view are separate tests.
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`no axe violations in the charts at ${width} px, ${colorScheme}`, async ({
        page,
        browserName,
      }) => {
        // Firefox on the CI runner ends this analysis with "Page crashed", on
        // every try; it does not on a developer machine. The DOM rules are the
        // same in every engine, so Chromium and WebKit check this page.
        test.skip(
          browserName === 'firefox',
          'Firefox crashes in the accessibility analysis of the chart page on CI.',
        );
        await seedScenario(page);
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await open(page, '/ergebnis');
        await expect(
          page.getByRole('img', { name: /Gestapelte Balken/ }),
        ).toBeVisible();
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `charts: ${v.id} ${v.help}`),
        ).toEqual([]);
      });

      test(`no axe violations in the detail view at ${width} px, ${colorScheme}`, async ({
        page,
      }) => {
        await seedScenario(page);
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await openDetail(page);
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `detail: ${v.id} ${v.help}`),
        ).toEqual([]);
      });
    }
  }
});

// Screenshots for the comparison with D5, D6, M8 and M9 (chromium only,
// screenshots/s20/, ignored by git).
test.describe('S20: screenshots', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Screenshots come from one engine.',
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`charts and detail at ${width} px, ${colorScheme}`, async ({
        page,
      }) => {
        await seedScenario(page);
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await open(page, '/ergebnis');
        await expect(
          page.getByRole('img', { name: /Gestapelte Balken/ }),
        ).toBeVisible();
        await page.screenshot({
          path: `screenshots/s20/ergebnis-${width}-${colorScheme}.png`,
          fullPage: true,
        });
        await openDetail(page);
        await page.screenshot({
          path: `screenshots/s20/detail-${width}-${colorScheme}.png`,
          fullPage: true,
        });
      });
    }
  }
});
