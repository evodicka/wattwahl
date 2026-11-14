import type { CandidateCompute, ScenarioCompute, Weekday } from '../../domain';
import {
  effectiveDepreciationPct,
  leaseCost,
  purchaseCost,
} from '../calc/costs';
import type { Trace } from '../trace';
import { WAYS, type GroupInfo, type Problem, type Way } from './problem';
import type { Selection } from './types';
import {
  isExpired,
  warrantyBudget,
  yearsToKmLimit,
  type WarrantyBudget,
} from './warranty';

type LeaseTier = CandidateCompute['leaseTiers'][number];

/** The two kinds of offer the optimizer prices; a candidate has one purchase and up to four leases. */
export type OfferTerms =
  { kind: 'purchase' } | { kind: 'lease'; tier: LeaseTier };

/** Why no plan works (spec "Ungeeignet"); months run 0 (January) to 11. */
export type UnsuitableReason =
  | {
      kind: 'both';
      weekday: Weekday;
      month: number;
      /** Reserve of each way in km at `soh`; negative where the EV cannot drive. */
      reserveKm: { a: number; b: number };
      soh: number;
    }
  | {
      kind: 'strict';
      way: Way;
      month: number;
      reserveKm: number;
      soh: number;
    }
  | {
      /**
       * Every way is drivable at the best SoH, but driving them lowers the SoH
       * (more EV km, less capacity) below what they need.
       */
      kind: 'coupling';
      soh: number;
    };

export type PlanEntry = {
  info: GroupInfo;
  /** `evA`, `evB`, `rest` (EV rests) or `share:<percent>` for the extra mileage. */
  choice: string;
};

export type OptimizerOutcome =
  | { status: 'unsuitable'; reason: UnsuitableReason; budget: WarrantyBudget }
  | {
      status: 'ok';
      plan: PlanEntry[];
      /** Exact yearly EV km of the plan (K_EV). */
      evKmPerYear: number;
      /** Energy and maintenance over the comparison period. */
      variableCost: number;
      /** Variable cost plus purchase or lease cost. */
      targetCost: number;
      budget: WarrantyBudget;
      budgetExtraCost: number;
      budgetExceeded: boolean;
      /**
       * With `budgetExceeded`: years until each running warranty reaches its km
       * limit at the planned EV km (the warning of spec "Garantie-Budget").
       * `null` for an expired warranty, and for both when the budget is met.
       */
      yearsToKmLimit: { vehicle: number | null; battery: number | null } | null;
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
  const budget = warrantyBudget(
    candidate.vehicleWarranty,
    candidate.batteryWarranty,
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
      budget,
    };
  }
  return {
    status: 'ok',
    plan: problem.groups.map((group, index) => ({
      info: problem.info[index] as GroupInfo,
      choice: (
        group.options[selection.optionIndex[index] as number] as {
          choice: string;
        }
      ).choice,
    })),
    evKmPerYear: selection.evKmPerYear,
    variableCost: selection.variableCost,
    targetCost: selection.targetCost,
    budget,
    budgetExtraCost: selection.budgetExtraCost,
    budgetExceeded: selection.budgetExceeded,
    yearsToKmLimit: selection.budgetExceeded
      ? {
          vehicle: !isExpired(candidate.vehicleWarranty)
            ? yearsToKmLimit(
                candidate.vehicleWarranty.km,
                selection.evKmPerYear,
                trace,
              )
            : null,
          battery: !isExpired(candidate.batteryWarranty)
            ? yearsToKmLimit(
                candidate.batteryWarranty.km,
                selection.evKmPerYear,
                trace,
              )
            : null,
        }
      : null,
    bucketSoh: selection.bucketSoh,
  };
}
