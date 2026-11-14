import { describe, expect, it } from 'vitest';
import { q1Offers, runQ1 } from './q1';
import { q1Scenario } from '../fixtures/q1Scenario';

describe('S11: the Q1 measurement scenario', () => {
  const scenario = q1Scenario();

  it('S11: it has 10 candidates with a purchase and 4 lease tiers each, 50 offers', () => {
    expect(scenario.candidates).toHaveLength(10);
    expect(scenario.candidates.every((c) => c.leaseTiers.length === 4)).toBe(
      true,
    );
    expect(q1Offers(scenario)).toHaveLength(50);
  });

  it('S11: all 150 results (50 offers in 3 price cases) are computed plans, so the workload is the full one', () => {
    const { results } = runQ1(scenario);
    expect(results).toHaveLength(150);
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s !== 'ok')).toEqual([]);
  });

  it('S11: sharing the DP between the offers of a candidate does not change a result', () => {
    // Two candidates are enough to show it and keep the unshared run short.
    const small = { ...scenario, candidates: scenario.candidates.slice(0, 2) };
    expect(runQ1(small, false).results).toEqual(runQ1(small, true).results);
  });
});
