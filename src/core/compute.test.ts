import { describe, expect, it } from 'vitest';
import {
  exampleCandidateCompute,
  exampleScenario,
  exampleScenarioCompute,
} from '../../tests/fixtures/exampleScenario';
import {
  CandidateComputeSchema,
  OfferResultSchema,
  ScenarioComputeSchema,
  TraceEntrySchema,
  createCandidateTemplate,
  listOffers,
  type Offer,
  type OfferResult,
  type OkOfferResult,
  type PriceCase,
  type Scenario,
  type TraceEntry,
} from '../domain';
import { expectSpec } from '../../tests/helpers/specTolerance';
import { resolvePrices } from './calc/prices';
import {
  ComputeCache,
  canonicalJson,
  computeOffer,
  hashResult,
  Trace,
} from './index';
import { optimizeOffer } from './optimizer/optimize';
import { buildProblem } from './optimizer/problem';

const CASES = ['mid', 'evFavorable', 'evUnfavorable'] as const;
const SLIDER = {
  petrol: 2.5,
  electricity: 0.4,
  petrolEscalationPct: 3,
  electricityEscalationPct: 2,
};

const first = <T>(items: readonly T[]): T => {
  const [item] = items;
  if (item === undefined) throw new Error('Expected at least one item.');
  return item;
};
const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`No item at ${index}.`);
  return item;
};
const offersOf = (scenario: Scenario): Offer[] =>
  scenario.candidates.flatMap((candidate) => listOffers(candidate));
const ok = (result: OfferResult): OkOfferResult => {
  if (result.status !== 'ok') {
    throw new Error(`Expected an ok result, got ${result.status}.`);
  }
  return result;
};

/**
 * The example candidate as the used car of TC18: first registration 03/2022,
 * reference month 03/2025, 80,000 km, vehicle 3 years / 100,000 km, battery
 * 6 years / 140,000 km.
 */
function makeTc18(scenario: Scenario): void {
  scenario.parameters.warrantyReferenceMonth = { month: 3, year: 2025 };
  const candidate = first(scenario.candidates);
  candidate.condition = 'used';
  candidate.firstRegistration = { month: 3, year: 2022 };
  candidate.mileageKm = 80000;
  candidate.vehicleWarranty = { years: 3, km: 100000 };
  candidate.batteryWarranty = { years: 6, km: 140000 };
}

const LABELS = new Set(['month', 'comparisonMonths']);

/** Paths of all numbers in a result, such as `reserves[3].reserveKm`; labels (month, comparison period) are not results. */
function numericLeaves(value: unknown, path = ''): string[] {
  if (typeof value === 'number') return [path];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      numericLeaves(item, `${path}[${index}]`),
    );
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      LABELS.has(key)
        ? []
        : numericLeaves(item, path === '' ? key : `${path}.${key}`),
    );
  }
  return [];
}

/** The value at a path written like `reserves[3].reserveKm`. */
function valueAt(root: unknown, path: string): unknown {
  return path
    .split(/[.[\]]+/)
    .filter((part) => part !== '')
    .reduce<unknown>(
      (node, part) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      root,
    );
}

describe('Q6: every number of the result has a Rechenweg entry', () => {
  const allWeek = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
  const variants: [string, (scenario: Scenario) => void][] = [
    ['example (budget met, extra mileage)', () => undefined],
    [
      'budget exceeded',
      (s) => {
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
      },
    ],
    [
      'no warranty',
      (s) => {
        const candidate = first(s.candidates);
        candidate.vehicleWarranty = { years: 0, km: 0 };
        candidate.batteryWarranty = { years: 0, km: 0 };
      },
    ],
    [
      'fixed extra share',
      (s) => {
        s.parameters.extraMileageMode = 'fixed';
        s.parameters.extraMileageFixedEvSharePct = 40;
      },
    ],
    [
      'no extra mileage',
      (s) => {
        s.extraMileage.kmPerMonth = { city: 0, rural: 0, highway: 0 };
      },
    ],
    [
      'strict mode',
      (s) => {
        s.parameters.strictMode = true;
      },
    ],
    [
      'budget as no target',
      (s) => {
        s.parameters.warrantyBudgetAsTarget = false;
      },
    ],
    ['used car with a derived remaining warranty (TC18)', makeTc18],
  ];

  it.each(variants)(
    'Q6: %s: every number is linked to exactly one entry that holds that very value',
    (_name, change) => {
      const scenario = exampleScenario();
      change(scenario);
      for (const priceCase of CASES) {
        for (const offer of offersOf(scenario)) {
          const trace = new Trace();
          const result = ok(
            computeOffer(scenario, offer, priceCase, { trace }),
          );
          const linked = new Map<string, TraceEntry[]>();
          for (const entry of trace.entries) {
            if (entry.resultPath === undefined) continue;
            linked.set(entry.resultPath, [
              ...(linked.get(entry.resultPath) ?? []),
              entry,
            ]);
          }
          const leaves = numericLeaves(result);
          expect(leaves.length).toBeGreaterThan(40);
          for (const leaf of leaves) {
            const entries = linked.get(leaf) ?? [];
            expect(
              entries,
              `${offer.offerId} ${priceCase}: ${leaf}`,
            ).toHaveLength(1);
            const entry = entries[0];
            // A valid entry with a formula ID from architecture 8.4 ...
            expect(TraceEntrySchema.safeParse(entry).success).toBe(true);
            // ... that holds the number the result shows, not just any entry of that formula.
            expect(entry?.value, `${offer.offerId} ${priceCase}: ${leaf}`).toBe(
              valueAt(result, leaf),
            );
          }
          // And no link points at a number the result does not have.
          for (const path of linked.keys()) {
            expect(leaves, `dangling link ${path}`).toContain(path);
          }
        }
      }
    },
  );

  it('Q6: the fixtures reach the numbers the plain example does not have', () => {
    const exceeded = exampleScenario();
    variants[1]?.[1](exceeded);
    const result = ok(computeOffer(exceeded, first(offersOf(exceeded)), 'mid'));
    expect(result.warranty.budgetExceeded).toBe(true);
    expect(numericLeaves(result)).toContain('warranty.yearsToKmLimit.vehicle');
    expect(numericLeaves(result)).toContain('extraSharePct[0]');
  });

  it('Q6: the Rechenweg also holds the intermediate values, not only the linked ones', () => {
    const trace = new Trace();
    computeOffer(exampleScenario(), first(offersOf(exampleScenario())), 'mid', {
      trace,
    });
    const formulas = new Set(trace.entries.map((entry) => entry.formula));
    for (const formula of [
      'F1.R',
      'F1.RStar',
      'F3.phi',
      'F4.c',
      'F4.Egrid',
      'F5.f',
      'F5.days',
      'F7.Fb',
      'F7.Fs',
      'F7.Fm',
      'F8.purchase',
      'F8.energy',
      'OPT.threshold',
      'OPT.budget',
    ] as const) {
      expect(formulas, formula).toContain(formula);
    }
  });
});

describe('S10: a trace does not change the result', () => {
  const scenario = exampleScenario();

  it('S10: results with and without a trace, and with and without a cache, are identical', () => {
    const cache = new ComputeCache();
    for (const priceCase of CASES) {
      for (const offer of offersOf(scenario)) {
        const plain = computeOffer(scenario, offer, priceCase);
        expect(
          computeOffer(scenario, offer, priceCase, { trace: new Trace() }),
        ).toEqual(plain);
        expect(computeOffer(scenario, offer, priceCase, { cache })).toEqual(
          plain,
        );
      }
    }
  });

  it('S10: asking a cached computer twice gives the same result', () => {
    const cache = new ComputeCache();
    const offer = first(offersOf(scenario));
    const once = computeOffer(scenario, offer, 'mid', { cache });
    expect(computeOffer(scenario, offer, 'mid', { cache })).toEqual(once);
  });
});

describe('Q5: determinism (in Node)', () => {
  const scenario = exampleScenario();

  it('Q5: the same input gives the same result hash twice', () => {
    const run = () =>
      offersOf(scenario).flatMap((offer) =>
        CASES.map((priceCase) => computeOffer(scenario, offer, priceCase)),
      );
    expect(canonicalJson(run())).toBe(canonicalJson(run()));
    expect(hashResult(run())).toBe(hashResult(run()));
  });

  it('Q5: a different input gives a different hash', () => {
    const offer = first(offersOf(scenario));
    const changed = exampleScenario();
    changed.iceVehicle.petrolPrice = { min: 1.7, mid: 1.95, max: 2.1 };
    expect(hashResult(computeOffer(changed, offer, 'mid'))).not.toBe(
      hashResult(computeOffer(scenario, offer, 'mid')),
    );
  });

  it('Q5: the same input with the same reference month gives the same hash; another reference month changes a used car', () => {
    const used = exampleScenario();
    makeTc18(used);
    const offer = first(offersOf(used));
    const same = exampleScenario();
    makeTc18(same);
    expect(hashResult(computeOffer(used, offer, 'mid'))).toBe(
      hashResult(computeOffer(same, offer, 'mid')),
    );
    const later = exampleScenario();
    makeTc18(later);
    later.parameters.warrantyReferenceMonth = { month: 9, year: 2025 };
    expect(hashResult(computeOffer(later, offer, 'mid'))).not.toBe(
      hashResult(computeOffer(used, offer, 'mid')),
    );
  });

  it('Q5: -0, NaN and null are different values with different texts', () => {
    expect(canonicalJson(-0)).not.toBe(canonicalJson(0));
    expect(canonicalJson(Number.NaN)).not.toBe(canonicalJson(null));
    expect(canonicalJson(Number.POSITIVE_INFINITY)).not.toBe(
      canonicalJson(Number.NEGATIVE_INFINITY),
    );
    expect(hashResult({ x: -0 })).not.toBe(hashResult({ x: 0 }));
    expect(canonicalJson({ b: 1.5, a: [0.1, -2e-7], u: 'ä' })).toBe(
      '{"a":[0.1,-2e-7],"b":1.5,"u":"ä"}',
    );
  });

  it('Q5: the hash does not depend on the order of the keys', () => {
    expect(hashResult({ a: 1, b: [1, 2], c: { d: 0.1 } })).toBe(
      hashResult({ c: { d: 0.1 }, b: [1, 2], a: 1 }),
    );
    expect(hashResult({ a: 0.1 })).not.toBe(
      hashResult({ a: 0.1 + 1e-16 + 1e-17 }),
    );
  });
});

describe('S10: incomplete candidates', () => {
  const emptyCandidate = () =>
    createCandidateTemplate('00000000-0000-4000-8000-0000000000aa');

  it('S10: an incomplete candidate gets the missing field paths, the complete one a normal result', () => {
    const scenario = exampleScenario();
    scenario.candidates.push({ ...emptyCandidate(), name: 'Empty' });
    const good = at(scenario.candidates, 0);
    const empty = at(scenario.candidates, 1);
    const goodResult = computeOffer(scenario, first(listOffers(good)), 'mid');
    const emptyResult = computeOffer(scenario, first(listOffers(empty)), 'mid');

    expect(goodResult.status).toBe('ok');
    expect(emptyResult.status).toBe('incomplete');
    if (emptyResult.status !== 'incomplete') return;
    const paths = emptyResult.issues.map((issue) => issue.path);
    expect(paths).toContain('candidates[1].purchasePrice');
    expect(paths).toContain('candidates[1].netCapacityKwh');
    expect(paths).toContain('candidates[1].rangeKm.city.mild');
  });

  it('S10: one incomplete lease tier makes every offer of the candidate incomplete', () => {
    const scenario = exampleScenario();
    const candidate = first(scenario.candidates);
    const tier = first(candidate.leaseTiers);
    tier.monthlyRate = null;
    for (const offer of listOffers(candidate)) {
      const result = computeOffer(scenario, offer, 'mid');
      expect(result.status).toBe('incomplete');
      if (result.status !== 'incomplete') continue;
      expect(result.issues.map((issue) => issue.path)).toEqual([
        'candidates[0].leaseTiers[0].monthlyRate',
      ]);
    }
  });

  it('S10: a gap in the driving profile blocks every candidate and names the field', () => {
    const scenario = exampleScenario();
    scenario.candidates.push({
      ...first(exampleScenario().candidates),
      id: '00000000-0000-4000-8000-0000000000bb',
      leaseTiers: [],
    });
    scenario.iceVehicle.petrolPrice.min = null;
    for (const candidate of scenario.candidates) {
      const result = computeOffer(
        scenario,
        first(listOffers(candidate)),
        'mid',
      );
      expect(result.status).toBe('incomplete');
      if (result.status !== 'incomplete') continue;
      expect(result.issues.map((issue) => issue.path)).toContain(
        'iceVehicle.petrolPrice.min',
      );
    }
  });
});

describe('S10: unsuitable', () => {
  it('S10: an offer no plan can serve is unsuitable with the reason, and parses', () => {
    const scenario = exampleScenario();
    scenario.workplaces.a = {
      ...scenario.workplaces.a,
      weekdays: ['mon'],
      freeDaysPerYear: 0,
      commute: { city: 0, rural: 0, highway: 80 },
    };
    scenario.workplaces.b = {
      ...scenario.workplaces.b,
      weekdays: ['mon'],
      freeDaysPerYear: 0,
      commute: { city: 0, rural: 0, highway: 80 },
    };
    scenario.parameters.monthlyTempC = Array.from({ length: 12 }, () => 23);
    scenario.parameters.monthlyTempC[0] = -10;
    scenario.parameters.sohReference = 'start';
    const result = computeOffer(scenario, first(offersOf(scenario)), 'mid');
    expect(result.status).toBe('unsuitable');
    if (result.status !== 'unsuitable') return;
    expect(result.reason).toMatchObject({
      kind: 'both',
      weekday: 'mon',
      month: 0,
    });
    expect(OfferResultSchema.safeParse(result).success).toBe(true);
  });
});

describe('S10: price cases in the Rechenweg', () => {
  const scenario = exampleScenario();
  const offer = first(offersOf(scenario));

  const pricesOf = (priceCase: PriceCase, sliderPrices?: typeof SLIDER) => {
    const trace = new Trace();
    computeOffer(scenario, offer, priceCase, { trace, sliderPrices });
    const price = (carrier: string) =>
      trace.entries.find(
        (entry) =>
          entry.formula === 'F8.energy' && entry.inputs.carrier === carrier,
      )?.inputs.price;
    return { petrol: price('petrol'), electricity: price('electricity') };
  };

  it('S10: "mid" shows the mid prices', () => {
    expect(pricesOf('mid')).toEqual({ petrol: 1.9, electricity: 0.3 });
  });

  it('S10: "E-Auto günstig" shows the maximum petrol and the minimum electricity price', () => {
    expect(pricesOf('evFavorable')).toEqual({ petrol: 2.1, electricity: 0.25 });
  });

  it('S10: "E-Auto ungünstig" shows the minimum petrol and the maximum electricity price', () => {
    expect(pricesOf('evUnfavorable')).toEqual({
      petrol: 1.7,
      electricity: 0.35,
    });
  });

  it('S10: the slider case shows the slider prices and gives other costs than "mid"', () => {
    expect(pricesOf('slider', SLIDER)).toEqual({
      petrol: 2.5,
      electricity: 0.4,
    });
    const mid = ok(computeOffer(scenario, offer, 'mid'));
    const slider = ok(
      computeOffer(scenario, offer, 'slider', { sliderPrices: SLIDER }),
    );
    expect(slider.costs.total).not.toBe(mid.costs.total);
  });

  it('S10: the slider case without slider prices is a programming error', () => {
    expect(() => computeOffer(scenario, offer, 'slider')).toThrow(RangeError);
  });

  it('S10: without a budget a dearer petrol price never lowers the EV km', () => {
    // With the warranty budget as a target both cases stop near the budget and
    // differ only by rounding, so the property is checked without it.
    const free = exampleScenario();
    free.parameters.warrantyBudgetAsTarget = false;
    const cheap = ok(computeOffer(free, offer, 'evUnfavorable'));
    const dear = ok(computeOffer(free, offer, 'evFavorable'));
    expect(dear.evKmPerYear).toBeGreaterThanOrEqual(cheap.evKmPerYear - 1e-9);
  });
});

describe('S10: the result agrees with the optimizer and with itself', () => {
  const scenario = exampleScenario();

  it('S10: total cost and EV km equal the optimizer target for purchase and lease', () => {
    const compute = exampleScenarioCompute();
    const candidate = exampleCandidateCompute();
    const prices = resolvePrices(compute.iceVehicle, compute.parameters, {
      priceCase: 'mid',
    });
    const problem = buildProblem(compute, candidate, prices);
    const tier = first(candidate.leaseTiers);
    for (const [offer, terms] of [
      [first(offersOf(scenario)), { kind: 'purchase' }],
      [offersOf(scenario)[1], { kind: 'lease', tier }],
    ] as const) {
      const direct = optimizeOffer(compute, candidate, problem, terms);
      if (direct.status !== 'ok' || !offer) throw new Error('expected a plan');
      const result = ok(computeOffer(scenario, offer, 'mid'));
      expect(result.costs.total).toBeCloseTo(direct.targetCost, 6);
      expect(result.evKmPerYear).toBe(direct.evKmPerYear);
    }
  });

  it('S10: the EV only drives ways whose reserve is not negative at the checked SoH', () => {
    for (const priceCase of CASES) {
      for (const offer of offersOf(scenario)) {
        const result = ok(computeOffer(scenario, offer, priceCase));
        for (const cell of result.plan) {
          if (cell.choice === 'rest') continue;
          const way = cell.choice === 'evA' ? 'a' : 'b';
          const reserve = result.reserves.find(
            (r) => r.way === way && r.month === cell.month,
          );
          expect(reserve?.reserveKm).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
  });

  it('S10: K_EV + K_ICE is the same for every offer, and the SoH never rises over the comparison', () => {
    const purchase = ok(
      computeOffer(scenario, first(offersOf(scenario)), 'mid'),
    );
    const lease = ok(
      computeOffer(scenario, first(offersOf(scenario).slice(1)), 'mid'),
    );
    expect(purchase.evKmPerYear + purchase.iceKmPerYear).toBeCloseTo(
      lease.evKmPerYear + lease.iceKmPerYear,
      6,
    );
    // New car: SoH 1 at the start, so the end value is at most 1; with the
    // check at the end of the comparison both are the same number.
    expect(purchase.sohEnd).toBeLessThanOrEqual(1);
    expect(purchase.sohCheck).toBe(purchase.sohEnd);
    const atStart = exampleScenario();
    atStart.parameters.sohReference = 'start';
    const early = ok(computeOffer(atStart, first(offersOf(atStart)), 'mid'));
    expect(early.sohCheck).toBeGreaterThanOrEqual(early.sohEnd);
  });

  it('S10: the smallest reserve is the smallest cell among the ways the plan drives, and not negative', () => {
    for (const priceCase of CASES) {
      for (const offer of offersOf(scenario)) {
        const result = ok(computeOffer(scenario, offer, priceCase));
        const drivenCells = result.reserves.filter((cell) =>
          result.plan.some(
            (p) =>
              p.month === cell.month &&
              p.choice === (cell.way === 'a' ? 'evA' : 'evB'),
          ),
        );
        const min = result.minReserve;
        if (!min) throw new Error('The EV drives in the example.');
        const cell = drivenCells.find(
          (c) => c.way === min.way && c.month === min.month,
        );
        expect(cell).toBeDefined();
        expect(min.reserveKm).toBe(cell?.reserveKm);
        expect(min.reservePct).toBe(cell?.reservePct);
        expect(drivenCells.every((c) => c.reservePct >= min.reservePct)).toBe(
          true,
        );
        expect(min.reserveKm).toBeGreaterThanOrEqual(-1e-9);
        expect(min.reservePct).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('S10: every kind of result parses with the result schema, and a broken one does not', () => {
    const result = computeOffer(scenario, first(offersOf(scenario)), 'mid');
    expect(OfferResultSchema.safeParse(result).success).toBe(true);
    expect(
      OfferResultSchema.safeParse({ ...result, reserves: [] }).success,
    ).toBe(false);
    expect(
      OfferResultSchema.safeParse({ ...result, status: 'maybe' }).success,
    ).toBe(false);
    const incomplete = exampleScenario();
    first(incomplete.candidates).purchasePrice = null;
    expect(
      OfferResultSchema.safeParse(
        computeOffer(incomplete, first(offersOf(incomplete)), 'mid'),
      ).success,
    ).toBe(true);
  });

  it('S10: an offer of an unknown candidate or lease tier is a programming error', () => {
    const offer = first(offersOf(scenario));
    expect(() =>
      computeOffer(scenario, { ...offer, candidateId: 'nope' }, 'mid'),
    ).toThrow(RangeError);
    expect(() =>
      computeOffer(
        scenario,
        {
          kind: 'lease',
          offerId: 'x',
          candidateId: offer.candidateId,
          leaseTierId: 'nope',
        },
        'mid',
      ),
    ).toThrow(RangeError);
  });
});

describe('S10: cost parts against the spec', () => {
  const scenario = exampleScenario();

  it('TC7: the purchase of 40,000 EUR at 15 % over 48 months costs 19,119.75 EUR', () => {
    const result = ok(computeOffer(scenario, first(offersOf(scenario)), 'mid'));
    expectSpec(result.costs.acquisition, '19.119,75');
  });

  it('TC8: the lease is 16,364 EUR for rate and down payment plus the settlement of the km', () => {
    // Rate 399, down payment 2,000, term 36, tier 15,000 km, extra 0.08 and refund 0.04 EUR/km.
    const lease = exampleScenario();
    lease.parameters.comparisonMonths = 36;
    const result = ok(computeOffer(lease, at(offersOf(lease), 1), 'mid'));
    const km = result.evKmPerYear;
    const settlement =
      3 * (Math.max(0, km - 15000) * 0.08 - Math.max(0, 15000 - km) * 0.04);
    expectSpec(result.costs.acquisition - settlement, '16.364');
  });

  it('S10: the cost parts are what the formulas give for the plan', () => {
    const result = ok(computeOffer(scenario, first(offersOf(scenario)), 'mid'));
    const { costs } = result;
    expect(costs.total).toBe(
      costs.acquisition + costs.electricity + costs.petrol + costs.maintenance,
    );
    // Maintenance: 4 years, EV 0.02 and petrol car 0.04 EUR/km on their km.
    expect(costs.maintenance).toBeCloseTo(
      4 * (0.02 * result.evKmPerYear + 0.04 * result.iceKmPerYear),
      6,
    );
    // Petrol: only the km the petrol car drives cost petrol, so all-EV would save it.
    expect(costs.petrol).toBeGreaterThan(0);
    expect(costs.electricity).toBeGreaterThan(0);
  });
});

describe('S10: warranty, extra mileage and echo of the result', () => {
  it('S10: a plan forced over the budget warns and gives the years to each km limit', () => {
    const scenario = exampleScenario();
    const allWeek = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
    scenario.workplaces.a = {
      ...scenario.workplaces.a,
      weekdays: [...allWeek],
      freeDaysPerYear: 0,
    };
    scenario.workplaces.b = {
      ...scenario.workplaces.b,
      weekdays: [...allWeek],
      freeDaysPerYear: 0,
    };
    const result = ok(computeOffer(scenario, first(offersOf(scenario)), 'mid'));
    expect(result.warranty).toMatchObject({
      budgetKmPerYear: 20000,
      budgetExceeded: true,
      noWarranty: false,
    });
    expect(result.warnings).toEqual(['budgetExceeded']);
    expect(result.evKmPerYear).toBeGreaterThan(20000);
    expect(result.warranty.yearsToKmLimit.vehicle).toBeCloseTo(
      100000 / result.evKmPerYear,
      9,
    );
    expect(result.warranty.yearsToKmLimit.battery).toBeCloseTo(
      160000 / result.evKmPerYear,
      9,
    );
  });

  it('S10: within the budget the years to the limit are still shown, without a warning', () => {
    const scenario = exampleScenario();
    const result = ok(computeOffer(scenario, first(offersOf(scenario)), 'mid'));
    expect(result.warranty.budgetExceeded).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.warranty.yearsToKmLimit.vehicle).toBeCloseTo(
      100000 / result.evKmPerYear,
      9,
    );
  });

  it('TC19: both warranties expired give "ohne Garantie", no budget and no years', () => {
    const scenario = exampleScenario();
    const candidate = first(scenario.candidates);
    candidate.vehicleWarranty = { years: 0, km: 0 };
    candidate.batteryWarranty = { years: 0, km: 0 };
    const result = ok(computeOffer(scenario, first(offersOf(scenario)), 'mid'));
    expect(result.warranty).toEqual({
      noWarranty: true,
      remaining: {
        vehicle: { years: 0, km: 0 },
        battery: { years: 0, km: 0 },
      },
      budgetKmPerYear: null,
      budgetExceeded: false,
      yearsToKmLimit: { vehicle: null, battery: null },
    });
  });

  it('S10: the EV share of the extra mileage is a multiple of the step per month, or null without extra mileage', () => {
    const scenario = exampleScenario();
    const result = ok(computeOffer(scenario, first(offersOf(scenario)), 'mid'));
    for (const share of result.extraSharePct) {
      expect(share).not.toBeNull();
      expect((share as number) % 10).toBe(0);
      expect(share).toBeLessThanOrEqual(100);
    }
    const none = exampleScenario();
    none.extraMileage.kmPerMonth = { city: 0, rural: 0, highway: 0 };
    const without = ok(computeOffer(none, first(offersOf(none)), 'mid'));
    expect(without.extraSharePct.every((share) => share === null)).toBe(true);
  });

  it('S10: the result names the scenario and the comparison period it was computed for', () => {
    const scenario = exampleScenario();
    scenario.parameters.comparisonMonths = 30;
    for (const result of [
      computeOffer(scenario, first(offersOf(scenario)), 'mid'),
      computeOffer(scenario, first(offersOf(scenario)), 'evFavorable'),
    ]) {
      expect(result.scenarioId).toBe(scenario.id);
      expect(result.comparisonMonths).toBe(30);
    }
  });
});

describe('S10: the other reasons for unsuitable', () => {
  const hw = (highway: number) => ({ city: 0, rural: 0, highway });
  /** One mechanism at a time: mild weather, no extra mileage, no maintenance. */
  const base = () => {
    const s = exampleScenario();
    s.extraMileage.kmPerMonth = { city: 0, rural: 0, highway: 0 };
    s.iceVehicle.maintenancePerKm = 0;
    s.parameters.evMaintenancePerKm = 0;
    s.parameters.warrantyBudgetAsTarget = false;
    s.parameters.sohReference = 'start';
    s.parameters.monthlyTempC = Array.from({ length: 12 }, () => 23);
    return s;
  };

  it('S10: strict mode names the way and month the EV cannot drive', () => {
    const s = base();
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
    s.parameters.strictMode = true;
    const result = computeOffer(s, first(offersOf(s)), 'mid');
    expect(result.status).toBe('unsuitable');
    if (result.status !== 'unsuitable') return;
    expect(result.reason).toMatchObject({ kind: 'strict', way: 'a', month: 0 });
    expect(OfferResultSchema.safeParse(result).success).toBe(true);
    // The same scenario without strict mode is fine: the petrol car takes A in January.
    s.parameters.strictMode = false;
    expect(computeOffer(s, first(offersOf(s)), 'mid').status).toBe('ok');
  });

  it('S10: ageing that takes a way below its threshold gives the reason "coupling"', () => {
    const s = base();
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
    s.parameters.kmToSohMin = 42857;
    const flat = { mild: 141, cold: 141 };
    first(s.candidates).rangeKm = { city: flat, highway: flat, combined: flat };
    const result = computeOffer(s, first(offersOf(s)), 'mid');
    expect(result.status).toBe('unsuitable');
    if (result.status !== 'unsuitable') return;
    expect(result.reason.kind).toBe('coupling');
    expect(OfferResultSchema.safeParse(result).success).toBe(true);
  });
});

describe('S10: the compute cache', () => {
  const scenario = exampleScenario();
  const offer = first(offersOf(scenario));

  it('S10: slider prices that differ only in key order or value get their own problem', () => {
    const cache = new ComputeCache();
    const one = {
      petrol: 1.5,
      electricity: 0.2,
      petrolEscalationPct: 0,
      electricityEscalationPct: 0,
    };
    // Same numbers in other key order is the same prices; a swapped pair is not.
    const reordered = {
      electricityEscalationPct: 0,
      petrolEscalationPct: 0,
      electricity: 0.2,
      petrol: 1.5,
    };
    const swapped = {
      petrol: 0.2,
      electricity: 1.5,
      petrolEscalationPct: 0,
      electricityEscalationPct: 0,
    };
    for (const sliderPrices of [one, swapped, reordered, one, swapped]) {
      expect(
        canonicalJson(
          computeOffer(scenario, offer, 'slider', { sliderPrices, cache }),
        ),
      ).toBe(
        canonicalJson(
          computeOffer(scenario, offer, 'slider', { sliderPrices }),
        ),
      );
    }
  });

  it('S10: slider prices that are not valid numbers are rejected', () => {
    const bad = { ...SLIDER, petrol: Number.NaN };
    expect(() =>
      computeOffer(scenario, offer, 'slider', { sliderPrices: bad }),
    ).toThrow(RangeError);
    expect(() =>
      computeOffer(scenario, offer, 'slider', {
        sliderPrices: { ...SLIDER, electricity: -0.1 },
      }),
    ).toThrow(RangeError);
  });

  it('S10: a new scenario object makes the cache start over, an incomplete one becomes ok', () => {
    const cache = new ComputeCache();
    const gap = exampleScenario();
    first(gap.candidates).purchasePrice = null;
    expect(
      computeOffer(gap, first(offersOf(gap)), 'mid', { cache }).status,
    ).toBe('incomplete');
    // The gap is filled in a new scenario object, as state updates do.
    const filled = structuredClone(gap);
    first(filled.candidates).purchasePrice = 40000;
    expect(
      computeOffer(filled, first(offersOf(filled)), 'mid', { cache }).status,
    ).toBe('ok');
    // And back: no stale result of the other scenario survives.
    expect(
      computeOffer(gap, first(offersOf(gap)), 'mid', { cache }).status,
    ).toBe('incomplete');
  });
});

describe('S10: the smallest reserve ignores ways the EV does not drive', () => {
  const hw = (highway: number) => ({ city: 0, rural: 0, highway });
  /** Mild weather, no extra mileage, no maintenance, no budget. */
  const base = () => {
    const s = exampleScenario();
    s.extraMileage.kmPerMonth = { city: 0, rural: 0, highway: 0 };
    s.iceVehicle.maintenancePerKm = 0;
    s.parameters.evMaintenancePerKm = 0;
    s.parameters.warrantyBudgetAsTarget = false;
    s.parameters.sohReference = 'start';
    s.parameters.monthlyTempC = Array.from({ length: 12 }, () => 23);
    return s;
  };

  it('S10: a way the EV cannot drive in January shows red in the heatmap but does not make the smallest reserve negative', () => {
    const s = base();
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
    const result = ok(computeOffer(s, first(offersOf(s)), 'mid'));
    const january = result.reserves.find((r) => r.way === 'a' && r.month === 0);
    expect(january?.reserveKm).toBeLessThan(0);
    expect(january?.light).toBe('red');
    // The petrol car takes A in January, so that cell does not count.
    expect(
      result.plan.find((p) => p.weekday === 'mon' && p.month === 0)?.choice,
    ).toBe('rest');
    const min = result.minReserve;
    expect(min).not.toBeNull();
    expect(min?.reserveKm).toBeGreaterThanOrEqual(0);
    expect(min && `${min.way}:${min.month}`).not.toBe('a:0');
  });

  it('S10: an EV that never drives has no smallest reserve', () => {
    const s = base();
    // No day has both workplaces staffed, and electricity is so dear that the
    // petrol car takes every way.
    s.workplaces.a = { ...s.workplaces.a, weekdays: ['mon', 'wed', 'fri'] };
    s.workplaces.b = { ...s.workplaces.b, weekdays: ['tue', 'thu'] };
    s.parameters.electricityPrice = { min: 50, mid: 50, max: 50 };
    const result = ok(computeOffer(s, first(offersOf(s)), 'mid'));
    expect(result.evKmPerYear).toBe(0);
    expect(result.plan.every((p) => p.choice === 'rest')).toBe(true);
    expect(result.minReserve).toBeNull();
    expect(OfferResultSchema.safeParse(result).success).toBe(true);
    // Q6 still holds without the smallest reserve.
    const trace = new Trace();
    const traced = ok(computeOffer(s, first(offersOf(s)), 'mid', { trace }));
    expect(
      trace.entries.some((e) => e.resultPath?.startsWith('minReserve')),
    ).toBe(false);
    expect(traced).toEqual(result);
  });
});

describe('C1b: remaining warranty in the offer result', () => {
  it('TC18: the used car shows vehicle 0 years / 20,000 km and battery 3 years / 60,000 km, B = 20,000 km per year', () => {
    const scenario = exampleScenario();
    makeTc18(scenario);
    const result = ok(computeOffer(scenario, first(offersOf(scenario)), 'mid'));
    expect(result.warranty.remaining).toEqual({
      vehicle: { years: 0, km: 20000 },
      battery: { years: 3, km: 60000 },
    });
    expect(result.warranty.noWarranty).toBe(false);
    expect(result.warranty.budgetKmPerYear).toBe(20000);
    // The expired vehicle warranty has no years to its limit.
    expect(result.warranty.yearsToKmLimit.vehicle).toBeNull();
    expect(result.warranty.yearsToKmLimit.battery).toBeCloseTo(
      60000 / result.evKmPerYear,
      9,
    );
  });

  it.each([
    ['01/2020, a = 62', { month: 1, year: 2020 }],
    [
      '03/2020, a = 60: the vehicle warranty ends exactly at the reference month',
      { month: 3, year: 2020 },
    ],
  ])(
    'TC19: first registration %s gives "ohne Garantie", no budget and no error',
    (_name, firstRegistration) => {
      const scenario = exampleScenario();
      scenario.parameters.warrantyReferenceMonth = { month: 3, year: 2025 };
      const candidate = first(scenario.candidates);
      candidate.condition = 'used';
      candidate.firstRegistration = firstRegistration;
      candidate.mileageKm = 170000;
      candidate.vehicleWarranty = { years: 5, km: 200000 };
      candidate.batteryWarranty = { years: 8, km: 160000 };
      for (const offer of offersOf(scenario)) {
        const result = computeOffer(scenario, offer, 'mid');
        expect(OfferResultSchema.parse(result)).toEqual(result);
        const { warranty } = ok(result);
        expect(warranty.remaining.vehicle.years).toBe(0);
        expect(warranty.remaining.vehicle.km).toBe(30000);
        expect(warranty.remaining.battery.km).toBe(0);
        expect(warranty).toMatchObject({
          noWarranty: true,
          budgetKmPerYear: null,
          budgetExceeded: false,
          yearsToKmLimit: { vehicle: null, battery: null },
        });
      }
    },
  );

  it('C1b: a new car keeps its normal warranty as remaining warranty', () => {
    const scenario = exampleScenario();
    const result = ok(computeOffer(scenario, first(offersOf(scenario)), 'mid'));
    expect(result.warranty.remaining).toEqual({
      vehicle: { years: 3, km: 100000 },
      battery: { years: 8, km: 160000 },
    });
  });

  it('C1b: a used second candidate without first registration is incomplete at candidates[1].firstRegistration, the first one computes', () => {
    const scenario = exampleScenario();
    const second: Scenario['candidates'][number] = {
      ...first(exampleScenario().candidates),
      id: '00000000-0000-4000-8000-0000000000bb',
      condition: 'used',
      firstRegistration: null,
      mileageKm: 30000,
      leaseTiers: [],
    };
    scenario.candidates = [first(scenario.candidates), second];
    const offerSecond = at(offersOf(scenario), 2);
    expect(offerSecond.candidateId).toBe(second.id);
    const result = computeOffer(scenario, offerSecond, 'mid');
    expect(result.status).toBe('incomplete');
    if (result.status !== 'incomplete') return;
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'candidates[1].firstRegistration',
    ]);
    expect(
      computeOffer(scenario, first(offersOf(scenario)), 'mid').status,
    ).toBe('ok');
  });

  it('C1b: the lease of a used car takes the years to the km limit from the remaining warranty, the budget is not active', () => {
    const scenario = exampleScenario();
    makeTc18(scenario);
    const lease = at(offersOf(scenario), 1);
    expect(lease.kind).toBe('lease');
    const result = ok(computeOffer(scenario, lease, 'mid'));
    expect(result.warranty.remaining.battery).toEqual({
      years: 3,
      km: 60000,
    });
    expect(result.warranty.yearsToKmLimit.vehicle).toBeNull();
    expect(result.warranty.yearsToKmLimit.battery).toBeCloseTo(
      60000 / result.evKmPerYear,
      9,
    );

    const compute = ScenarioComputeSchema.parse(scenario);
    const candidate = CandidateComputeSchema.parse(first(scenario.candidates));
    const prices = resolvePrices(compute.iceVehicle, compute.parameters, {
      priceCase: 'mid',
    });
    const outcome = optimizeOffer(
      compute,
      candidate,
      buildProblem(compute, candidate, prices),
      { kind: 'lease', tier: first(candidate.leaseTiers) },
    );
    expect(outcome.budget).toEqual({
      noWarranty: false,
      budgetKmPerYear: 20000,
      active: false,
    });
  });
});
