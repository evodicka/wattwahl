import { describe, expect, it } from 'vitest';
import { Trace } from '../trace';
import { warrantyBudget, yearsToKmLimit } from './warranty';

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

describe('TC18: expired warranty', () => {
  it('TC18: vehicle 0 years / 0 km is expired, B = 20,000 km per year comes from the battery 3 years / 60,000 km', () => {
    const budget = warrantyBudget(
      { years: 0, km: 0 },
      { years: 3, km: 60000 },
      purchase,
    );
    expect(budget.budgetKmPerYear).toBe(20000);
    expect(budget.noWarranty).toBe(false);
  });

  it('TC18: both expired give no budget, "ohne Garantie" and no division by zero', () => {
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

  it('TC18: a warranty with years left but 0 km, or km left but 0 years, is expired too', () => {
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
