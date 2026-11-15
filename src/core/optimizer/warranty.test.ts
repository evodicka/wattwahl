import { describe, expect, it } from 'vitest';
import { Trace } from '../trace';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import { remainingWarranty, warrantyBudget, yearsToKmLimit } from './warranty';

const purchase = { isLease: false, asTarget: true };

describe('TC10: warranty budget', () => {
  it('TC10: vehicle 3 years / 100,000 km and battery 8 years / 160,000 km give B = 20,000 km per year', () => {
    const trace = new Trace();
    const budget = warrantyBudget(
      { years: 3, km: 100000 },
      { years: 8, km: 160000 },
      purchase,
      trace,
    );
    expect(budget).toEqual({
      noWarranty: false,
      budgetKmPerYear: 20000,
      active: true,
    });
    expect(trace.entries.map((e) => e.formula)).toEqual(['OPT.budget']);
  });
});

describe('OPT.budget / TC19: expired warranty', () => {
  it('OPT.budget: vehicle 0 years / 0 km is expired, B = 20,000 km per year comes from the battery 3 years / 60,000 km', () => {
    const budget = warrantyBudget(
      { years: 0, km: 0 },
      { years: 3, km: 60000 },
      purchase,
    );
    expect(budget.budgetKmPerYear).toBe(20000);
    expect(budget.noWarranty).toBe(false);
  });

  it('TC19: both expired give no budget, "ohne Garantie" and no division by zero', () => {
    const budget = warrantyBudget(
      { years: 0, km: 0 },
      { years: 0, km: 0 },
      purchase,
    );
    expect(budget).toEqual({
      noWarranty: true,
      budgetKmPerYear: null,
      active: false,
    });
  });

  it('OPT.budget: a warranty with years left but 0 km, or km left but 0 years, is expired too', () => {
    const budget = warrantyBudget(
      { years: 2, km: 0 },
      { years: 0, km: 50000 },
      purchase,
    );
    expect(budget.noWarranty).toBe(true);
  });
});

describe('S09: when the budget steers', () => {
  const vehicle = { years: 4, km: 80000 };
  const battery = { years: 8, km: 160000 };

  it('S09: a lease has no budget target, the tier is the limit', () => {
    const budget = warrantyBudget(vehicle, battery, {
      isLease: true,
      asTarget: true,
    });
    expect(budget).toMatchObject({ budgetKmPerYear: 20000, active: false });
  });

  it('S09: the switch turns the target off but the budget stays visible', () => {
    const budget = warrantyBudget(vehicle, battery, {
      isLease: false,
      asTarget: false,
    });
    expect(budget).toMatchObject({ budgetKmPerYear: 20000, active: false });
  });
});

describe('S09: years to the km limit', () => {
  it('OPT.yearsToKmLimit: 100,000 km at 25,000 km per year is 4 years', () => {
    const trace = new Trace();
    expect(yearsToKmLimit(100000, 25000, trace)).toBe(4);
    expect(trace.entries[0]?.formula).toBe('OPT.yearsToKmLimit');
  });

  it('OPT.yearsToKmLimit: an EV that does not drive never reaches the limit', () => {
    expect(yearsToKmLimit(100000, 0)).toBe(Number.MAX_VALUE);
  });
});

const MARCH_2025 = { month: 3, year: 2025 };
const used = (
  firstRegistration: { month: number; year: number },
  mileageKm: number,
) => ({ condition: 'used' as const, firstRegistration, mileageKm });

describe('TC18: remaining warranty of a used car', () => {
  // Used, first registration 03/2022, reference month 03/2025, 80,000 km.
  const car = used({ month: 3, year: 2022 }, 80000);

  it('TC18: a = 36 months; vehicle 3 years / 100,000 km leaves 0 years / 20,000 km, expired', () => {
    const trace = new Trace();
    const vehicle = remainingWarranty(
      'vehicle',
      { years: 3, km: 100000 },
      car,
      MARCH_2025,
      trace,
    );
    expect(vehicle).toEqual({ years: 0, km: 20000 });
    expect(trace.entries.map((e) => e.formula)).toEqual([
      'OPT.remainingWarranty',
      'OPT.remainingWarranty',
    ]);
    expect(trace.entries.map((e) => e.inputs.ageMonths)).toEqual([36, 36]);
    expect(trace.entries.map((e) => e.value)).toEqual([0, 20000]);
  });

  it('TC18: battery 6 years / 140,000 km leaves 3 years / 60,000 km, so B = 20,000 km per year from the battery', () => {
    const vehicle = remainingWarranty(
      'vehicle',
      { years: 3, km: 100000 },
      car,
      MARCH_2025,
    );
    const battery = remainingWarranty(
      'battery',
      { years: 6, km: 140000 },
      car,
      MARCH_2025,
    );
    expect(battery).toEqual({ years: 3, km: 60000 });
    expect(warrantyBudget(vehicle, battery, purchase)).toEqual({
      noWarranty: false,
      budgetKmPerYear: 20000,
      active: true,
    });
  });
});

describe('TC19: expired remaining warranty', () => {
  const vehicleNormal = { years: 5, km: 200000 };
  const batteryNormal = { years: 8, km: 160000 };

  it('TC19: 01/2020 to 03/2025 is a = 62; vehicle expired by age (0 years / 30,000 km), battery by km (2.83 years / 0 km), no budget, no division by zero', () => {
    const trace = new Trace();
    const car = used({ month: 1, year: 2020 }, 170000);
    const vehicle = remainingWarranty(
      'vehicle',
      vehicleNormal,
      car,
      MARCH_2025,
      trace,
    );
    const battery = remainingWarranty(
      'battery',
      batteryNormal,
      car,
      MARCH_2025,
      trace,
    );
    expect(trace.entries[0]?.inputs.ageMonths).toBe(62);
    expect(vehicle).toEqual({ years: 0, km: 30000 });
    expectSpec(battery.years, '2,83');
    expect(battery.km).toBe(0);
    const budget = warrantyBudget(vehicle, battery, purchase);
    expect(budget).toEqual({
      noWarranty: true,
      budgetKmPerYear: null,
      active: false,
    });
  });

  it('TC19: first registration 03/2020 is a = 60, the vehicle warranty ends exactly at the reference month (0 years), "ohne Garantie"', () => {
    const trace = new Trace();
    const car = used({ month: 3, year: 2020 }, 170000);
    const vehicle = remainingWarranty(
      'vehicle',
      vehicleNormal,
      car,
      MARCH_2025,
      trace,
    );
    const battery = remainingWarranty(
      'battery',
      batteryNormal,
      car,
      MARCH_2025,
    );
    expect(trace.entries[0]?.inputs.ageMonths).toBe(60);
    expect(vehicle.years).toBe(0);
    expect(warrantyBudget(vehicle, battery, purchase).noWarranty).toBe(true);
  });
});

describe('OPT.remainingWarranty: age and new cars', () => {
  it('OPT.remainingWarranty: a new car keeps its normal warranty, whatever the reference month', () => {
    const normal = { years: 3, km: 100000 };
    const remaining = remainingWarranty(
      'vehicle',
      normal,
      { condition: 'new', firstRegistration: null, mileageKm: 0 },
      MARCH_2025,
    );
    expect(remaining).toEqual(normal);
  });

  it('OPT.remainingWarranty: a first registration after the reference month counts as age 0', () => {
    const remaining = remainingWarranty(
      'battery',
      { years: 8, km: 160000 },
      used({ month: 6, year: 2025 }, 1000),
      MARCH_2025,
    );
    expect(remaining).toEqual({ years: 8, km: 159000 });
  });

  it('OPT.remainingWarranty: months count exactly, 18 months leave 1.5 of 3 years', () => {
    const remaining = remainingWarranty(
      'vehicle',
      { years: 3, km: 100000 },
      used({ month: 9, year: 2023 }, 0),
      MARCH_2025,
    );
    expect(remaining.years).toBe(1.5);
  });
});
