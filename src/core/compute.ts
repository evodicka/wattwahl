import {
  CandidateComputeSchema,
  ScenarioComputeSchema,
  SliderPricesSchema,
  type CandidateCompute,
  type FormulaId,
  type Offer,
  type OfferResult,
  type OkOfferResult,
  type PlanSwitch,
  type PriceCase,
  type ReserveCell,
  type Scenario,
  type ScenarioCompute,
  type SliderPrices,
  type Timeline,
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
import {
  effectiveSohReference,
  monthsUntilSoh,
  sohAt,
  sohCurve,
  sohKEnd,
} from './calc/soh';
import {
  optimizeOffer,
  type OfferTerms,
  type OptimizerOutcome,
} from './optimizer/optimize';
import {
  WAYS,
  buildProblem,
  pairIndex,
  type Problem,
} from './optimizer/problem';
import { decideSwitch } from './optimizer/switchDecision';
import type { SwitchPlanParts } from './optimizer/switchDecision';
import {
  monthsUntilSohAlong,
  odometerAt,
  type SwitchPhase,
} from './optimizer/switchPlan';
import {
  isExpired,
  yearsToKmLimit as yearsToKmLimitOf,
} from './optimizer/warranty';
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
    (!scenario.includeLeaseOffers ||
      !stored.leaseTiers.some((tier) => tier.id === offer.leaseTierId))
  ) {
    throw new RangeError(
      `The scenario has no lease offer for tier ${offer.leaseTierId}.`,
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
  // Hidden lease offers are not part of the scenario, so they block nothing.
  const subject = scenario.includeLeaseOffers
    ? stored
    : { ...stored, leaseTiers: [] };
  const scenarioCheck = cache
    ? cache.checkScenario(scenario)
    : ScenarioComputeSchema.safeParse(scenario);
  const candidateCheck = cache
    ? cache.checkCandidate(scenario, subject)
    : CandidateComputeSchema.safeParse(subject);
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

  if (compute.parameters.sohPlanMode === 'switch') {
    const decision = decideSwitch(compute, candidate, problem, terms);
    if (decision.status === 'unsuitable') {
      return { ...head, status: 'unsuitable', reason: decision.reason };
    }
    // The decision ran without a trace; only the chosen plan is run again with
    // one, so the Rechenweg holds one optimizer run and every link is unique.
    const optimizeFrom = trace?.entries.length ?? 0;
    const chosen =
      decision.chosen === 'switch' ? decision.parts.start : decision.fixed;
    const outcome = trace
      ? (optimizeOffer(
          compute,
          candidate,
          problem,
          terms,
          trace,
          decision.chosen === 'switch' ? 'start' : 'end',
        ) as typeof chosen)
      : chosen;
    return okResult(head, {
      compute,
      candidate,
      problem,
      outcome,
      prices,
      terms,
      trace,
      optimizeFrom,
      planSwitch: decision.planSwitch,
      switchParts: decision.chosen === 'switch' ? decision.parts : undefined,
    });
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

/**
 * Suitability over time (spec "Eignung im Zeitverlauf"), display only. The
 * plan is the one already chosen, so the odometer grows with its K_EV. Per
 * point in time one OPT.timeline step carries month, odometer and SoH; the 24
 * reserves of that point have no steps of their own (architecture 8.4, Q6).
 * `suitableForMonths` comes straight from the SoH threshold of each cell.
 */
function buildTimeline(input: {
  problem: Problem;
  curve: ReturnType<typeof sohCurve>;
  mileageKm: number;
  evKmPerYear: number;
  comparisonMonths: number;
  trace: Trace | undefined;
  /** Plan with switch points: the odometer follows these phases instead of one rate. */
  phases?: readonly SwitchPhase[];
}): Timeline {
  const {
    problem,
    curve,
    mileageKm,
    evKmPerYear,
    comparisonMonths,
    trace,
    phases,
  } = input;
  const times: number[] = [];
  for (let month = 0; month < comparisonMonths; month += 12) times.push(month);
  times.push(comparisonMonths);

  const points = times.map((month, index) => {
    const odometerKm = phases
      ? odometerAt(problem, phases, month)
      : sohKEnd(mileageKm, evKmPerYear, month);
    const soh = sohAt(curve, odometerKm);
    trace?.add({
      formula: 'OPT.timeline',
      inputs: { month, odometerKm },
      value: soh,
      resultPath: `timeline.points[${index}].soh`,
    });
    const cells: ReserveCell[] = [];
    for (const way of WAYS) {
      for (let cellMonth = 0; cellMonth < 12; cellMonth++) {
        const check = problem.checkWayAt(way, cellMonth, soh);
        cells.push({
          way,
          month: cellMonth,
          reserveKm: check.reserveKm,
          reservePct: check.reservePct,
          light: check.light,
          belowMinReserve: check.belowMinReserve,
        });
      }
    }
    return { month, odometerKm, soh, cells };
  });

  const suitableForMonths: (number | null)[] = [];
  for (const way of WAYS) {
    for (let cellMonth = 0; cellMonth < 12; cellMonth++) {
      const threshold = problem.thresholds[pairIndex(way, cellMonth)] as number;
      const exact = phases
        ? monthsUntilSohAlong(problem, phases, threshold)
        : monthsUntilSoh(curve, mileageKm, evKmPerYear, threshold);
      // Rounded down to whole months: the one place a result is rounded in the
      // core (spec: suitableForMonths counts whole months by definition).
      const whole = exact >= comparisonMonths ? null : Math.floor(exact);
      trace?.add({
        formula: 'OPT.suitableUntil',
        inputs: {
          way,
          month: cellMonth,
          threshold,
          exactMonths: Number.isFinite(exact) ? exact : 'never',
          comparisonMonths,
        },
        value: whole ?? 'end',
        ...(whole === null
          ? {}
          : {
              resultPath: `timeline.suitableForMonths[${suitableForMonths.length}]`,
            }),
      });
      suitableForMonths.push(whole);
    }
  }
  return { points, suitableForMonths };
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
  /** Mode `switch`: the comparison of the two plans, `null` in mode `fixed`. */
  planSwitch?: PlanSwitch | null;
  /** Mode `switch`, plan with switch points chosen: what the figures below come from. */
  switchParts?: SwitchPlanParts;
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

  const { switchParts } = input;
  const { quantities } = outcome;
  // The plan with switch points drives the time-weighted average rate.
  const evKmPerYear = switchParts
    ? switchParts.figures.evKmPerYear
    : outcome.evKmPerYear;
  if (switchParts) {
    trace?.add({
      formula: 'OPT.select',
      inputs: {
        decision: 'switchAverage',
        phases: switchParts.simulation.phases.length,
      },
      value: evKmPerYear,
      resultPath: 'evKmPerYear',
    });
  } else {
    link(input.optimizeFrom, 'OPT.select', 'evKmPerYear');
  }

  // Cost parts: the formulas of section 8 on the yearly quantities of the plan.
  const evPerKm = effectiveEvMaintenancePerKm(candidate, parameters);
  // K_ICE = total km - K_EV as in the spec; it can differ from the plan's own
  // petrol km by about one ulp.
  const kIce = (() => {
    const from = mark();
    const value = iceKmPerYear(
      quantities.evKm + quantities.iceKm,
      switchParts ? evKmPerYear : quantities.evKm,
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
  /** Electricity or petrol of the plan with switch points: the sum of its phases. */
  const switchEnergy = (carrier: 'electricity' | 'petrol', path: string) => {
    if (!switchParts) throw new Error('No plan with switch points.');
    const phases = switchParts.figures.perPhase;
    const value = switchParts.figures[carrier];
    trace?.add({
      formula: 'OPT.switchCost',
      inputs: {
        carrier,
        phases: phases.length,
        ...Object.fromEntries(
          phases.map((p, at) => [`phase${at + 1}`, p[carrier]]),
        ),
      },
      value,
      resultPath: path,
    });
    return value;
  };
  const electricity = (() => {
    if (switchParts) return switchEnergy('electricity', 'costs.electricity');
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
    if (switchParts) return switchEnergy('petrol', 'costs.petrol');
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
  let from = mark();
  const kEnd = sohKEnd(candidate.mileageKm, evKmPerYear, months, trace);
  link(from, 'F2.kEnd', 'evOdometerEnd');
  from = mark();
  const sohEnd = sohAt(curve, kEnd, trace);
  link(from, 'F2.soh', 'sohEnd');
  from = mark();
  // The plan with switch points drives each entry only while it is suitable,
  // so the suitability is checked at the start.
  const sohCheck = sohAt(
    curve,
    !switchParts && effectiveSohReference(parameters) === 'end'
      ? kEnd
      : candidate.mileageKm,
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
        belowMinReserve: check.belowMinReserve,
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

  const timeline = buildTimeline({
    problem,
    curve,
    mileageKm: candidate.mileageKm,
    evKmPerYear,
    comparisonMonths: months,
    trace,
    phases: switchParts?.simulation.phases,
  });

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
  // The budget, `budgetExtraCost` and `budgetExceeded` stay the values of the
  // optimizer's run for plan P: the budget holds the rate before the first
  // switch (conservative, spec "Leasing und Garantie"), and the extra cost is
  // not recomputed (decision 22 of docs/change-soh-plan.md).
  const { remaining, budget } = outcome;
  // The plan with switch points has its own rate, so the years to the km limit
  // are computed again; the optimizer's entries of plan P stay unlinked.
  const warrantyFrom = switchParts ? mark() : input.optimizeFrom;
  const yearsToKmLimit = switchParts
    ? {
        vehicle: isExpired(remaining.vehicle)
          ? null
          : yearsToKmLimitOf(remaining.vehicle.km, evKmPerYear, trace),
        battery: isExpired(remaining.battery)
          ? null
          : yearsToKmLimitOf(remaining.battery.km, evKmPerYear, trace),
      }
    : outcome.yearsToKmLimit;
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
          at >= warrantyFrom && entry.formula === 'OPT.yearsToKmLimit',
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
    evOdometerEnd: kEnd,
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
    timeline,
    planSwitch: input.planSwitch
      ? traceSwitch(input.planSwitch, problem, switchParts, curve, trace)
      : null,
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

/**
 * Gives every number of `planSwitch` its entry in the Rechenweg (Q6): the two
 * target costs, per event the SoH and the rate after it, and the time the
 * plan ran out of options. The month of an event is a label.
 */
function traceSwitch(
  planSwitch: PlanSwitch,
  problem: Problem,
  parts: SwitchPlanParts | undefined,
  curve: ReturnType<typeof sohCurve>,
  trace: Trace | undefined,
): PlanSwitch {
  if (!trace) return planSwitch;
  const target = (plan: 'switch' | 'fixed', value: number | null) => {
    if (value === null) return;
    trace.add({
      formula: 'OPT.target',
      inputs: { plan },
      value,
      resultPath: `planSwitch.${plan}TargetCost`,
    });
  };
  target('switch', planSwitch.switchTargetCost);
  target('fixed', planSwitch.fixedTargetCost);
  if (planSwitch.infeasibleAfterMonths !== null) {
    trace.add({
      formula: 'OPT.suitableUntil',
      inputs: { plan: 'switch', result: 'noOptionLeft' },
      value: planSwitch.infeasibleAfterMonths,
      resultPath: 'planSwitch.infeasibleAfterMonths',
    });
  }
  const events = planSwitch.events.map((event, at) => {
    const source = parts?.simulation.events[at];
    const soh = sohAt(
      curve,
      odometerAt(problem, parts?.simulation.phases ?? [], event.month),
      trace,
    );
    trace.link(trace.entries.length - 1, `planSwitch.events[${at}].soh`);
    trace.add({
      formula: 'OPT.switchEvent',
      inputs: {
        event: at + 1,
        month: event.month,
        threshold: source?.threshold ?? 0,
        rateBefore: source?.rateBefore ?? 0,
      },
      value: event.evKmPerYear,
      resultPath: `planSwitch.events[${at}].evKmPerYear`,
    });
    return { ...event, soh };
  });
  return { ...planSwitch, events };
}
