import { expect, test, type Page } from '@playwright/test';

// S17: Fahrprofil and Parameter (boards D1, M1, D4, M7).

async function open(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('body')).toContainText('Standard');
}

/** The autosave writes after 300 ms of quiet (8.2); wait it out before reloading. */
const autosaved = (page: Page) => page.waitForTimeout(800);

test.describe('S17: inputs', () => {
  test('an input is still there after a reload', async ({ page }) => {
    await open(page, '/fahrprofil');
    const field = page.getByLabel(/^Verbrauch Stadt/);
    await field.fill('8,5');
    await field.blur();
    await page.getByLabel(/^Name/).first().fill('Golf Benziner');
    await autosaved(page);
    await page.reload();
    await expect(page.getByLabel(/^Verbrauch Stadt/)).toHaveValue('8,5');
    await expect(page.getByLabel(/^Name/).first()).toHaveValue('Golf Benziner');
  });

  test('a parameter change survives a reload and shows as changed', async ({
    page,
  }) => {
    await open(page, '/parameter');
    const field = page.getByRole('textbox', { name: /^Autobahn-Abschlag/ });
    await field.fill('8');
    await field.blur();
    await expect(page.getByText('● geändert')).toBeVisible();
    await autosaved(page);
    await page.reload();
    await expect(
      page.getByRole('textbox', { name: /^Autobahn-Abschlag/ }),
    ).toHaveValue('8');
  });

  test('number fields open the number keyboard and show the unit at the end', async ({
    page,
  }) => {
    await open(page, '/fahrprofil');
    const field = page.getByLabel(/^Verbrauch Stadt/);
    await expect(field).toHaveAttribute('inputmode', 'decimal');
    const [input, unit] = await Promise.all([
      field.boundingBox(),
      page.getByText('l/100 km').first().boundingBox(),
    ]);
    if (!input || !unit) throw new Error('field or unit not found');
    expect(unit.x).toBeGreaterThan(input.x + input.width - 1);
  });

  test('no field is cut off at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const path of ['/fahrprofil', '/parameter']) {
      await open(page, path);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('the keyboard reaches the fields in order', async ({
    page,
    browserName,
  }) => {
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/fahrprofil');
    await page.getByLabel(/^Name/).first().focus();
    await page.keyboard.press(tab);
    await expect(page.getByLabel(/^Verbrauch Stadt/)).toBeFocused();
  });
});

// Screenshots for the comparison with D1, M1, D4 and M7 (chromium only,
// screenshots/s17/, ignored by git).
test.describe('S17: screenshots', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Screenshots come from one engine.',
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`areas at ${width} px, ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        for (const path of ['fahrprofil', 'parameter']) {
          await open(page, `/${path}`);
          await page.screenshot({
            path: `screenshots/s17/${path}-${width}-${colorScheme}.png`,
            fullPage: true,
          });
        }
      });
    }
  }
});
