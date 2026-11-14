import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bruteForce } from './__tests__/bruteForce';
import { Trace } from '../trace';
import { dpCosts, prepare, reconstruct } from './knapsack';
import { solve, TIE_BAND } from './select';
import type { Group, Option, SolverInput } from './types';

const option = (
  km: number,
  cost: number,
  needs: number | null = null,
): Option => ({ km, cost, needs, choice: `${km}` });

/** A plain input: SoH falls 1 % per 100 km per year, the reserve is the SoH. */
function input(
  partial: Partial<SolverInput> & { groups: Group[] },
): SolverInput {
  return {
    thresholds: [],
    sohForKmPerYear: (km) => Math.max(0, 1 - km / 10000),
    reserveAtSoh: (soh) => soh,
    offerCost: () => 0,
    budgetKmPerYear: null,
    strict: false,
    gridKm: 250,
    cellKm: 1,
    ...partial,
  };
}

describe('S09: knapsack', () => {
  const groups: Group[] = [
    { key: 'a', options: [option(10, 5), option(0, 9)] },
    { key: 'b', options: [option(20, 4), option(0, 7)] },
  ];

  it('S09: dpCosts gives the cheapest cost per exact cell count', () => {
    const costs = dpCosts(prepare(groups, 1), 0);
    expect(costs?.[0]).toBe(16);
    expect(costs?.[10]).toBe(5 + 7);
    expect(costs?.[20]).toBe(9 + 4);
    expect(costs?.[30]).toBe(9);
    expect(costs?.[5]).toBe(Infinity);
    expect(costs).toHaveLength(31);
  });

  it('S09: reconstruct returns a plan with exactly the cost and cells of the cell', () => {
    const prep = prepare(groups, 1);
    expect(reconstruct(prep, 0, 20)).toEqual([1, 0]);
    expect(reconstruct(prep, 0, 30)).toEqual([0, 0]);
  });

  it('S09: a group without an allowed option makes the set infeasible', () => {
    const blocked: Group[] = [{ key: 'x', options: [option(5, 1, 0)] }];
    expect(dpCosts(prepare(blocked, 1), 0)).toBeNull();
    expect(dpCosts(prepare(blocked, 1), 0b1)?.[5]).toBe(1);
  });

  it('S09: option km are rounded up to whole cells', () => {
    const costs = dpCosts(
      prepare([{ key: 'x', options: [option(2.2, 1), option(0, 5)] }], 1),
      0,
    );
    expect(costs?.[3]).toBe(1);
    expect(costs?.[2]).toBe(Infinity);
  });
});

describe('TC10: warranty budget as a target', () => {
  // 24 workdays groups: driving electric saves 50 EUR and costs 1,000 km.
  const groups: Group[] = Array.from({ length: 24 }, (_, i) => ({
    key: `g${i}`,
    options: [option(1000, 50), option(0, 100)],
  }));

  it('TC10: the optimum is 24,000 km without a budget', () => {
    const result = solve(input({ groups }));
    expect(result).toMatchObject({ status: 'ok', evKmPerYear: 24000 });
  });

  it('TC10: with a budget of 20,000 km the cheapest plan within it is chosen and its extra cost is shown', () => {
    const trace = new Trace();
    const result = solve(input({ groups, budgetKmPerYear: 20000 }), trace);
    expect(result).toMatchObject({
      status: 'ok',
      evKmPerYear: 20000,
      budgetExtraCost: 4 * 50,
      budgetExceeded: false,
    });
    expect(trace.entries.map((e) => e.formula)).toContain(
      'OPT.budgetExtraCost',
    );
  });

  it('TC10: when the optimum lies within the budget there is no extra cost', () => {
    const result = solve(input({ groups, budgetKmPerYear: 30000 }));
    expect(result).toMatchObject({ evKmPerYear: 24000, budgetExtraCost: 0 });
  });

  it('TC10: if the plan forces more km than the budget, the smallest feasible distance is chosen with a warning', () => {
    const forced: Group[] = [
      { key: 'both', options: [option(900, 10), option(700, 30)] },
    ];
    const result = solve(input({ groups: forced, budgetKmPerYear: 500 }));
    expect(result).toMatchObject({
      status: 'ok',
      evKmPerYear: 700,
      budgetExceeded: true,
    });
  });
});

describe('S09: tie rule (spec step 5)', () => {
  const groups: Group[] = [
    { key: 'a', options: [option(0, 100), option(1000, 100 + TIE_BAND / 2)] },
  ];

  it('S09: costs within 0.01 EUR tie, the larger smallest reserve wins before the smaller distance', () => {
    const result = solve(
      input({ groups, reserveAtSoh: (soh) => -soh }), // the lower SoH has the larger "reserve"
    );
    expect(result).toMatchObject({ status: 'ok', evKmPerYear: 1000 });
  });

  it('S09: on equal reserve the smaller EV distance wins', () => {
    const result = solve(input({ groups, reserveAtSoh: () => 1 }));
    expect(result).toMatchObject({ status: 'ok', evKmPerYear: 0 });
  });

  it('S09: a difference above the band is not a tie', () => {
    const cheaper: Group[] = [
      { key: 'a', options: [option(0, 100), option(1000, 100 - 0.02)] },
    ];
    const result = solve(input({ groups: cheaper, reserveAtSoh: (s) => s }));
    expect(result).toMatchObject({ evKmPerYear: 1000 });
  });
});

describe('S09: unsuitable', () => {
  const sohHigh = () => 0.9;

  it('S09: a group with no allowed option makes the offer unsuitable (cause groups)', () => {
    const result = solve(
      input({
        groups: [{ key: 'both', options: [option(5, 1, 0), option(6, 1, 1)] }],
        thresholds: [0.95, 0.99],
        sohForKmPerYear: sohHigh,
      }),
    );
    expect(result).toMatchObject({ status: 'unsuitable', cause: 'groups' });
  });

  it('S09: strict mode fails when a pair is not allowed although the car could rest', () => {
    const groups: Group[] = [
      { key: 'onlyA', options: [option(5, 1, 0), option(0, 9)] },
    ];
    const base = input({
      groups,
      thresholds: [0.95],
      sohForKmPerYear: sohHigh,
    });
    expect(solve(base)).toMatchObject({ status: 'ok', evKmPerYear: 0 });
    expect(solve({ ...base, strict: true })).toMatchObject({
      status: 'unsuitable',
      cause: 'strict',
      bestSoh: 0.9,
    });
  });
});

describe('S09: SoH coupling', () => {
  it('S09: driving more lowers the SoH and can switch an option off', () => {
    // Two groups, each option needs pair 0 (threshold 0.9). 1,000 km per year per
    // group is fine at 2,000 km (SoH 0.8 by the grid) only if the threshold holds.
    const groups: Group[] = [
      { key: 'a', options: [option(600, 1, 0), option(0, 9)] },
      { key: 'b', options: [option(600, 1, 0), option(0, 9)] },
    ];
    const result = solve(
      input({
        groups,
        thresholds: [0.9],
        // 0.95 up to 750 km (bucket 3 x 250), 0.85 above
        sohForKmPerYear: (km) => (km <= 750 ? 0.95 : 0.85),
      }),
    );
    // Both on: 1,200 km, SoH 0.85 < 0.9, not allowed. One on: 600 km is allowed.
    expect(result).toMatchObject({ status: 'ok', evKmPerYear: 600 });
  });
});

describe('TC13 / Q4: dynamic programming against brute force', () => {
  const same = (solved: ReturnType<typeof solve>, input: SolverInput) => {
    const reference = bruteForce(input);
    expect(solved.status).toBe(reference.status);
    if (solved.status === 'ok' && reference.status === 'ok') {
      expect(solved.targetCost).toBeCloseTo(reference.targetCost, 9);
    }
  };

  it('TC13: two weekdays and two months give the same cost as the full search', () => {
    // Groups (weekday, month): driving needs the pair of its month.
    const month = (m: number): Option => option(400, 20, m);
    const groups: Group[] = [
      { key: 'mon:0', options: [month(0), option(0, 60)] },
      { key: 'mon:1', options: [month(1), option(0, 55)] },
      { key: 'tue:0', options: [month(0), option(0, 70)] },
      { key: 'tue:1', options: [month(1), option(0, 65)] },
    ];
    const problem = input({
      groups,
      thresholds: [0.93, 0.8],
      sohForKmPerYear: (km) => 1 - km / 8000,
      offerCost: (km) => 1000 + Math.max(0, km - 800) * 0.5,
    });
    same(solve(problem), problem);
  });

  it('Q4: 1,000 random small cases give the same cost', () => {
    const pairs = fc.integer({ min: 1, max: 4 });
    const problem = pairs.chain((pairCount) =>
      fc.record({
        groups: fc.array(
          fc.record({
            key: fc.constant('g'),
            options: fc.array(
              fc.record({
                km: fc.integer({ min: 0, max: 40 }),
                cost: fc.integer({ min: 0, max: 100 }),
                needs: fc.option(fc.integer({ min: 0, max: pairCount - 1 }), {
                  nil: null,
                }),
                choice: fc.constant('x'),
              }),
              { minLength: 1, maxLength: 3 },
            ),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        thresholds: fc.array(fc.double({ min: 0.4, max: 1.1, noNaN: true }), {
          minLength: pairCount,
          maxLength: pairCount,
        }),
        slope: fc.double({ min: 0.001, max: 0.02, noNaN: true }),
        gridKm: fc.constantFrom(1, 5, 10, 25),
        budget: fc.option(fc.integer({ min: 0, max: 200 }), { nil: null }),
        strict: fc.boolean(),
        base: fc.integer({ min: 0, max: 500 }),
        tier: fc.integer({ min: 0, max: 100 }),
        extra: fc.integer({ min: 0, max: 5 }),
      }),
    );
    fc.assert(
      fc.property(problem, (p) => {
        const solverInput = input({
          groups: p.groups,
          thresholds: p.thresholds,
          sohForKmPerYear: (km) => Math.max(0, 1 - p.slope * km),
          budgetKmPerYear: p.budget,
          strict: p.strict,
          gridKm: p.gridKm,
          offerCost: (km) => p.base + p.extra * Math.max(0, km - p.tier),
        });
        same(solve(solverInput), solverInput);
      }),
      { numRuns: 1000 },
    );
  });
});
