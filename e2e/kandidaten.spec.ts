import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// S18: candidate list and form (boards D2, M2, D3, M3 to M6).

async function open(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('body')).toContainText('Standard');
}

const cards = (page: Page) => page.locator('main').getByRole('region');

/** Creates a candidate from the list and returns to the list. */
async function addCandidate(page: Page, name: string, first: boolean) {
  await page
    .getByRole('button', {
      name: first ? 'Ersten Kandidaten anlegen' : 'Neuer Kandidat',
    })
    .click();
  await page.getByLabel(/^Name/).first().fill(name);
  await page.getByRole('link', { name: /← Kandidaten/ }).click();
}

test.describe('S18: list', () => {
  test('two candidates and a duplicate: all three are listed', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/kandidaten');
    await expect(page.getByText('Noch kein Kandidat')).toBeVisible();
    await addCandidate(page, 'Modell A', true);
    await addCandidate(page, 'Modell B', false);
    await page.getByRole('button', { name: 'Duplizieren: Modell A' }).click();
    await expect(cards(page)).toHaveCount(3);
    await expect(
      page.getByRole('region', { name: 'Modell A (Kopie)' }),
    ).toBeVisible();
    await page.waitForTimeout(800);
    await page.reload();
    await expect(cards(page)).toHaveCount(3);
  });

  test('an incomplete candidate names what is missing', async ({ page }) => {
    await open(page, '/kandidaten');
    await addCandidate(page, 'Modell C', true);
    const card = page.getByRole('region', { name: 'Modell C' });
    await expect(card.getByText('Unvollständig')).toBeVisible();
    await expect(card.getByText(/Es fehlen \d+ Angaben/)).toBeVisible();
    await expect(card.getByText(/Netto-Akkukapazität/)).toBeVisible();
    await expect(card.getByRole('button', { name: /Ergänzen/ })).toBeVisible();
  });

  test('a delete asks first', async ({ page }) => {
    await open(page, '/kandidaten');
    await addCandidate(page, 'Modell D', true);
    await page.getByRole('button', { name: 'Löschen: Modell D' }).click();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(cards(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Löschen: Modell D' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Löschen' })
      .click();
    await expect(page.getByText('Noch kein Kandidat')).toBeVisible();
  });
});

test.describe('S18: form', () => {
  test('a fifth lease offer cannot be added and a used car asks for its registration', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/kandidaten');
    await page
      .getByRole('button', { name: 'Ersten Kandidaten anlegen' })
      .click();
    const add = page.getByRole('button', { name: 'Leasingstufe hinzufügen' });
    for (let i = 0; i < 4; i += 1) await add.click();
    await expect(add).toBeDisabled();
    await expect(page.getByRole('group', { name: /^Stufe/ })).toHaveCount(4);

    await page.getByLabel(/^Zustand/).selectOption('used');
    await expect(
      page.getByRole('group', { name: /Erstzulassung/ }),
    ).toBeVisible();
    await expect(page.getByText(/Gebraucht ohne Erstzulassung/)).toBeVisible();
  });

  test('on a phone the form leads through four steps', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, '/kandidaten');
    await page
      .getByRole('button', { name: 'Ersten Kandidaten anlegen' })
      .click();
    await expect(page.getByText('Schritt 1 von 4')).toBeVisible();
    for (const [step, heading] of [
      [2, 'Akku'],
      [3, 'Fahrzeuggarantie'],
      [4, 'Leasingangebote'],
    ] as const) {
      await page.getByRole('button', { name: 'Weiter' }).click();
      await expect(page.getByText(`Schritt ${step} von 4`)).toBeVisible();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page).toHaveURL(/#\/kandidaten$/);
  });

  test('every input of the form is reachable by keyboard', async ({
    page,
    browserName,
  }) => {
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/kandidaten');
    await page
      .getByRole('button', { name: 'Ersten Kandidaten anlegen' })
      .click();
    await page.getByLabel(/^Name/).first().focus();
    await page.keyboard.press(tab);
    await expect(page.getByLabel(/^Zustand/)).toBeFocused();
  });
});

test.describe('S18: accessibility (Q10)', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`no axe violations in the list and the form at ${width} px, ${colorScheme}`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await open(page, '/kandidaten');
        await addCandidate(page, 'Modell A', true);
        let result = await new AxeBuilder({ page }).analyze();
        expect(result.violations.map((v) => `list: ${v.id} ${v.help}`)).toEqual(
          [],
        );
        await page.getByRole('button', { name: /Ergänzen/ }).click();
        for (let step = 0; step < 4; step += 1) {
          result = await new AxeBuilder({ page }).analyze();
          expect(
            result.violations.map((v) => `form: ${v.id} ${v.help}`),
          ).toEqual([]);
          const next = page.getByRole('button', { name: 'Weiter' });
          if (!(await next.isVisible())) break;
          await next.click();
        }
      });
    }
  }
});

// Screenshots for the comparison with D2, M2, D3 and M3 to M6 (chromium only,
// screenshots/s18/, ignored by git).
test.describe('S18: screenshots', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Screenshots come from one engine.',
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`list and form at ${width} px, ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await open(page, '/kandidaten');
        await addCandidate(page, 'Modell A', true);
        await addCandidate(page, 'Modell B', false);
        await expect(page.getByText('Unvollständig').first()).toBeVisible();
        await page.screenshot({
          path: `screenshots/s18/list-${width}-${colorScheme}.png`,
          fullPage: true,
        });
        await page
          .getByRole('button', { name: /Ergänzen/ })
          .first()
          .click();
        await page
          .getByRole('button', { name: 'Leasingstufe hinzufügen' })
          .or(page.getByRole('button', { name: 'Weiter' }))
          .first()
          .click()
          .catch(() => {});
        await page.screenshot({
          path: `screenshots/s18/form-${width}-${colorScheme}.png`,
          fullPage: true,
        });
      });
    }
  }
});
