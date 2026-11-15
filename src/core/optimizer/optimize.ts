import type {
  CandidateCompute,
  ScenarioCompute,
  UnsuitableReason,
} from '../../domain';
import {
  effectiveDepreciationPct,
  leaseCost,
  purchaseCost,
} from '../calc/costs';
import type { Trace } from '../trace';
import { WAYS, type GroupInfo, type Problem } from './problem';
import type { Selection } from './types';
import {
  isExpired,
  remainingWarranty,
  warrantyBudget,
  yearsToKmLimit,
  type RemainingWarranty,
  type WarrantyBudget,
} from './warranty';

type LeaseTier = CandidateCompute['leaseTiers'][number];

/** The two kinds of offer the optimizer prices; a candidate has one purchase and up to four leases. */
export type OfferTerms =
  { kind: 'purchase' } | { kind: 'lease'; tier: LeaseTier };

export type PlanEntry = {
  info: GroupInfo;
  /** `evA`, `evB`, `rest` (EV rests) or `share:<percent>` for the extra mileage. */
  choice: string;
  /** With `share:<percent>`: that percent as a number. */
  sharePct?: number;
};

/** Remaining warranties of the candidate at the reference month. */
export type RemainingWarranties = {
  vehicle: RemainingWarranty;
  battery: RemainingWarranty;
};

export type OptimizerOutcome =
  | {
      status: 'unsuitable';
      reason: UnsuitableReason;
      remaining: RemainingWarranties;
      budget: WarrantyBudget;
    }
  | {
      status: 'ok';
      plan: PlanEntry[];
      /** Exact yearly EV km of the plan (K_EV). */
      evKmPerYear: number;
      /** Energy and maintenance over the comparison period. */
      variableCost: number;
      /** Variable cost plus purchase or lease cost. */
      targetCost: number;
      /**
       * Yearly quantities of the plan: grid kWh, litres of petrol, km of the
       * petrol car (K_ICE) and of the EV (K_EV), for the cost parts of the result.
       */
      quantities: {
        gridKwh: number;
        litres: number;
        iceKm: number;
        evKm: number;
      };
      remaining: RemainingWarranties;
      budget: WarrantyBudget;
      budgetExtraCost: number;
      budgetExceeded: boolean;
      /**
       * Years until each running warranty reaches its km limit at the planned
       * EV km (spec "Garantie": years to the km limit against the remaining
       * warranty; with `budgetExceeded` it is the warning). `null` for an
       * expired warranty.
       */
      yearsToKmLimit: { vehicle: number | null; battery: number | null };
      /** SoH of the raster bucket the plan was checked at. */
      bucketSoh: number;
    };

type StrictReason = Extract<UnsuitableReason, { kind: 'strict' }>;

/** The way and month with the least reserve at `soh`. */
function worstPair(problem: Problem, soh: number): StrictReason {
  let worst: StrictReason | null = null;
  for (const way of WAYS) {
    for (let month = 0; month < 12; month++) {
      const reserveKm = problem.checkWayAt(way, month, soh).reserveKm;
      if (!worst || reserveKm < worst.reserveKm) {
        worst = { kind: 'strict', way, month, reserveKm, soh };
      }
    }
  }
  if (!worst) throw new Error('No way to explain.');
  return worst;
}

/** Finds the most telling reason for an unsuitable offer at the best possible SoH. */
function explain(
  problem: Problem,
  selection: Extract<Selection, { status: 'unsuitable' }>,
): UnsuitableReason {
  const soh = selection.bestSoh;
  if (selection.cause === 'strict') return worstPair(problem, soh);

  // The "both" state whose better way is the furthest below zero.
  let worst: UnsuitableReason | null = null;
  let worstBest = 0;
  problem.info.forEach((info) => {
    if (info.kind !== 'day' || info.state !== 'both') return;
    const a = problem.checkWayAt('a', info.month, soh).reserveKm;
    const b = problem.checkWayAt('b', info.month, soh).reserveKm;
    if (Math.max(a, b) < worstBest) {
      worstBest = Math.max(a, b);
      worst = {
        kind: 'both',
        weekday: info.weekday,
        month: info.month,
        reserveKm: { a, b },
        soh,
      };
    }
  });
  // No "both" day is blocked at the best SoH: the plans fail only because
  // driving them lowers the SoH.
  return worst ?? { kind: 'coupling', soh };
}

/** Sums the yearly quantities of the chosen option of every group. */
function sumQuantities(
  problem: Problem,
  optionIndex: readonly number[],
): { gridKwh: number; litres: number; iceKm: number; evKm: number } {
  const total = { gridKwh: 0, litres: 0, iceKm: 0, evKm: 0 };
  problem.groups.forEach((group, index) => {
    const option = group.options[optionIndex[index] as number];
    if (!option) throw new RangeError(`Bad option for group ${group.key}.`);
    total.evKm += option.km;
    total.gridKwh += option.quantities?.gridKwh ?? 0;
    total.litres += option.quantities?.litres ?? 0;
    total.iceKm += option.quantities?.iceKm ?? 0;
  });
  return total;
}

/**
 * The cheapest plan for one offer of a candidate (spec "Optimierung"), or why
 * there is none. `problem` is shared by all offers of the candidate.
 */
export function optimizeOffer(
  scenario: ScenarioCompute,
  candidate: CandidateCompute,
  problem: Problem,
  offer: OfferTerms,
  trace?: Trace,
): OptimizerOutcome {
  const { parameters } = scenario;
  const months = parameters.comparisonMonths;
  // The remaining warranty for every offer, leases included (spec "Restgarantie").
  const remaining: RemainingWarranties = {
    vehicle: remainingWarranty(
      'vehicle',
      candidate.vehicleWarranty,
      candidate,
      parameters.warrantyReferenceMonth,
      trace,
    ),
    battery: remainingWarranty(
      'battery',
      candidate.batteryWarranty,
      candidate,
      parameters.warrantyReferenceMonth,
      trace,
    ),
  };
  const budget = warrantyBudget(
    remaining.vehicle,
    remaining.battery,
    {
      isLease: offer.kind === 'lease',
      asTarget: parameters.warrantyBudgetAsTarget,
    },
    trace,
  );
  const purchase =
    offer.kind === 'purchase'
      ? purchaseCost(
          candidate.purchasePrice,
          effectiveDepreciationPct(candidate, parameters),
          months,
        )
      : 0;

  const selection = problem.solver.solve(
    {
      offerCost:
        offer.kind === 'purchase'
          ? () => purchase
          : (evKmPerYear) => leaseCost(offer.tier, evKmPerYear, months).total,
      budgetKmPerYear: budget.active ? budget.budgetKmPerYear : null,
      strict: parameters.strictMode,
      reserveAtSoh: problem.reserveAtSoh,
    },
    trace,
  );
  if (selection.status === 'unsuitable') {
    return {
      status: 'unsuitable',
      reason: explain(problem, selection),
      remaining,
      budget,
    };
  }
  return {
    status: 'ok',
    plan: problem.groups.map((group, index) => {
      const option = group.options[selection.optionIndex[index] as number];
      if (!option) throw new RangeError(`Bad option for group ${group.key}.`);
      return {
        info: problem.info[index] as GroupInfo,
        choice: option.choice,
        sharePct: option.sharePct,
      };
    }),
    evKmPerYear: selection.evKmPerYear,
    quantities: sumQuantities(problem, selection.optionIndex),
    variableCost: selection.variableCost,
    targetCost: selection.targetCost,
    remaining,
    budget,
    budgetExtraCost: selection.budgetExtraCost,
    budgetExceeded: selection.budgetExceeded,
    yearsToKmLimit: {
      vehicle: isExpired(remaining.vehicle)
        ? null
        : yearsToKmLimit(remaining.vehicle.km, selection.evKmPerYear, trace),
      battery: isExpired(remaining.battery)
        ? null
        : yearsToKmLimit(remaining.battery.km, selection.evKmPerYear, trace),
    },
    bucketSoh: selection.bucketSoh,
  };
}
