import { describe, expect, it } from 'vitest';
import {
  exampleCandidateCompute,
  exampleScenarioCompute,
} from '../../../tests/fixtures/exampleScenario';
import type { ScenarioCompute } from '../../domain';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import { resolvePrices } from '../calc/prices';
import { optimizeOffer, type OfferTerms } from './optimize';
import { buildProblem } from './problem';

const purchase: OfferTerms = { kind: 'purchase' };

/**
 * A fixture for one mechanism at a time: no extra mileage, no warranty budget,
 * SoH of a new car fixed at the start, no maintenance, mild weather all year.
 * Tests change what they test.
 */
function isolated(
  change: (scenario: ScenarioCompute) => void,
): ScenarioCompute {
  const scenario = exampleScenarioCompute();
  scenario.extraMileage.kmPerMonth = { city: 0, rural: 0, highway: 0 };
  scenario.iceVehicle.maintenancePerKm = 0;
  scenario.parameters.evMaintenancePerKm = 0;
  scenario.parameters.warrantyBudgetAsTarget = false;
  scenario.parameters.sohReference = 'start';
  scenario.parameters.monthlyTempC = Array.from({ length: 12 }, () => 23);
  change(scenario);
  return scenario;
}

function problemFor(
  scenario: ScenarioCompute,
  candidate = exampleCandidateCompute(),
) {
  const prices = resolvePrices(scenario.iceVehicle, scenario.parameters, {
    priceCase: 'mid',
  });
  return buildProblem(scenario, candidate, prices);
}

function run(
  scenario: ScenarioCompute,
  offer: OfferTerms = purchase,
  candidate = exampleCandidateCompute(),
) {
  return optimizeOffer(
    scenario,
    candidate,
    problemFor(scenario, candidate),
    offer,
  );
}

const choiceOf = (
  outcome: ReturnType<typeof run>,
  key: { weekday: string; month: number; state: string },
): string | undefined => {
  if (outcome.status !== 'ok') return undefined;
  return outcome.plan.find(
    (entry) =>
      entry.info.kind === 'day' &&
      entry.info.weekday === key.weekday &&
      entry.info.month === key.month &&
      entry.info.state === key.state,
  )?.choice;
};

const hw = (highway: number) => ({ city: 0, rural: 0, highway });

describe('TC11: unsuitable offer', () => {
  it('TC11: Monday with both workplaces staffed and no drivable way in January is unsuitable, the reason names Monday, January and both reserves', () => {
    const scenario = isolated((s) => {
      s.workplaces.a = {
        ...s.workplaces.a,
        weekdays: ['mon'],
        freeDaysPerYear: 0,
        commute: hw(80),
      };
      s.workplaces.b = {
        ...s.workplaces.b,
        weekdays: ['mon'],
        freeDaysPerYear: 0,
        commute: hw(80),
      };
      s.parameters.monthlyTempC[0] = -10;
    });
    const outcome = run(scenario);
    expect(outcome.status).toBe('unsuitable');
    if (outcome.status !== 'unsuitable') return;
    expect(outcome.reason).toMatchObject({
      kind: 'both',
      weekday: 'mon',
      month: 0,
    });
    if (outcome.reason.kind !== 'both') return;
    expect(outcome.reason.reserveKm.a).toBeLessThan(0);
    expect(outcome.reason.reserveKm.b).toBeLessThan(0);
  });
});

describe('TC12: rest instead of unsuitable', () => {
  const winterTrap = (strict: boolean) =>
    isolated((s) => {
      s.workplaces.a = {
        ...s.workplaces.a,
        weekdays: ['mon'],
        freeDaysPerYear: 0,
        commute: hw(80),
      };
      s.workplaces.b = {
        ...s.workplaces.b,
        weekdays: ['tue'],
        freeDaysPerYear: 0,
        commute: { city: 5, rural: 5, highway: 10 },
      };
      s.parameters.monthlyTempC[0] = -10;
      s.parameters.strictMode = strict;
    });

  it('TC12: Monday with only A staffed and A not drivable in January plans "E ruht" and the offer stays suitable', () => {
    const outcome = run(winterTrap(false));
    expect(outcome.status).toBe('ok');
    // "Rest" is forced: A cannot be driven in January but can in February.
    const problem = problemFor(winterTrap(false));
    expect(problem.checkWayAt('a', 0, 1).reserveKm).toBeLessThan(0);
    expect(problem.checkWayAt('a', 1, 1).reserveKm).toBeGreaterThanOrEqual(0);
    expect(
      choiceOf(outcome, { weekday: 'mon', month: 0, state: 'onlyA' }),
    ).toBe('rest');
    expect(
      choiceOf(outcome, { weekday: 'mon', month: 1, state: 'onlyA' }),
    ).toBe('evA');
  });

  it('TC12: strict mode makes the same offer unsuitable and names the way and month', () => {
    const outcome = run(winterTrap(true));
    expect(outcome.status).toBe('unsuitable');
    if (outcome.status !== 'unsuitable') return;
    expect(outcome.reason).toMatchObject({
      kind: 'strict',
      way: 'a',
      month: 0,
    });
    if (outcome.reason.kind === 'strict') {
      expect(outcome.reason.reserveKm).toBeLessThan(0);
    }
  });
});

describe('TC16: plan per presence state', () => {
  it('TC16: with "both" planned as E→B, A alone is still E→A because the EV is cheaper per day than petrol', () => {
    const scenario = isolated((s) => {
      s.workplaces.a = {
        ...s.workplaces.a,
        weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        freeDaysPerYear: 30,
      };
      // B also visits Monday and is the longer, petrol-hungrier way.
      s.workplaces.b = {
        ...s.workplaces.b,
        weekdays: ['mon', 'thu'],
        freeDaysPerYear: 10,
        commute: hw(80),
      };
    });
    const outcome = run(scenario);
    expect(outcome.status).toBe('ok');
    for (let month = 0; month < 12; month++) {
      expect(choiceOf(outcome, { weekday: 'mon', month, state: 'both' })).toBe(
        'evB',
      );
      expect(choiceOf(outcome, { weekday: 'mon', month, state: 'onlyA' })).toBe(
        'evA',
      );
    }
  });
});

describe('TC19: no warranty is not an error', () => {
  it('TC19: with both warranties expired the offer is still planned and marked "ohne Garantie"', () => {
    const candidate = exampleCandidateCompute();
    candidate.vehicleWarranty = { years: 0, km: 0 };
    candidate.batteryWarranty = { years: 0, km: 0 };
    const outcome = run(
      isolated((s) => {
        s.parameters.warrantyBudgetAsTarget = true;
      }),
      purchase,
      candidate,
    );
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.budget.noWarranty).toBe(true);
    expect(outcome.budgetExceeded).toBe(false);
  });
});

describe('S09: the example scenario', () => {
  it('S09: purchase and the 15,000 km lease are both planned, and only the purchase has a warranty budget', () => {
    const scenario = exampleScenarioCompute();
    const candidate = exampleCandidateCompute();
    const [firstTier] = candidate.leaseTiers;
    if (!firstTier) throw new Error('The example candidate has a lease tier.');
    const bought = run(scenario, purchase, candidate);
    const leased = run(scenario, { kind: 'lease', tier: firstTier }, candidate);
    expect(bought.status).toBe('ok');
    expect(leased.status).toBe('ok');
    if (bought.status !== 'ok' || leased.status !== 'ok') return;
    expect(bought.evKmPerYear).toBeGreaterThan(0);
    expect(bought.targetCost).toBeGreaterThan(bought.variableCost);
    expect(bought.budget.active).toBe(true);
    expect(leased.budget.active).toBe(false);
  });

  it('S09: the same input gives the same plan and cost twice', () => {
    const scenario = exampleScenarioCompute();
    const first = run(scenario);
    const second = run(scenario);
    expect(second).toEqual(first);
  });
});

describe('TC16: daily costs behind the plan', () => {
  it('TC16: for "only A" the EV costs 10.00 EUR a day and petrol 15.77 EUR, so the plan is E→A', () => {
    // Data of test cases 4 and 5: January at -10 °C, 60 km way A, no maintenance.
    const scenario = isolated((s) => {
      s.workplaces.b = {
        ...s.workplaces.b,
        weekdays: ['mon', 'thu'],
        freeDaysPerYear: 10,
      };
      s.parameters.monthlyTempC[0] = -10;
    });
    const problem = problemFor(scenario);
    const index = problem.info.findIndex(
      (entry) =>
        entry.kind === 'day' &&
        entry.weekday === 'mon' &&
        entry.month === 0 &&
        entry.state === 'onlyA',
    );
    const info = problem.info[index];
    const options = problem.groups[index]?.options;
    if (info?.kind !== 'day' || !options) throw new Error('group not found');
    // Cost over D = 48 months without price rise: days per year · cost per day · 4.
    const perDay = (choice: string) =>
      (options.find((o) => o.choice === choice)?.cost ?? Number.NaN) /
      (info.days * 4);
    expectSpec(perDay('evA'), '10,00');
    expectSpec(perDay('rest'), '15,77');
    expectSpec(info.days, '0,37');
    expect(
      choiceOf(run(scenario), { weekday: 'mon', month: 0, state: 'onlyA' }),
    ).toBe('evA');
  });
});

describe('S09: unsuitable because driving lowers the SoH', () => {
  /**
   * Way A can never be driven (it counts two trips and is far above the
   * capacity). Way B can be driven only while the SoH stays at or above 0.9006.
   * The smallest possible EV distance is A's, so the best SoH is that of 6,240
   * km a year, where B is still fine. B's own 8,320 km a year age the battery
   * below its threshold.
   */
  const coupled = (kmToSohMin: number) =>
    isolated((s) => {
      s.workplaces.a = {
        ...s.workplaces.a,
        weekdays: ['mon'],
        freeDaysPerYear: 0,
        commute: hw(60),
        chargesFreeAtWork: false,
      };
      s.workplaces.b = {
        ...s.workplaces.b,
        weekdays: ['mon'],
        freeDaysPerYear: 0,
        commute: hw(80),
        chargesFreeAtWork: true,
      };
      s.parameters.sohReference = 'end';
      s.parameters.kmGridPerYear = 50;
      s.parameters.kmToSohMin = kmToSohMin;
    });
  const candidate = () => {
    const c = exampleCandidateCompute();
    const flat = { mild: 141, cold: 141 };
    c.rangeKm = { city: flat, highway: flat, combined: flat };
    return c;
  };

  it('S09: the reason is "coupling", not a blocked day, when the way is drivable at the best SoH', () => {
    const outcome = run(coupled(42857), purchase, candidate());
    expect(outcome.status).toBe('unsuitable');
    if (outcome.status !== 'unsuitable') return;
    expect(outcome.reason.kind).toBe('coupling');
    expect(outcome.reason.soh).toBeCloseTo(0.9125, 3);
  });

  it('S09: the same scenario with slow ageing is suitable and drives B', () => {
    const outcome = run(coupled(200000), purchase, candidate());
    expect(outcome.status).toBe('ok');
    expect(choiceOf(outcome, { weekday: 'mon', month: 0, state: 'both' })).toBe(
      'evB',
    );
  });
});

describe('S09: forced over the warranty budget', () => {
  const forced = () =>
    isolated((s) => {
      const allWeek = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
      s.workplaces.a = {
        ...s.workplaces.a,
        weekdays: [...allWeek],
        freeDaysPerYear: 0,
      };
      s.workplaces.b = {
        ...s.workplaces.b,
        weekdays: [...allWeek],
        freeDaysPerYear: 0,
      };
      s.parameters.warrantyBudgetAsTarget = true;
    });

  it('S09: both workplaces every day force about 26,000 km, above the 20,000 km budget, with the years to each km limit', () => {
    const outcome = run(forced());
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.budget.budgetKmPerYear).toBe(20000);
    expect(outcome.budgetExceeded).toBe(true);
    expect(outcome.evKmPerYear).toBeGreaterThan(20000);
    expect(outcome.yearsToKmLimit?.vehicle).toBeCloseTo(
      100000 / outcome.evKmPerYear,
      9,
    );
    expect(outcome.yearsToKmLimit?.battery).toBeCloseTo(
      160000 / outcome.evKmPerYear,
      9,
    );
  });

  it('S09: an expired warranty has no years to its limit', () => {
    const candidate = exampleCandidateCompute();
    candidate.vehicleWarranty = { years: 0, km: 0 };
    const outcome = run(forced(), purchase, candidate);
    if (outcome.status !== 'ok') throw new Error('expected a plan');
    expect(outcome.yearsToKmLimit?.vehicle).toBeNull();
    expect(outcome.yearsToKmLimit?.battery).not.toBeNull();
  });

  it('S09: within the budget there is no warning but the years to the limit are known', () => {
    const outcome = run(isolated(() => undefined));
    if (outcome.status !== 'ok') throw new Error('expected a plan');
    expect(outcome.budgetExceeded).toBe(false);
    // The years to the km limit are shown anyway (Garantie tile).
    expect(outcome.yearsToKmLimit.vehicle).toBeCloseTo(
      100000 / outcome.evKmPerYear,
      9,
    );
  });
});
