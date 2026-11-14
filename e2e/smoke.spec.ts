import { expect, test } from '@playwright/test';

test('app loads at the base path with all assets and no console errors', async ({
  page,
}) => {
  const failedAssets: string[] = [];
  const consoleErrors: string[] = [];

  page.on('response', (response) => {
    const type = response.request().resourceType();
    if ((type === 'script' || type === 'stylesheet') && !response.ok()) {
      failedAssets.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Wattwahl');
  await expect(page.getByRole('heading', { name: 'Wattwahl' })).toBeVisible();
  expect(failedAssets).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
