import type { Trace } from '../trace';
import { dpCosts, prepare, reconstruct, type Prepared } from './knapsack';
import type { Selection, SolverInput } from './types';

// Steps 2, 4 and 5 of the algorithm (spec "Algorithmus"): option sets per SoH
// bucket, target cost per cell, and the choice with budget and tie rule.

/** Costs within this band count as equal (spec step 5, EUR). */
export const TIE_BAND = 0.01;

const MAX_PAIRS = 30;

type Context = {
  input: SolverInput;
  prep: Prepared;
  bucketOfCell: (cell: number) => number;
  /** Bit mask of the permission pairs that hold at the SoH of each bucket. */
  maskOfBucket: number[];
  bucketSoh: number[];
};

function buildContext(input: SolverInput, prep: Prepared): Context {
  if (input.thresholds.length > MAX_PAIRS) {
    throw new RangeError(
      `At most ${MAX_PAIRS} permission pairs are supported.`,
    );
  }
  const bucketOfCell = (cell: number): number =>
    Math.ceil((cell * input.cellKm) / input.gridKm);
  const buckets = bucketOfCell(prep.maxCell) + 1;
  const maskOfBucket: number[] = [];
  const bucketSoh: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket++) {
    const soh = input.sohForKmPerYear(bucket * input.gridKm);
    let mask = 0;
    input.thresholds.forEach((threshold, pair) => {
      if (threshold <= soh) mask |= 1 << pair;
    });
    maskOfBucket.push(mask);
    bucketSoh.push(soh);
  }
  return { input, prep, bucketOfCell, maskOfBucket, bucketSoh };
}

function attempt(
  input: SolverInput,
  prep: Prepared,
  ctx: Context,
  strict: boolean,
  trace?: Trace,
): Selection {
  const fullMask = (1 << input.thresholds.length) - 1;
  const dp = new Map<number, Float64Array | null>();
  const costsFor = (mask: number): Float64Array | null => {
    if (strict && mask !== fullMask) return null;
    if (!dp.has(mask)) {
      dp.set(mask, dpCosts(prep, mask));
      trace?.add({
        formula: 'OPT.optionSet',
        inputs: { mask, strict },
        value: dp.get(mask) !== null,
      });
    }
    return dp.get(mask) ?? null;
  };

  // Target cost per cell; Infinity where no allowed plan has exactly that many cells.
  const target = new Float64Array(prep.maxCell + 1).fill(Infinity);
  let globalMin = Infinity;
  let minBudget = Infinity;
  let smallestFeasible = -1;
  const budget = input.budgetKmPerYear;
  for (let cell = 0; cell <= prep.maxCell; cell++) {
    const costs = costsFor(ctx.maskOfBucket[ctx.bucketOfCell(cell)] as number);
    const variable = costs ? (costs[cell] as number) : Infinity;
    if (variable === Infinity) continue;
    const value = variable + input.offerCost(cell * input.cellKm);
    target[cell] = value;
    if (smallestFeasible < 0) smallestFeasible = cell;
    globalMin = Math.min(globalMin, value);
    if (budget === null || cell * input.cellKm <= budget) {
      minBudget = Math.min(minBudget, value);
    }
  }

  if (smallestFeasible < 0) {
    const lowerBound = prep.minCell * input.cellKm;
    return {
      status: 'unsuitable',
      cause: 'groups',
      bestSoh: input.sohForKmPerYear(
        Math.ceil(lowerBound / input.gridKm) * input.gridKm,
      ),
    };
  }

  // The pool the choice is made from, and the cost its best cell has to beat.
  const inBudget = minBudget !== Infinity;
  const reference = inBudget ? minBudget : (target[smallestFeasible] as number);
  const budgetExtraCost = inBudget ? Math.max(0, minBudget - globalMin) : 0;
  const reserves = new Map<number, number>();
  const reserveOfBucket = (bucket: number): number => {
    if (!reserves.has(bucket)) {
      reserves.set(bucket, input.reserveAtSoh(ctx.bucketSoh[bucket] as number));
    }
    return reserves.get(bucket) as number;
  };

  let chosen = -1;
  if (!inBudget) {
    chosen = smallestFeasible;
  } else {
    for (let cell = 0; cell <= prep.maxCell; cell++) {
      const value = target[cell] as number;
      if (value === Infinity) continue;
      if (budget !== null && cell * input.cellKm > budget) continue;
      if (value > reference + TIE_BAND) continue;
      if (chosen < 0) {
        chosen = cell;
        continue;
      }
      // Larger smallest reserve wins; on equal reserve the smaller EV distance
      // (cells ascend, so the first one stays).
      const better =
        reserveOfBucket(ctx.bucketOfCell(cell)) >
        reserveOfBucket(ctx.bucketOfCell(chosen));
      if (better) chosen = cell;
    }
  }

  const bucket = ctx.bucketOfCell(chosen);
  const optionIndex = reconstruct(
    prep,
    ctx.maskOfBucket[bucket] as number,
    chosen,
  );
  let evKmPerYear = 0;
  let variableCost = 0;
  input.groups.forEach((group, index) => {
    const option = group.options[optionIndex[index] as number];
    if (!option) throw new RangeError(`Bad option for group ${group.key}.`);
    evKmPerYear += option.km;
    variableCost += option.cost;
  });
  const targetCost = variableCost + input.offerCost(evKmPerYear);
  const selection: Selection = {
    status: 'ok',
    optionIndex,
    evKmPerYear,
    variableCost,
    targetCost,
    bucketSoh: ctx.bucketSoh[bucket] as number,
    budgetExtraCost,
    budgetExceeded: budget !== null && !inBudget,
  };
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
      inputs: { budgetKmPerYear: budget, globalMin, minBudget },
      value: budgetExtraCost,
    });
  }
  return selection;
}

/**
 * Picks the cheapest allowed plan: for every cell the cheapest plan the SoH of
 * its bucket allows, then the cell with the lowest target cost within the
 * budget, ties by larger smallest reserve and smaller EV distance.
 */
export function solve(input: SolverInput, trace?: Trace): Selection {
  const prep = prepare(input.groups, input.cellKm);
  const ctx = buildContext(input, prep);
  const result = attempt(input, prep, ctx, input.strict, trace);
  if (result.status === 'unsuitable' && input.strict) {
    // Unsuitable only because of strict mode? Then say so.
    const relaxed = attempt(input, prep, ctx, false);
    if (relaxed.status === 'ok') {
      return { ...result, cause: 'strict' };
    }
  }
  return result;
}
