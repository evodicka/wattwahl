import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bruteForce } from './__tests__/bruteForce';
import { Trace } from '../trace';
import { dpCosts, dpTable, prepare, reconstruct } from './knapsack';
import { createSolver, solve, TIE_BAND } from './select';
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

describe('S09: exact distance per cell (rounding up must not misjudge a plan)', () => {
  // Ten groups; driving costs 1 instead of 2 and 0.6 km each. Each option
  // rounds up to one 1 km cell, so ten driven groups count as 10 cells but are
  // only 6 km.
  const groups: Group[] = Array.from({ length: 10 }, (_, i) => ({
    key: `g${i}`,
    options: [option(0.6, 1), option(0, 2)],
  }));
  const flatSoh = () => 1;

  it('S09: a plan of 6 km fits a 7 km budget although it counts 10 cells', () => {
    const result = solve(
      input({ groups, sohForKmPerYear: flatSoh, budgetKmPerYear: 7 }),
    );
    expect(result).toMatchObject({
      status: 'ok',
      budgetExceeded: false,
      budgetExtraCost: 0,
      variableCost: 10,
    });
    expect((result as { evKmPerYear: number }).evKmPerYear).toBeCloseTo(6, 9);
  });

  it('S09: the offer cost is judged at the exact 6 km, not at the 10 cells', () => {
    // A surcharge above 6.5 km: charged for 10 cells, not for 6 km.
    const result = solve(
      input({
        groups,
        sohForKmPerYear: flatSoh,
        offerCost: (km) => (km > 6.5 ? 1000 : 0),
      }),
    );
    expect(result).toMatchObject({ status: 'ok', variableCost: 10 });
    // The decision and the reported cost agree.
    expect((result as { targetCost: number }).targetCost).toBe(10);
  });

  it('S09: at exactly equal cost the plan with fewer exact km is kept', () => {
    const tied: Group[] = [
      { key: 'x', options: [option(1.9, 5), option(1.2, 5)] },
    ];
    const table = dpTable(prepare(tied, 1), 0);
    expect(table?.cost[2]).toBe(5);
    expect(table?.km[2]).toBe(1.2);
    expect(reconstruct(prepare(tied, 1), 0, 2)).toEqual([1]);
  });

  it('S09: forced over budget picks the smallest exact distance among the cells', () => {
    const forced: Group[] = [
      // 2.4 km is 3 cells and dearer, 3.6 km is 4 cells and cheaper.
      { key: 'f', options: [option(3.6, 1), option(2.4, 9)] },
    ];
    const result = solve(
      input({ groups: forced, sohForKmPerYear: flatSoh, budgetKmPerYear: 1 }),
    );
    expect(result).toMatchObject({ status: 'ok', budgetExceeded: true });
    expect((result as { evKmPerYear: number }).evKmPerYear).toBe(2.4);
  });
});

describe('S09: tie band edges', () => {
  const reserveLikesLongRuns = (soh: number) => -soh;

  it('S09: a cost exactly one band above the minimum still ties', () => {
    const groups: Group[] = [
      { key: 'a', options: [option(0, 100), option(1000, 100 + TIE_BAND)] },
    ];
    const result = solve(input({ groups, reserveAtSoh: reserveLikesLongRuns }));
    expect(result).toMatchObject({ status: 'ok', evKmPerYear: 1000 });
  });

  it('S09: the band is measured from the cheapest plan, not chained from plan to plan', () => {
    // 100.000, 100.008 and 100.016: each is within a band of the next, but
    // the last is not within a band of the cheapest.
    const groups: Group[] = [
      {
        key: 'a',
        options: [option(0, 100), option(1000, 100.008), option(2000, 100.016)],
      },
    ];
    const result = solve(input({ groups, reserveAtSoh: reserveLikesLongRuns }));
    expect(result).toMatchObject({ status: 'ok', evKmPerYear: 1000 });
  });
});

describe('S09: knapsack guards', () => {
  const prep = prepare(
    [{ key: 'x', options: [option(5, 1), option(0, 2)] }],
    1,
  );

  it('S09: reconstruct rejects cells outside the table and unreachable cells', () => {
    expect(() => reconstruct(prep, 0, -1)).toThrow(RangeError);
    expect(() => reconstruct(prep, 0, 6)).toThrow(RangeError);
    expect(() => reconstruct(prep, 0, 3)).toThrow(RangeError);
    expect(reconstruct(prep, 0, 5)).toEqual([0]);
  });

  it('S09: a group may have many options (steps below 0.4 % need more than 255)', () => {
    const many: Group = {
      key: 'many',
      options: Array.from({ length: 1001 }, (_, i) => option(i / 10, 1000 - i)),
    };
    const costs = dpCosts(prepare([many], 0.1), 0);
    expect(costs?.[1000]).toBe(0);
    expect(costs?.[0]).toBe(1000);
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
  const same = (problem: SolverInput) => {
    const solved = solve(problem);
    const reference = bruteForce(problem);
    expect(solved.status).toBe(reference.status);
    if (solved.status !== 'ok' || reference.status !== 'ok') return;
    // The plan itself can differ between equally cheap combinations, but its
    // exact distance, cost and budget flags cannot.
    expect(solved.evKmPerYear).toBe(reference.evKmPerYear);
    expect(solved.targetCost).toBe(reference.targetCost);
    expect(solved.budgetExtraCost).toBe(reference.budgetExtraCost);
    expect(solved.budgetExceeded).toBe(reference.budgetExceeded);
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
    same(
      input({
        groups,
        thresholds: [0.93, 0.8],
        sohForKmPerYear: (km) => 1 - km / 8000,
        offerCost: (km) => 1000 + Math.max(0, km - 800) * 0.5,
      }),
    );
  });

  it('Q4: 100,000 random small cases give the same cost, distance and budget result', () => {
    // Costs in 1/256 EUR so that costs within the 0.01 tie band occur and all
    // sums are exact in binary (no float noise decides a tie), km in halves so
    // that the rounding up to cells matters, and a reserve that is not
    // monotone in the SoH so that the tie rule has something to decide.
    const money = fc.integer({ min: 0, max: 25600 }).map((n) => n / 256);
    const pairs = fc.integer({ min: 1, max: 4 });
    const problem = pairs.chain((pairCount) =>
      fc.record({
        groups: fc.array(
          fc.record({
            key: fc.constant('g'),
            options: fc.array(
              fc.record({
                km: fc.integer({ min: 0, max: 80 }).map((n) => n / 2),
                cost: money,
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
        cellKm: fc.constantFrom(1, 2),
        budget: fc.option(fc.integer({ min: 0, max: 200 }), { nil: null }),
        strict: fc.boolean(),
        base: money,
        tier: fc.integer({ min: 0, max: 100 }),
        extra: fc.integer({ min: 0, max: 5 }),
        reserveStep: fc.constantFrom(5, 20, 50),
      }),
    );
    fc.assert(
      fc.property(problem, (p) => {
        same(
          input({
            groups: p.groups,
            thresholds: p.thresholds,
            sohForKmPerYear: (km) => Math.max(0, 1 - p.slope * km),
            reserveAtSoh: (soh) => Math.round(soh * p.reserveStep) % 3,
            budgetKmPerYear: p.budget,
            strict: p.strict,
            gridKm: p.gridKm,
            cellKm: p.cellKm,
            offerCost: (km) => p.base + p.extra * Math.max(0, km - p.tier),
          }),
        );
      }),
      { numRuns: 100000 },
    );
  });
});

describe('S09: a solver shared by several offers', () => {
  const groups: Group[] = Array.from({ length: 6 }, (_, i) => ({
    key: `g${i}`,
    options: [option(300, 20 + i, 0), option(0, 50)],
  }));
  const setup = input({
    groups,
    thresholds: [0.9],
    sohForKmPerYear: (km) => 1 - km / 20000,
  });
  const offers = [
    { offerCost: () => 500 },
    { offerCost: (km: number) => 400 + Math.max(0, km - 900) * 2 },
    { offerCost: () => 300, strict: true },
    { offerCost: () => 300, budgetKmPerYear: 600 },
  ];

  it('S09: createSolver gives each offer the result a fresh solve gives', () => {
    const shared = createSolver(setup);
    for (const change of offers) {
      const offer = { ...setup, ...change };
      expect(shared.solve(offer)).toEqual(solve(offer));
    }
  });

  it('S09: asking twice gives the same answer (the cache does not leak between offers)', () => {
    const shared = createSolver(setup);
    const first = shared.solve({ ...setup, ...offers[1] });
    shared.solve({ ...setup, ...offers[3] });
    expect(shared.solve({ ...setup, ...offers[1] })).toEqual(first);
  });
});
