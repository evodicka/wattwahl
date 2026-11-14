import { describe, expect, it } from 'vitest';
import {
  exampleCandidateCompute,
  exampleScenarioCompute,
} from '../../../tests/fixtures/exampleScenario';
import type { ScenarioCompute } from '../../domain';
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

function run(
  scenario: ScenarioCompute,
  offer: OfferTerms = purchase,
  candidate = exampleCandidateCompute(),
) {
  const prices = resolvePrices(scenario.iceVehicle, scenario.parameters, {
    priceCase: 'mid',
  });
  return optimizeOffer(
    scenario,
    candidate,
    buildProblem(scenario, candidate, prices),
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

describe('TC18: no warranty is not an error', () => {
  it('TC18: with both warranties expired the offer is still planned and marked "ohne Garantie"', () => {
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
  it('S09: purchase and the 15,000 km lease are planned and the lease drives no more than it costs', () => {
    const scenario = exampleScenarioCompute();
    const candidate = exampleCandidateCompute();
    const bought = run(scenario, purchase, candidate);
    const leased = run(
      scenario,
      { kind: 'lease', tier: candidate.leaseTiers[0] as never },
      candidate,
    );
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
