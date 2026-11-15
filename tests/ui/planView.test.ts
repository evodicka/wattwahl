import { describe, expect, it } from 'vitest';
import {
  listOffers,
  type OkOfferResult,
  type Scenario,
} from '../../src/domain';
import { computeOffer } from '../../src/core';
import { planView, warmestMonth } from '../../src/ui/forms/planView';
import { warrantyView } from '../../src/ui/forms/warrantyView';
import { exampleCandidate, exampleScenario } from '../fixtures/exampleScenario';
import { planPerState, winterRest } from '../fixtures/planScenarios';

// S20: the plan as a grid and the sentences of the warranty section.

const purchaseResult = (scenario: Scenario): OkOfferResult => {
  const [candidate] = scenario.candidates;
  if (!candidate) throw new Error('no candidate');
  const [offer] = listOffers(candidate);
  if (!offer) throw new Error('no offer');
  const result = computeOffer(scenario, offer, 'mid');
  if (result.status !== 'ok') throw new Error(`not ok: ${result.status}`);
  return result;
};

describe('S20: plan view', () => {
  it('TC16: with both staffed planned as E→B, "only A" is E→A in every month', () => {
    const days = planView(purchaseResult(planPerState()).plan);
    const monday = days.find((d) => d.weekday === 'mon');
    expect(monday).toBeDefined();
    for (const month of monday?.months ?? []) {
      const both = month.lines.find((l) => l.state === 'both');
      const onlyA = month.lines.find((l) => l.state === 'onlyA');
      expect(both).toMatchObject({
        vehicle: 'ev',
        target: 'b',
        present: ['a', 'b'],
      });
      expect(onlyA).toMatchObject({
        vehicle: 'ev',
        target: 'a',
        present: ['a'],
      });
      expect(month.change).toBe(false);
    }
  });

  it('TC12: "E ruht" in January on Monday, and January is the one month marked as a change', () => {
    const days = planView(purchaseResult(winterRest()).plan);
    const monday = days.find((d) => d.weekday === 'mon');
    const [january, february] = monday?.months ?? [];
    expect(january?.lines).toEqual([
      { state: 'onlyA', present: ['a'], vehicle: 'ice', target: 'a' },
    ]);
    expect(february?.lines).toEqual([
      { state: 'onlyA', present: ['a'], vehicle: 'ev', target: 'a' },
    ]);
    expect(monday?.months.filter((m) => m.change).map((m) => m.month)).toEqual([
      0,
    ]);
  });

  it('marks the changes against the warmest month, which are the winter months', () => {
    const scenario = winterRest();
    const days = planView(
      purchaseResult(scenario).plan,
      warmestMonth(scenario.parameters.monthlyTempC),
    );
    const monday = days.find((d) => d.weekday === 'mon');
    expect(monday?.months.filter((m) => m.change).map((m) => m.month)).toEqual([
      0,
    ]);
  });

  it('on a tie between two plans the warmest month decides, not the earlier month', () => {
    const plan = purchaseResult(winterRest()).plan;
    // Make the plan differ in the first six months: reference May (index 4) vs January (index 0).
    const fromJanuary = planView(plan, 0).find((d) => d.weekday === 'mon');
    const fromMay = planView(plan, 4).find((d) => d.weekday === 'mon');
    expect(fromJanuary?.months.filter((m) => m.change).length).toBe(11);
    expect(fromMay?.months.filter((m) => m.change).map((m) => m.month)).toEqual(
      [0],
    );
  });

  it('finds the warmest month, the first one on a tie', () => {
    expect(warmestMonth([1, 2, 5, 9, 14, 17, 19, 19, 15, 10, 5, 2])).toBe(6);
    expect(warmestMonth([23, 23, 23])).toBe(0);
  });

  it('has a row per weekday that has a plan, in the order of the week', () => {
    const days = planView(purchaseResult(planPerState()).plan);
    expect(days.map((d) => d.weekday)).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
    ]);
    for (const day of days) expect(day.months).toHaveLength(12);
  });

  it('lists the presence states that occur in the order both, only A, only B', () => {
    const days = planView(purchaseResult(planPerState()).plan);
    const thursday = days.find((d) => d.weekday === 'thu');
    expect(thursday?.months[0]?.lines.map((l) => l.state)).toEqual([
      'both',
      'onlyA',
      'onlyB',
    ]);
  });
});

describe('S20: warranty view', () => {
  const example = exampleScenario();
  const result = purchaseResult(example);

  it('names the budget, where it comes from and the nearest km limit', () => {
    const view = warrantyView(result);
    if (view.kind !== 'running') throw new Error('expected a running warranty');
    // Example: vehicle 3 J / 100.000 km, battery 8 J / 160.000 km, new car.
    expect(view.budget).toMatchObject({
      kmPerYear: 20000,
      source: 'battery',
      years: 8,
      km: 160000,
    });
    expect(view.plannedKm).toBeCloseTo(result.evKmPerYear);
    expect(view.exceeded).toBe(false);
    expect(view.expired).toEqual([]);
    expect(view.yearsToLimit).not.toBeNull();
  });

  it('a lease has no budget', () => {
    const [candidate] = example.candidates;
    const lease = candidate && listOffers(candidate)[1];
    if (!candidate || !lease) throw new Error('no lease');
    const leaseResult = computeOffer(example, lease, 'mid');
    if (leaseResult.status !== 'ok') throw new Error('lease not ok');
    const view = warrantyView(leaseResult);
    expect(view).toMatchObject({ kind: 'running', budget: null });
  });

  it('TC19: with both warranties expired the view says "ohne Garantie"', () => {
    const scenario = exampleScenario();
    scenario.candidates = [
      {
        ...exampleCandidate(),
        leaseTiers: [],
        vehicleWarranty: { years: 0, km: 0 },
        batteryWarranty: { years: 0, km: 0 },
      },
    ];
    expect(warrantyView(purchaseResult(scenario))).toEqual({
      kind: 'noWarranty',
    });
  });

  it('a used car with an expired vehicle warranty names the part that is out', () => {
    const scenario = exampleScenario();
    // TC18: first registration 03/2022, Stichtag 03/2025, 80.000 km; vehicle 3 J / 100.000 km, battery 6 J / 140.000 km.
    scenario.parameters.warrantyReferenceMonth = { month: 3, year: 2025 };
    scenario.candidates = [
      {
        ...exampleCandidate(),
        condition: 'used',
        firstRegistration: { month: 3, year: 2022 },
        mileageKm: 80000,
        vehicleWarranty: { years: 3, km: 100000 },
        batteryWarranty: { years: 6, km: 140000 },
        leaseTiers: [],
      },
    ];
    const view = warrantyView(purchaseResult(scenario));
    if (view.kind !== 'running') throw new Error('expected running');
    expect(view.expired).toEqual(['vehicle']);
    expect(view.budget).toMatchObject({ kmPerYear: 20000, source: 'battery' });
  });
});
