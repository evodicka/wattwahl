import {
  CandidateComputeSchema,
  ScenarioComputeSchema,
  SliderPricesSchema,
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
 * candidate and price case, the problem with its DP. Create one per run. The
 * cache remembers the scenario object it was filled for and starts over when
 * it is given another one, so scenario state must be replaced on every change,
 * never edited in place (an edit of the same object is not noticed).
 * Calls with a trace ignore it, so their Rechenweg is complete; that makes
 * opening the Rechenweg rebuild the problem of that one offer.
 */
export class ComputeCache {
  private scenario: Scenario | undefined;
  private scenarioCheck: ScenarioCheck | undefined;
  private readonly candidateChecks = new Map<string, CandidateCheck>();
  private readonly problems = new Map<string, Problem>();
  /** Only the latest slider problem per candidate is kept: dragging must not pile them up. */
  private readonly sliderProblems = new Map<
    string,
    { key: string; problem: Problem }
  >();

  private sync(scenario: Scenario): void {
    if (this.scenario === scenario) return;
    this.scenario = scenario;
    this.scenarioCheck = undefined;
    this.candidateChecks.clear();
    this.problems.clear();
    this.sliderProblems.clear();
  }

  checkScenario(scenario: Scenario): ScenarioCheck {
    this.sync(scenario);
    return (this.scenarioCheck ??= ScenarioComputeSchema.safeParse(scenario));
  }

  checkCandidate(
    scenario: Scenario,
    candidate: Scenario['candidates'][number],
  ): CandidateCheck {
    this.sync(scenario);
    let check = this.candidateChecks.get(candidate.id);
    if (!check) {
      check = CandidateComputeSchema.safeParse(candidate);
      this.candidateChecks.set(candidate.id, check);
    }
    return check;
  }

  problem(
    scenario: Scenario,
    candidateId: string,
    priceCase: PriceCase,
    sliderPrices: SliderPrices | undefined,
    build: () => Problem,
  ): Problem {
    this.sync(scenario);
    if (priceCase === 'slider' && sliderPrices) {
      const key = [
        sliderPrices.petrol,
        sliderPrices.electricity,
        sliderPrices.petrolEscalationPct,
        sliderPrices.electricityEscalationPct,
      ].join('|');
      const known = this.sliderProblems.get(candidateId);
      if (known?.key === key) return known.problem;
      const problem = build();
      this.sliderProblems.set(candidateId, { key, problem });
      return problem;
    }
    const key = `${candidateId}|${priceCase}`;
    let problem = this.problems.get(key);
    if (!problem) {
      problem = build();
      this.problems.set(key, problem);
    }
    return problem;
  }
}

export type ComputeOptions = {
  /** Prices of the slider; required for the price case `slider`. */
  sliderPrices?: SliderPrices;
  /**
   * Collects the Rechenweg and links each result number to its entry (Q6).
   * Use one trace per offer: result paths carry no offer id.
   */
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
    if (!SliderPricesSchema.safeParse(sliderPrices).success) {
      throw new RangeError('The slider prices are not valid numbers.');
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
    scenarioId: scenario.id,
    comparisonMonths: scenario.parameters.comparisonMonths,
  };

  // Everything this offer needs: the driving profile and parameters, and the
  // candidate with all its lease tiers (spec: one gap blocks the candidate).
  const scenarioCheck = cache
    ? cache.checkScenario(scenario)
    : ScenarioComputeSchema.safeParse(scenario);
  const candidateCheck = cache
    ? cache.checkCandidate(scenario, stored)
    : CandidateComputeSchema.safeParse(stored);
  const issues = [
    ...issuesOf(scenarioCheck),
    ...issuesOf(candidateCheck, `candidates[${index}]`),
  ];
  if (!scenarioCheck.success || !candidateCheck.success) {
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

  const build = () => buildProblem(compute, candidate, prices, trace);
  const problem =
    cache && !trace
      ? cache.problem(scenario, candidate.id, priceCase, sliderPrices, build)
      : build();

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
  head: Pick<
    OkOfferResult,
    | 'offerId'
    | 'candidateId'
    | 'kind'
    | 'priceCase'
    | 'scenarioId'
    | 'comparisonMonths'
  >,
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
  // K_ICE = total km - K_EV as in the spec; it can differ from the plan's own
  // petrol km by about one ulp.
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
  const total = acquisition + electricity + petrol + maintenance;
  // The optimizer's own OPT.target sums the same costs in another order, so
  // the total of the result gets its own entry with exactly this value.
  trace?.add({
    formula: 'OPT.target',
    inputs: { acquisition, electricity, petrol, maintenance },
    value: total,
    resultPath: 'costs.total',
  });
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

  // Reserve of both ways in every month at that SoH (section 3). It is the SoH
  // of the exact EV km, at least the raster bucket SoH the optimizer checked.
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
  // The smallest reserve counts only the ways and months the plan lets the EV
  // drive: there the way is suitable, so the reserve is not negative. A way
  // the petrol car takes (the EV rests) has no say.
  const driven = new Set(
    outcome.plan.flatMap((entry) =>
      entry.info.kind === 'day' && entry.choice !== 'rest'
        ? [`${entry.choice === 'evA' ? 'a' : 'b'}:${entry.info.month}`]
        : [],
    ),
  );
  const smallest = reserves
    .filter((cell) => driven.has(`${cell.way}:${cell.month}`))
    .reduce<ReserveCell | null>(
      (best, cell) =>
        best === null || cell.reservePct < best.reservePct ? cell : best,
      null,
    );
  let minReserve: OkOfferResult['minReserve'] = null;
  if (smallest) {
    from = mark();
    const check = problem.checkWayAt(
      smallest.way,
      smallest.month,
      sohCheck,
      trace,
    );
    link(from, 'F3.reserveKm', 'minReserve.reserveKm');
    link(from, 'F3.reservePct', 'minReserve.reservePct');
    minReserve = {
      way: smallest.way,
      month: smallest.month,
      reserveKm: check.reserveKm,
      reservePct: check.reservePct,
    };
  }

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
      const share = entry.sharePct;
      if (share === undefined) {
        throw new RangeError('An extra mileage option has no share.');
      }
      extraSharePct[entry.info.month] = share;
      trace?.add({
        formula: 'OPT.select',
        inputs: { decision: 'extraShare', month: entry.info.month },
        value: share,
        resultPath: `extraSharePct[${entry.info.month}]`,
      });
    }
  }

  // Warranty: the remaining warranties, the budget, and the years to each
  // running warranty's km limit.
  const { remaining, budget, yearsToKmLimit } = outcome;
  if (budget.budgetKmPerYear !== null) {
    link(input.optimizeFrom, 'OPT.budget', 'warranty.budgetKmPerYear');
  }
  if (trace) {
    // Each entry names its warranty and quantity, so the order does not matter.
    trace.entries.forEach((entry, at) => {
      if (at < input.optimizeFrom || entry.formula !== 'OPT.remainingWarranty')
        return;
      const { part, quantity } = entry.inputs;
      trace.link(at, `warranty.remaining.${String(part)}.${String(quantity)}`);
    });
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
      total,
      budgetExtraCost: outcome.budgetExtraCost,
    },
    reserves,
    minReserve,
    warranty: {
      noWarranty: budget.noWarranty,
      remaining,
      budgetKmPerYear: budget.budgetKmPerYear,
      budgetExceeded: outcome.budgetExceeded,
      yearsToKmLimit,
    },
    warnings: outcome.budgetExceeded ? ['budgetExceeded'] : [],
  };
}
