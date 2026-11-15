import { expect, type Page } from '@playwright/test';

/** Opens a route and waits until the app start has created the scenario. */
export async function open(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('body')).toContainText('Standard');
}

async function fill(page: Page, values: [string, string][]) {
  for (const [id, value] of values) {
    const field = page.locator(`[id="f-${id}"]`);
    await field.fill(value);
    await field.blur();
  }
}

/**
 * Enters a complete scenario through the forms: the Fahrprofil, the prices
 * of the Parameter area and one candidate with one lease tier (the example
 * data of the specification). The autosave writes after 300 ms of quiet.
 */
export async function seedScenario(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/fahrprofil');
  await page.getByLabel(/^Name/).nth(0).fill('Golf Benziner');
  await fill(page, [
    ['iceVehicle.consumptionLPer100Km.city', '8'],
    ['iceVehicle.consumptionLPer100Km.rural', '6'],
    ['iceVehicle.consumptionLPer100Km.highway', '7'],
    ['iceVehicle.mileageKm', '120000'],
    ['iceVehicle.maintenancePerKm', '0,04'],
    ['iceVehicle.petrolPrice.min', '1,7'],
    ['iceVehicle.petrolPrice.mid', '1,9'],
    ['iceVehicle.petrolPrice.max', '2,1'],
    ['workplaces.a.commute.city', '10'],
    ['workplaces.a.commute.rural', '15'],
    ['workplaces.a.commute.highway', '35'],
    ['workplaces.b.commute.city', '5'],
    ['workplaces.b.commute.rural', '20'],
    ['workplaces.b.commute.highway', '25'],
    ['extraMileage.kmPerMonth.city', '50'],
    ['extraMileage.kmPerMonth.rural', '100'],
    ['extraMileage.kmPerMonth.highway', '150'],
  ]);
  await page.getByLabel(/^Name/).nth(1).fill('Büro');
  await page.getByLabel(/^Name/).nth(2).fill('Werk');
  const groups = page.getByRole('group', { name: 'Besuchte Wochentage' });
  for (const day of [
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
  ]) {
    await groups.nth(0).getByRole('button', { name: day }).click();
  }
  for (const day of ['Dienstag', 'Donnerstag']) {
    await groups.nth(1).getByRole('button', { name: day }).click();
  }

  await open(page, '/parameter');
  await fill(page, [
    ['parameters.electricityPrice.min', '0,25'],
    ['parameters.electricityPrice.mid', '0,3'],
    ['parameters.electricityPrice.max', '0,35'],
    ['parameters.evMaintenancePerKm', '0,02'],
    ['parameters.highwayDiscountPct', '0'],
    ['parameters.coldReserveK', '0'],
  ]);

  await open(page, '/kandidaten');
  await page.getByRole('button', { name: 'Ersten Kandidaten anlegen' }).click();
  await page.getByLabel(/^Name/).first().fill('Modell A');
  await fill(page, [
    ['candidates.0.purchasePrice', '40000'],
    ['candidates.0.netCapacityKwh', '60'],
    ['candidates.0.rangeKm.city.mild', '420'],
    ['candidates.0.rangeKm.city.cold', '300'],
    ['candidates.0.rangeKm.highway.mild', '300'],
    ['candidates.0.rangeKm.highway.cold', '220'],
    ['candidates.0.rangeKm.combined.mild', '360'],
    ['candidates.0.rangeKm.combined.cold', '260'],
    ['candidates.0.vehicleWarranty.years', '3'],
    ['candidates.0.vehicleWarranty.km', '100000'],
    ['candidates.0.batteryWarranty.years', '8'],
    ['candidates.0.batteryWarranty.km', '160000'],
  ]);
  await page.getByRole('button', { name: 'Leasingstufe hinzufügen' }).click();
  await fill(page, [
    ['candidates.0.leaseTiers.0.tierKmPerYear', '15000'],
    ['candidates.0.leaseTiers.0.monthlyRate', '399'],
    ['candidates.0.leaseTiers.0.termMonths', '36'],
    ['candidates.0.leaseTiers.0.downPayment', '2000'],
    ['candidates.0.leaseTiers.0.extraKmPrice', '0,08'],
    ['candidates.0.leaseTiers.0.underKmRefund', '0,04'],
  ]);
  await page.getByRole('link', { name: /← Kandidaten/ }).click();
}
