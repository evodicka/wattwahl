import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// S16: app shell, navigation and theme (architecture 8.8).

const AREAS = [
  ['fahrprofil', 'Fahrprofil'],
  ['kandidaten', 'Kandidaten'],
  ['parameter', 'Parameter'],
  ['ergebnis', 'Ergebnis'],
  ['szenarien', 'Szenarien und Daten'],
] as const;

const sidebar = (page: Page) => page.getByRole('complementary');
const bottomNav = (page: Page) =>
  page.locator('.app-bottom').getByRole('navigation', { name: 'Bereiche' });

/** Opens a route and waits until the app start has created the scenario. */
async function open(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('body')).toContainText('Standard');
}

test.describe('S16: routes', () => {
  for (const [path, title] of AREAS) {
    test(`#/${path} is reachable by deep link and after a reload`, async ({
      page,
    }) => {
      await open(page, `/${path}`);
      await expect(
        page.getByRole('heading', { level: 1, name: title }),
      ).toBeAttached();
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`#/${path}$`));
      await expect(
        page.getByRole('heading', { level: 1, name: title }),
      ).toBeAttached();
    });
  }

  test('sub-routes keep their area: #/kandidaten/:id and #/ergebnis/:offerId', async ({
    page,
  }) => {
    await open(page, '/kandidaten/abc');
    await expect(
      sidebar(page).getByRole('link', { name: 'Kandidaten' }),
    ).toHaveAttribute('aria-current', 'page');
    await open(page, '/ergebnis/abc:purchase');
    await expect(
      sidebar(page).getByRole('link', { name: 'Ergebnis' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('the Back button returns to the previous area', async ({ page }) => {
    await open(page, '/fahrprofil');
    await sidebar(page).getByRole('link', { name: 'Parameter' }).click();
    await expect(page).toHaveURL(/#\/parameter$/);
    await sidebar(page).getByRole('link', { name: 'Ergebnis' }).click();
    await expect(page).toHaveURL(/#\/ergebnis$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/parameter$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Parameter' }),
    ).toBeAttached();
    await page.goBack();
    await expect(page).toHaveURL(/#\/fahrprofil$/);
  });

  test('an unknown route leads to the first area', async ({ page }) => {
    await open(page, '/gibt-es-nicht');
    await expect(page).toHaveURL(/#\/fahrprofil$/);
  });
});

test.describe('S16: layout steps', () => {
  /** Number of grid columns of a probe element with the given class. */
  async function columns(page: Page, className: string): Promise<number> {
    return page.evaluate((name) => {
      const probe = document.createElement('div');
      probe.className = name;
      probe.append(
        document.createElement('div'),
        document.createElement('div'),
      );
      document.querySelector('main')?.append(probe);
      const tracks = getComputedStyle(probe)
        .gridTemplateColumns.split(' ')
        .filter(Boolean).length;
      probe.remove();
      return tracks;
    }, className);
  }

  const box = async (page: Page, selector: string) => {
    const found = await page.locator(selector).boundingBox();
    if (!found) throw new Error(`${selector} is not visible`);
    return found;
  };

  test('899 px: bottom navigation, 900 px: sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 899, height: 800 });
    await open(page, '/fahrprofil');
    await expect(bottomNav(page)).toBeVisible();
    await expect(sidebar(page)).toBeHidden();

    await page.setViewportSize({ width: 900, height: 800 });
    await expect(sidebar(page)).toBeVisible();
    await expect(bottomNav(page)).toBeHidden();
    await expect(page.getByRole('banner')).toBeHidden();
  });

  test('599 and 600 px: form fields go from one to two per row', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 599, height: 800 });
    await open(page, '/fahrprofil');
    expect(await columns(page, 'fields')).toBe(1);
    expect(await columns(page, 'cols2')).toBe(1);
    await expect(bottomNav(page)).toBeVisible();

    await page.setViewportSize({ width: 600, height: 800 });
    expect(await columns(page, 'fields')).toBe(2);
    expect(await columns(page, 'cols2')).toBe(1);
    await expect(bottomNav(page)).toBeVisible();
  });

  test('600 to 899 px: content at most 720 px and centred, header and bottom bar full width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 800 });
    await open(page, '/fahrprofil');
    const main = await box(page, 'main');
    expect(main.width).toBe(720);
    expect(main.x).toBe(50);
    expect((await box(page, '.app-top')).width).toBe(820);
    expect((await box(page, '.app-bottom')).width).toBe(820);

    await page.setViewportSize({ width: 599, height: 800 });
    expect((await box(page, 'main')).width).toBe(599);
  });

  test('1199 and 1200 px: sidebar 200 and 240 px, groups of three stack and go across', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1199, height: 800 });
    await open(page, '/fahrprofil');
    expect((await box(page, '.app-side')).width).toBe(200);
    expect(await columns(page, 'f3')).toBe(1);
    expect(await columns(page, 'cols2')).toBe(2);
    expect(await columns(page, 'fields')).toBe(1);

    await page.setViewportSize({ width: 1200, height: 800 });
    expect((await box(page, '.app-side')).width).toBe(240);
    expect(await columns(page, 'f3')).toBe(3);
    expect(await columns(page, 'cols2')).toBe(2);
    await expect(sidebar(page).getByRole('link')).toHaveCount(6);
  });
});

test.describe('S16: accessibility (Q10)', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`no axe violations in any area at ${width} px, ${colorScheme}`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        for (const [path] of AREAS) {
          await open(page, `/${path}`);
          const { violations } = await new AxeBuilder({ page }).analyze();
          expect(violations.map((v) => `${path}: ${v.id} ${v.help}`)).toEqual(
            [],
          );
        }
      });
    }
  }

  test('the keyboard reaches the skip link and every area', async ({
    page,
    browserName,
  }) => {
    // Safari moves the focus to links only with Option+Tab.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/fahrprofil');
    await page.keyboard.press(tab);
    await expect(
      page.getByRole('link', { name: 'Zum Inhalt springen' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    await expect(page).toHaveURL(/#\/fahrprofil$/);

    await page.keyboard.press(`Shift+${tab}`);
    for (const [path, title] of AREAS.slice().reverse()) {
      const link = sidebar(page).getByRole('link', { name: title });
      await expect(link).toBeFocused();
      if (path === 'fahrprofil') break;
      await page.keyboard.press(`Shift+${tab}`);
    }
    await sidebar(page).getByRole('link', { name: 'Parameter' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/parameter$/);
  });
});

// Screenshots for the comparison with the mockups (D1, M1, D8, M11, T1 to T4).
// They are no assertions; Playwright clears test-results/, so they go to
// screenshots/s16/ (ignored by git). Chromium only.
test.describe('S16: screenshots', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Screenshots come from one engine.',
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 1024, 820, 390]) {
      test(`frame at ${width} px, ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        for (const path of ['fahrprofil', 'ergebnis']) {
          await open(page, `/${path}`);
          await page.screenshot({
            path: `screenshots/s16/${path}-${width}-${colorScheme}.png`,
            fullPage: true,
          });
        }
      });
    }
  }
});
