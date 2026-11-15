import { expect, test } from '@playwright/test';

test('app loads at the base path, starts and shows no console errors', async ({
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
  // App start (6.2) with IndexedDB and the core worker: the template scenario
  // is created and shown in the frame.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Fahrprofil' }),
  ).toBeVisible();
  await expect(
    page.getByRole('complementary').getByText('Standard'),
  ).toBeVisible();
  expect(failedAssets).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
