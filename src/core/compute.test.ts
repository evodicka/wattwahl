import { describe, expect, it } from 'vitest';
import {
  exampleCandidateCompute,
  exampleScenario,
  exampleScenarioCompute,
} from '../../tests/fixtures/exampleScenario';
import {
  OfferResultSchema,
  TraceEntrySchema,
  createCandidateTemplate,
  listOffers,
  type Offer,
  type OfferResult,
  type OkOfferResult,
  type PriceCase,
  type Scenario,
} from '../domain';
import { resolvePrices } from './calc/prices';
import { ComputeCache, computeOffer, hashResult, Trace } from './index';
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

/** Paths of all numbers in a result, such as `reserves[3].reserveKm`; `month` is a label, not a result. */
function numericLeaves(value: unknown, path = ''): string[] {
  if (typeof value === 'number') return [path];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      numericLeaves(item, `${path}[${index}]`),
    );
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      key === 'month'
        ? []
        : numericLeaves(item, path === '' ? key : `${path}.${key}`),
    );
  }
  return [];
}

describe('Q6: every number of the result has a Rechenweg entry', () => {
  const scenario = exampleScenario();

  it.each(CASES)(
    'Q6: all numbers of every offer in price case %s are linked to an entry with a formula ID',
    (priceCase) => {
      for (const offer of offersOf(scenario)) {
        const trace = new Trace();
        const result = ok(computeOffer(scenario, offer, priceCase, { trace }));
        const linked = new Map(
          trace.entries
            .filter((entry) => entry.resultPath !== undefined)
            .map((entry) => [entry.resultPath as string, entry]),
        );
        const leaves = numericLeaves(result);
        expect(leaves.length).toBeGreaterThan(50);
        for (const leaf of leaves) {
          const entry = linked.get(leaf);
          expect(entry, `${offer.offerId}: no entry for ${leaf}`).toBeDefined();
          // A valid entry with a formula ID from the list of architecture 8.4.
          expect(TraceEntrySchema.safeParse(entry).success).toBe(true);
        }
        // And no link points at a number the result does not have.
        for (const path of linked.keys()) {
          expect(leaves, `${offer.offerId}: dangling link ${path}`).toContain(
            path,
          );
        }
      }
    },
  );

  it('Q6: the Rechenweg also holds the intermediate values, not only the linked ones', () => {
    const trace = new Trace();
    computeOffer(scenario, first(offersOf(scenario)), 'mid', { trace });
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

  it('S10: the parts add up, K_EV + K_ICE is the same for every plan, and the SoH never rises', () => {
    const purchase = ok(
      computeOffer(scenario, first(offersOf(scenario)), 'mid'),
    );
    const lease = ok(
      computeOffer(scenario, first(offersOf(scenario).slice(1)), 'mid'),
    );
    const { costs } = purchase;
    expect(costs.total).toBeCloseTo(
      costs.acquisition + costs.electricity + costs.petrol + costs.maintenance,
      9,
    );
    expect(purchase.evKmPerYear + purchase.iceKmPerYear).toBeCloseTo(
      lease.evKmPerYear + lease.iceKmPerYear,
      6,
    );
    expect(purchase.sohEnd).toBeLessThanOrEqual(1);
    expect(purchase.minReserve.reservePct).toBe(
      Math.min(...purchase.reserves.map((r) => r.reservePct)),
    );
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
