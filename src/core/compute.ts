import {
  CandidateComputeSchema,
  ScenarioComputeSchema,
  type CandidateCompute,
  type FormulaId,
  type Offer,
  type OfferResult,
  type OkOfferResult,
  type PriceCase,
  type ReserveCell,
  type Scenario,
  type ScenarioCompute,
  type SliderPrices,
} from '../domain';
import {
  effectiveDepreciationPct,
  effectiveEvMaintenancePerKm,
  energyCost,
  iceKmPerYear,
  iceOdometerEnd,
  leaseCost,
  maintenanceCost,
  purchaseCost,
} from './calc/costs';
import {
  electricityFactor,
  maintenanceFactor,
  petrolFactor,
  resolvePrices,
  type PriceSelection,
  type ResolvedPrices,
} from './calc/prices';
import { sohAt, sohCurve, sohKEnd } from './calc/soh';
import {
  optimizeOffer,
  type OfferTerms,
  type OptimizerOutcome,
} from './optimizer/optimize';
import { WAYS, buildProblem, type Problem } from './optimizer/problem';
import type { Trace } from './trace';

type ScenarioCheck = ReturnType<typeof ScenarioComputeSchema.safeParse>;
type CandidateCheck = ReturnType<typeof CandidateComputeSchema.safeParse>;
type Issue = { path: string; message: string };

/**
 * Work that several offers of one scenario share: the validation and, per
 * candidate and price case, the problem with its DP. Create one for each run
 * and drop it when the scenario changes: it never notices a changed scenario.
 * Calls with a trace ignore the cache, so their Rechenweg is complete.
 */
export class ComputeCache {
  scenarioCheck: ScenarioCheck | undefined;
  readonly candidateChecks = new Map<string, CandidateCheck>();
  readonly problems = new Map<string, Problem>();
}

export type ComputeOptions = {
  /** Prices of the slider; required for the price case `slider`. */
  sliderPrices?: SliderPrices;
  /** Collects the Rechenweg and links each result number to its entry (Q6). */
  trace?: Trace;
  cache?: ComputeCache;
};

/** `candidates[2].leaseTiers[0].monthlyRate`: the schema path as written in messages. */
function formatPath(segments: readonly PropertyKey[], base = ''): string {
  let text = base;
  for (const segment of segments) {
    text +=
      typeof segment === 'number'
        ? `[${segment}]`
        : text === ''
          ? String(segment)
          : `.${String(segment)}`;
  }
  return text;
}

function issuesOf(check: ScenarioCheck | CandidateCheck, base = ''): Issue[] {
  return check.success
    ? []
    : check.error.issues.map((issue) => ({
        path: formatPath(issue.path, base),
        message: issue.message,
      }));
}

function toPlanChoice(choice: string): 'evA' | 'evB' | 'rest' {
  if (choice === 'evA' || choice === 'evB' || choice === 'rest') return choice;
  throw new RangeError(`Unexpected plan choice "${choice}".`);
}

/**
 * Computes one offer (purchase or one lease tier) of a candidate in one price
 * case: checks that everything the offer needs is filled in (`incomplete`
 * with the field paths), finds the cheapest plan (`unsuitable` with the
 * reason if there is none) and fills the result of spec step 6.
 *
 * With a trace, every number of an `ok` result is linked to the entry that
 * explains it (Q6). The result does not depend on whether a trace is given.
 */
export function computeOffer(
  scenario: Scenario,
  offer: Offer,
  priceCase: PriceCase,
  options: ComputeOptions = {},
): OfferResult {
  const { sliderPrices, trace, cache } = options;
  const index = scenario.candidates.findIndex(
    (candidate) => candidate.id === offer.candidateId,
  );
  const stored = scenario.candidates[index];
  if (!stored) {
    throw new RangeError(`The scenario has no candidate ${offer.candidateId}.`);
  }
  if (
    offer.kind === 'lease' &&
    !stored.leaseTiers.some((tier) => tier.id === offer.leaseTierId)
  ) {
    throw new RangeError(
      `The candidate has no lease tier ${offer.leaseTierId}.`,
    );
  }
  let selection: PriceSelection;
  if (priceCase === 'slider') {
    if (!sliderPrices) {
      throw new RangeError('The price case "slider" needs the slider prices.');
    }
    selection = { priceCase, sliderPrices };
  } else {
    selection = { priceCase };
  }
  const head = {
    offerId: offer.offerId,
    candidateId: offer.candidateId,
    kind: offer.kind,
    priceCase,
  };

  // Everything this offer needs: the driving profile and parameters, and the
  // candidate with all its lease tiers (spec: one gap blocks the candidate).
  const scenarioCheck = cache
    ? (cache.scenarioCheck ??= ScenarioComputeSchema.safeParse(scenario))
    : ScenarioComputeSchema.safeParse(scenario);
  let candidateCheck = cache?.candidateChecks.get(stored.id);
  if (!candidateCheck) {
    candidateCheck = CandidateComputeSchema.safeParse(stored);
    cache?.candidateChecks.set(stored.id, candidateCheck);
  }
  const issues = [
    ...issuesOf(scenarioCheck),
    ...issuesOf(candidateCheck, `candidates[${index}]`),
  ];
  if (!scenarioCheck.success || !candidateCheck.success || issues.length > 0) {
    return { ...head, status: 'incomplete', issues };
  }
  const compute = scenarioCheck.data;
  const candidate = candidateCheck.data;

  const terms: OfferTerms =
    offer.kind === 'purchase'
      ? { kind: 'purchase' }
      : { kind: 'lease', tier: findTier(candidate, offer.leaseTierId) };
  const prices = resolvePrices(
    compute.iceVehicle,
    compute.parameters,
    selection,
  );

  const problemKey =
    priceCase === 'slider' && sliderPrices
      ? `${candidate.id}|slider|${Object.values(sliderPrices).join('|')}`
      : `${candidate.id}|${priceCase}`;
  let problem = trace ? undefined : cache?.problems.get(problemKey);
  if (!problem) {
    problem = buildProblem(compute, candidate, prices, trace);
    if (!trace) cache?.problems.set(problemKey, problem);
  }

  const optimizeFrom = trace?.entries.length ?? 0;
  const outcome = optimizeOffer(compute, candidate, problem, terms, trace);
  if (outcome.status === 'unsuitable') {
    return { ...head, status: 'unsuitable', reason: outcome.reason };
  }
  return okResult(head, {
    compute,
    candidate,
    problem,
    outcome,
    prices,
    terms,
    trace,
    optimizeFrom,
  });
}

function findTier(
  candidate: CandidateCompute,
  leaseTierId: string,
): Extract<OfferTerms, { kind: 'lease' }>['tier'] {
  const tier = candidate.leaseTiers.find((entry) => entry.id === leaseTierId);
  if (!tier)
    throw new RangeError(`The candidate has no lease tier ${leaseTierId}.`);
  return tier;
}

type OkInput = {
  compute: ScenarioCompute;
  candidate: CandidateCompute;
  problem: Problem;
  outcome: Extract<OptimizerOutcome, { status: 'ok' }>;
  prices: ResolvedPrices;
  terms: OfferTerms;
  trace: Trace | undefined;
  /** Index of the first trace entry the optimizer wrote. */
  optimizeFrom: number;
};

/** The result of spec step 6, with the cost formulas of section 8 run for the chosen plan. */
function okResult(
  head: Pick<OkOfferResult, 'offerId' | 'candidateId' | 'kind' | 'priceCase'>,
  input: OkInput,
): OkOfferResult {
  const { compute, candidate, problem, outcome, prices, terms, trace } = input;
  const { parameters, iceVehicle } = compute;
  const months = parameters.comparisonMonths;

  /** Links the newest trace entry of `formula` written since `from` to a result path. */
  const link = (from: number, formula: FormulaId, path: string): void => {
    if (!trace) return;
    for (let at = trace.entries.length - 1; at >= from; at--) {
      if (trace.entries[at]?.formula === formula) {
        trace.link(at, path);
        return;
      }
    }
  };
  const mark = (): number => trace?.entries.length ?? 0;

  const { quantities } = outcome;
  const evKmPerYear = outcome.evKmPerYear;
  link(input.optimizeFrom, 'OPT.select', 'evKmPerYear');

  // Cost parts: the formulas of section 8 on the yearly quantities of the plan.
  const evPerKm = effectiveEvMaintenancePerKm(candidate, parameters);
  const kIce = (() => {
    const from = mark();
    const value = iceKmPerYear(
      quantities.evKm + quantities.iceKm,
      quantities.evKm,
      trace,
    );
    link(from, 'F8.kIce', 'iceKmPerYear');
    return value;
  })();
  const acquisition = (() => {
    const from = mark();
    if (terms.kind === 'purchase') {
      const value = purchaseCost(
        candidate.purchasePrice,
        effectiveDepreciationPct(candidate, parameters),
        months,
        trace,
      );
      link(from, 'F8.purchase', 'costs.acquisition');
      return value;
    }
    const value = leaseCost(terms.tier, evKmPerYear, months, trace).total;
    link(from, 'F8.lease', 'costs.acquisition');
    return value;
  })();
  const electricity = (() => {
    const from = mark();
    const value = energyCost(
      'electricity',
      quantities.gridKwh,
      prices.electricityPrice,
      electricityFactor(prices.electricityEscalationPct, months),
      trace,
    );
    link(from, 'F8.energy', 'costs.electricity');
    return value;
  })();
  const petrol = (() => {
    const from = mark();
    const value = energyCost(
      'petrol',
      quantities.litres,
      prices.petrolPrice,
      petrolFactor(prices.petrolEscalationPct, months),
      trace,
    );
    link(from, 'F8.energy', 'costs.petrol');
    return value;
  })();
  const maintenance = (() => {
    const from = mark();
    const value = maintenanceCost(
      { ev: evKmPerYear, ice: kIce },
      { ev: evPerKm, ice: iceVehicle.maintenancePerKm },
      maintenanceFactor(months),
      trace,
    );
    link(from, 'F8.maintenance', 'costs.maintenance');
    return value;
  })();
  link(input.optimizeFrom, 'OPT.target', 'costs.total');
  if (
    trace &&
    !trace.entries.some(
      (entry, at) =>
        at >= input.optimizeFrom && entry.formula === 'OPT.budgetExtraCost',
    )
  ) {
    // No active budget: the optimizer did not look at one, so say it here.
    trace.add({
      formula: 'OPT.budgetExtraCost',
      inputs: { budget: 'none' },
      value: 0,
      resultPath: 'costs.budgetExtraCost',
    });
  } else {
    link(input.optimizeFrom, 'OPT.budgetExtraCost', 'costs.budgetExtraCost');
  }

  // SoH at the end of the comparison and at the km the reserves are checked at.
  const curve = sohCurve(parameters, candidate);
  const kEnd = sohKEnd(candidate.mileageKm, evKmPerYear, months, trace);
  let from = mark();
  const sohEnd = sohAt(curve, kEnd, trace);
  link(from, 'F2.soh', 'sohEnd');
  from = mark();
  const sohCheck = sohAt(
    curve,
    parameters.sohReference === 'end' ? kEnd : candidate.mileageKm,
    trace,
  );
  link(from, 'F2.soh', 'sohCheck');

  from = mark();
  const iceOdometer = iceOdometerEnd(iceVehicle.mileageKm, kIce, months, trace);
  link(from, 'F8.iceOdometer', 'iceOdometerEnd');

  // Reserve of both ways in every month at that SoH (section 3).
  const reserves: ReserveCell[] = [];
  for (const way of WAYS) {
    for (let month = 0; month < 12; month++) {
      const start = mark();
      const check = problem.checkWayAt(way, month, sohCheck, trace);
      const at = reserves.length;
      link(start, 'F3.reserveKm', `reserves[${at}].reserveKm`);
      link(start, 'F3.reservePct', `reserves[${at}].reservePct`);
      reserves.push({
        way,
        month,
        reserveKm: check.reserveKm,
        reservePct: check.reservePct,
        light: check.light,
      });
    }
  }
  const smallest = reserves.reduce((best, cell) =>
    cell.reservePct < best.reservePct ? cell : best,
  );
  from = mark();
  const smallestCheck = problem.checkWayAt(
    smallest.way,
    smallest.month,
    sohCheck,
    trace,
  );
  link(from, 'F3.reserveKm', 'minReserve.reserveKm');
  link(from, 'F3.reservePct', 'minReserve.reservePct');

  // The plan, and the share of the extra mileage the EV takes per month.
  const plan: OkOfferResult['plan'] = [];
  const extraSharePct: (number | null)[] = Array.from(
    { length: 12 },
    () => null,
  );
  for (const entry of outcome.plan) {
    if (entry.info.kind === 'day') {
      plan.push({
        weekday: entry.info.weekday,
        month: entry.info.month,
        state: entry.info.state,
        choice: toPlanChoice(entry.choice),
      });
    } else {
      const share = Number(entry.choice.slice('share:'.length));
      extraSharePct[entry.info.month] = share;
      trace?.add({
        formula: 'OPT.select',
        inputs: { decision: 'extraShare', month: entry.info.month },
        value: share,
        resultPath: `extraSharePct[${entry.info.month}]`,
      });
    }
  }

  // Warranty: the budget, and the years to each km limit if the plan forces more.
  const { budget, yearsToKmLimit } = outcome;
  if (budget.budgetKmPerYear !== null) {
    link(input.optimizeFrom, 'OPT.budget', 'warranty.budgetKmPerYear');
  }
  if (trace && yearsToKmLimit) {
    const entries = trace.entries
      .map((entry, at) => ({ entry, at }))
      .filter(
        ({ entry, at }) =>
          at >= input.optimizeFrom && entry.formula === 'OPT.yearsToKmLimit',
      );
    let next = 0;
    for (const part of ['vehicle', 'battery'] as const) {
      if (yearsToKmLimit[part] === null) continue;
      const found = entries[next++];
      if (found) trace.link(found.at, `warranty.yearsToKmLimit.${part}`);
    }
  }

  return {
    ...head,
    status: 'ok',
    plan,
    extraSharePct,
    evKmPerYear,
    iceKmPerYear: kIce,
    iceOdometerEnd: iceOdometer,
    sohEnd,
    sohCheck,
    costs: {
      acquisition,
      electricity,
      petrol,
      maintenance,
      total: acquisition + electricity + petrol + maintenance,
      budgetExtraCost: outcome.budgetExtraCost,
    },
    reserves,
    minReserve: {
      way: smallest.way,
      month: smallest.month,
      reserveKm: smallestCheck.reserveKm,
      reservePct: smallestCheck.reservePct,
    },
    warranty: {
      noWarranty: budget.noWarranty,
      budgetKmPerYear: budget.budgetKmPerYear,
      budgetExceeded: outcome.budgetExceeded,
      yearsToKmLimit,
    },
    warnings: outcome.budgetExceeded ? ['budgetExceeded'] : [],
  };
}
