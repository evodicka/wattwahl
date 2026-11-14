import { describe, expect, it } from 'vitest';
import {
  exampleCandidateCompute,
  exampleScenarioCompute,
} from '../../../tests/fixtures/exampleScenario';
import { resolvePrices } from '../calc/prices';
import { optimizeOffer } from './optimize';
import { buildProblem, shareOptions } from './problem';

describe('S09: shares of the extra mileage', () => {
  it('S09: a step of 10 % gives 0, 10, … 100', () => {
    expect(shareOptions(10)).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
    ]);
  });

  it('S09: a step that does not divide 100 ends with 100', () => {
    expect(shareOptions(33.3)).toEqual([0, 33.3, 66.6, 99.9, 100]);
  });

  it('S09: a small step does not drift and has no duplicate or overshoot', () => {
    const shares = shareOptions(0.1);
    expect(shares).toHaveLength(1001);
    expect(shares[1]).toBe(0.1);
    expect(shares[3]).toBe(0.3);
    expect(shares.at(-1)).toBe(100);
    expect(new Set(shares).size).toBe(shares.length);
  });
});

describe('S09: extra mileage in the problem', () => {
  const small = () => {
    const scenario = exampleScenarioCompute();
    scenario.extraMileage.kmPerMonth = { city: 10, rural: 0, highway: 0 };
    scenario.workplaces.a.weekdays = ['mon'];
    scenario.workplaces.b.weekdays = ['tue'];
    return scenario;
  };
  const build = (scenario: ReturnType<typeof small>) =>
    buildProblem(
      scenario,
      exampleCandidateCompute(),
      resolvePrices(scenario.iceVehicle, scenario.parameters, {
        priceCase: 'mid',
      }),
    );

  it('S09: a step of 0.1 % (1001 options per month) builds and solves', () => {
    const scenario = small();
    scenario.parameters.extraMileageStepPct = 0.1;
    const problem = build(scenario);
    const extra = problem.groups.filter((g) => g.key.startsWith('extra:'));
    expect(extra).toHaveLength(12);
    expect(extra[0]?.options).toHaveLength(1001);
    const outcome = optimizeOffer(
      scenario,
      exampleCandidateCompute(),
      problem,
      { kind: 'purchase' },
    );
    expect(outcome.status).toBe('ok');
  });

  it('S09: the fixed mode has one option per month', () => {
    const scenario = small();
    scenario.parameters.extraMileageMode = 'fixed';
    scenario.parameters.extraMileageFixedEvSharePct = 40;
    const extra = build(scenario).groups.filter((g) =>
      g.key.startsWith('extra:'),
    );
    expect(extra.every((g) => g.options.length === 1)).toBe(true);
    expect(extra[0]?.options[0]?.km).toBeCloseTo(4, 12);
  });

  it('S09: the fixed mode without a share is an error, not NaN costs', () => {
    const scenario = small();
    scenario.parameters.extraMileageMode = 'fixed';
    scenario.parameters.extraMileageFixedEvSharePct = null;
    expect(() => build(scenario)).toThrow();
  });

  it('S09: no extra mileage means no extra groups', () => {
    const scenario = small();
    scenario.extraMileage.kmPerMonth = { city: 0, rural: 0, highway: 0 };
    expect(build(scenario).groups.some((g) => g.key.startsWith('extra:'))).toBe(
      false,
    );
  });
});
