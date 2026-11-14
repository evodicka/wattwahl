import type { CandidateCompute, ScenarioCompute, Weekday } from '../../domain';
import {
  effectiveDepreciationPct,
  leaseCost,
  purchaseCost,
} from '../calc/costs';
import type { Trace } from '../trace';
import {
  DP_CELL_KM,
  WAYS,
  type GroupInfo,
  type Problem,
  type Way,
} from './problem';
import { solve } from './select';
import type { Selection } from './types';
import { warrantyBudget, type WarrantyBudget } from './warranty';

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
      /** SoH of the raster bucket the plan was checked at. */
      bucketSoh: number;
    };

/** Finds the most telling reason for an unsuitable offer at the best possible SoH. */
function explain(
  problem: Problem,
  selection: Extract<Selection, { status: 'unsuitable' }>,
): UnsuitableReason {
  const soh = selection.bestSoh;
  const worstPair = (): UnsuitableReason => {
    let worst: UnsuitableReason | null = null;
    for (const way of WAYS) {
      for (let month = 0; month < 12; month++) {
        const reserveKm = problem.checkWayAt(way, month, soh).reserveKm;
        if (worst?.kind !== 'strict' || reserveKm < worst.reserveKm) {
          worst = { kind: 'strict', way, month, reserveKm, soh };
        }
      }
    }
    if (!worst) throw new Error('No way to explain.');
    return worst;
  };
  if (selection.cause === 'strict') return worstPair();

  // The "both" state whose better way is the furthest from being drivable.
  let worst: UnsuitableReason | null = null;
  let worstBest = Infinity;
  problem.info.forEach((info) => {
    if (info.kind !== 'day' || info.state !== 'both') {
      return;
    }
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
  return worst ?? worstPair();
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

  const selection = solve(
    {
      groups: problem.groups,
      thresholds: problem.thresholds,
      sohForKmPerYear: problem.sohForKmPerYear,
      reserveAtSoh: problem.reserveAtSoh,
      offerCost:
        offer.kind === 'purchase'
          ? () => purchase
          : (evKmPerYear) => leaseCost(offer.tier, evKmPerYear, months).total,
      budgetKmPerYear: budget.active ? budget.budgetKmPerYear : null,
      strict: parameters.strictMode,
      gridKm: parameters.kmGridPerYear,
      cellKm: DP_CELL_KM,
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
    bucketSoh: selection.bucketSoh,
  };
}
