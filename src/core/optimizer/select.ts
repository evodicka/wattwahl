import type { Trace } from '../trace';
import { dpTable, planner, prepare, type Prepared } from './knapsack';
import type { Selection, SolverInput } from './types';

// Steps 2, 4 and 5 of the algorithm (spec "Algorithmus"): option sets per SoH
// bucket, target cost per cell, and the choice with budget and tie rule.

/** Costs within this band count as equal (spec step 5, EUR). */
export const TIE_BAND = 0.01;

const MAX_PAIRS = 30;

/** What the DP depends on: the candidate and the price case, not the offer. */
export type SolverSetup = Pick<
  SolverInput,
  'groups' | 'thresholds' | 'sohForKmPerYear' | 'gridKm' | 'cellKm'
>;

/** What differs per offer: its cost, budget, strict mode and the tie-rule reserve. */
export type OfferInput = Pick<
  SolverInput,
  'offerCost' | 'budgetKmPerYear' | 'strict' | 'reserveAtSoh'
>;

export type Solver = {
  solve: (offer: OfferInput, trace?: Trace) => Selection;
  /**
   * The set of allowed options is the same at every EV rate: no threshold lies
   * between the SoH at the start and the lowest SoH any plan can reach. Then
   * the SoH can never take an option away during the comparison.
   */
  allowedSetIsConstant: boolean;
};

type Table = { cost: Float64Array; km: Float64Array };

/**
 * The DP of a set of groups, computed per option set on first use. Solvers
 * over the same groups that differ only in their SoH lookup (mode `switch`:
 * the SoH at the end and at the start) share it, so the second solver costs
 * almost nothing.
 */
export type SharedDp = {
  prep: Prepared;
  tables: Map<number, Table | null>;
  planners: Map<number, (cell: number) => number[]>;
};

export function createSharedDp(
  groups: SolverSetup['groups'],
  cellKm: number,
): SharedDp {
  return {
    prep: prepare(groups, cellKm),
    tables: new Map(),
    planners: new Map(),
  };
}

type Context = {
  setup: SolverSetup;
  prep: Prepared;
  bucketOfCell: (cell: number) => number;
  /** Bit mask of the permission pairs that hold at the SoH of each bucket. */
  maskOfBucket: number[];
  bucketSoh: number[];
};

function buildContext(setup: SolverSetup, prep: Prepared): Context {
  if (setup.thresholds.length > MAX_PAIRS) {
    throw new RangeError(
      `At most ${MAX_PAIRS} permission pairs are supported.`,
    );
  }
  const bucketOfCell = (cell: number): number =>
    Math.ceil((cell * setup.cellKm) / setup.gridKm);
  const buckets = bucketOfCell(prep.maxCell) + 1;
  const maskOfBucket: number[] = [];
  const bucketSoh: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket++) {
    const soh = setup.sohForKmPerYear(bucket * setup.gridKm);
    let mask = 0;
    setup.thresholds.forEach((threshold, pair) => {
      if (threshold <= soh) mask |= 1 << pair;
    });
    maskOfBucket.push(mask);
    bucketSoh.push(soh);
  }
  return { setup, prep, bucketOfCell, maskOfBucket, bucketSoh };
}

/**
 * Builds the solver of one candidate and price case. The expensive parts, the
 * DP per option set and the plan reconstruction, are computed on first use and
 * shared by every offer of the candidate (purchase and lease tiers); only the
 * cheap target and selection pass runs per offer.
 */
export function createSolver(
  setup: SolverSetup,
  shared: SharedDp = createSharedDp(setup.groups, setup.cellKm),
): Solver {
  const { prep, tables: dp, planners } = shared;
  const ctx = buildContext(setup, prep);
  const fullMask = (1 << setup.thresholds.length) - 1;
  const tableFor = (mask: number): Table | null => {
    if (!dp.has(mask)) dp.set(mask, dpTable(prep, mask));
    return dp.get(mask) ?? null;
  };

  function attempt(
    offer: OfferInput,
    strict: boolean,
    trace?: Trace,
  ): Selection {
    const seen = new Set<number>();
    const allowedTable = (mask: number): Table | null => {
      if (strict && mask !== fullMask) return null;
      const table = tableFor(mask);
      if (trace && !seen.has(mask)) {
        seen.add(mask);
        trace.add({
          formula: 'OPT.optionSet',
          inputs: { mask, strict },
          value: table !== null,
        });
      }
      return table;
    };

    // Target cost per cell; Infinity where no allowed plan has exactly that many cells.
    // The distance of a cell is the exact km of its cheapest plan (fewest km on
    // equal cost): the budget and the offer cost use it. Only the SoH bucket
    // uses the rounded-up cell count (E2), which is the safe side: the SoH of
    // the bucket is at most the SoH of the exact distance.
    const target = new Float64Array(prep.maxCell + 1).fill(Infinity);
    const distance = new Float64Array(prep.maxCell + 1).fill(Infinity);
    let globalMin = Infinity;
    let minBudget = Infinity;
    let smallestFeasible = -1;
    const budget = offer.budgetKmPerYear;
    for (let cell = 0; cell <= prep.maxCell; cell++) {
      const table = allowedTable(
        ctx.maskOfBucket[ctx.bucketOfCell(cell)] as number,
      );
      const variable = table ? (table.cost[cell] as number) : Infinity;
      if (variable === Infinity || !table) continue;
      const km = table.km[cell] as number;
      const value = variable + offer.offerCost(km);
      target[cell] = value;
      distance[cell] = km;
      // Over budget with no way back: the smallest feasible distance, then the cheaper one.
      if (
        smallestFeasible < 0 ||
        km < (distance[smallestFeasible] as number) ||
        (km === distance[smallestFeasible] &&
          value < (target[smallestFeasible] as number))
      ) {
        smallestFeasible = cell;
      }
      globalMin = Math.min(globalMin, value);
      if (budget === null || km <= budget) {
        minBudget = Math.min(minBudget, value);
      }
    }

    if (smallestFeasible < 0) {
      // The fewest km any plan can have, ignoring permissions, gives the best
      // SoH any plan can have: an upper bound, so no plan is better off.
      const bestKm = Math.ceil(prep.minKm / setup.gridKm) * setup.gridKm;
      return {
        status: 'unsuitable',
        cause: 'groups',
        bestSoh: setup.sohForKmPerYear(bestKm),
        bestKmPerYear: bestKm,
      };
    }

    // The pool the choice is made from. With nothing inside the budget the
    // smallest feasible distance is taken and no tie rule applies.
    const inBudget = minBudget !== Infinity;
    const budgetExtraCost = inBudget ? Math.max(0, minBudget - globalMin) : 0;
    const reserves = new Map<number, number>();
    const reserveOfBucket = (bucket: number): number => {
      if (!reserves.has(bucket)) {
        reserves.set(
          bucket,
          offer.reserveAtSoh(ctx.bucketSoh[bucket] as number),
        );
      }
      return reserves.get(bucket) as number;
    };

    let chosen = smallestFeasible;
    if (inBudget) {
      chosen = -1;
      for (let cell = 0; cell <= prep.maxCell; cell++) {
        const value = target[cell] as number;
        if (value === Infinity) continue;
        if (budget !== null && (distance[cell] as number) > budget) continue;
        if (value > minBudget + TIE_BAND) continue;
        if (chosen < 0) {
          chosen = cell;
          continue;
        }
        // Larger smallest reserve wins; on equal reserve the smaller EV
        // distance (on equal distance the smaller cell, which stays).
        const reserve = reserveOfBucket(ctx.bucketOfCell(cell));
        const chosenReserve = reserveOfBucket(ctx.bucketOfCell(chosen));
        if (
          reserve > chosenReserve ||
          (reserve === chosenReserve &&
            (distance[cell] as number) < (distance[chosen] as number))
        ) {
          chosen = cell;
        }
      }
    }

    const bucket = ctx.bucketOfCell(chosen);
    const mask = ctx.maskOfBucket[bucket] as number;
    if (!planners.has(mask)) planners.set(mask, planner(prep, mask));
    const optionIndex = (planners.get(mask) as (cell: number) => number[])(
      chosen,
    );
    let evKmPerYear = 0;
    let variableCost = 0;
    setup.groups.forEach((group, index) => {
      const option = group.options[optionIndex[index] as number];
      if (!option) throw new RangeError(`Bad option for group ${group.key}.`);
      evKmPerYear += option.km;
      variableCost += option.cost;
    });
    const targetCost = variableCost + offer.offerCost(evKmPerYear);
    trace?.add({
      formula: 'OPT.target',
      inputs: { cell: chosen, evKmPerYear, variableCost },
      value: targetCost,
    });
    trace?.add({
      formula: 'OPT.select',
      inputs: { cell: chosen, tieBand: TIE_BAND },
      value: evKmPerYear,
    });
    if (budget !== null) {
      trace?.add({
        formula: 'OPT.budgetExtraCost',
        inputs: {
          budgetKmPerYear: budget,
          globalMin,
          // Nothing fits the budget: there is no cheapest plan within it.
          minBudget: inBudget ? minBudget : 'none',
        },
        value: budgetExtraCost,
      });
    }
    return {
      status: 'ok',
      optionIndex,
      evKmPerYear,
      variableCost,
      targetCost,
      bucketSoh: ctx.bucketSoh[bucket] as number,
      budgetExtraCost,
      budgetExceeded: budget !== null && !inBudget,
    };
  }

  return {
    allowedSetIsConstant: ctx.maskOfBucket.every(
      (mask) => mask === ctx.maskOfBucket[0],
    ),
    solve(offer, trace) {
      const result = attempt(offer, offer.strict, trace);
      if (result.status === 'unsuitable' && offer.strict) {
        // Unsuitable only because of strict mode? Then say so. The relaxed
        // run is not traced: it is not part of the Rechenweg of this offer.
        if (attempt(offer, false).status === 'ok') {
          return { ...result, cause: 'strict' };
        }
      }
      return result;
    },
  };
}

/**
 * Picks the cheapest allowed plan: for every cell the cheapest plan the SoH of
 * its bucket allows, then the cell with the lowest target cost within the
 * budget, ties by larger smallest reserve and smaller EV distance. For several
 * offers of one candidate use `createSolver` and share it.
 */
export function solve(input: SolverInput, trace?: Trace): Selection {
  return createSolver(input).solve(input, trace);
}
