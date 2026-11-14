import type { Group } from './types';

// Multiple-choice knapsack over the decision groups (spec "Algorithmus", step 3):
// minimal variable cost for every exact number of yearly EV km, counted in cells.

type PreparedGroup = {
  cells: Int32Array;
  costs: Float64Array;
  /** Permission pair per option, -1 if always allowed. */
  needs: Int32Array;
};

export type Prepared = {
  groups: PreparedGroup[];
  /** Cells of the plan with the most EV km. */
  maxCell: number;
  /** Cells of the plan with the fewest EV km, ignoring permissions. */
  minCell: number;
};

/** Rounds each option's km up to whole cells, so a limit on cells also holds for exact km (E2). */
export function prepare(groups: readonly Group[], cellKm: number): Prepared {
  let maxCell = 0;
  let minCell = 0;
  const prepared = groups.map((group): PreparedGroup => {
    const count = group.options.length;
    if (count === 0 || count > 255) {
      throw new RangeError(`Group ${group.key} needs 1 to 255 options.`);
    }
    const cells = new Int32Array(count);
    const costs = new Float64Array(count);
    const needs = new Int32Array(count);
    group.options.forEach((option, index) => {
      cells[index] = Math.ceil(option.km / cellKm);
      costs[index] = option.cost;
      needs[index] = option.needs ?? -1;
    });
    maxCell += Math.max(...cells);
    minCell += Math.min(...cells);
    return { cells, costs, needs };
  });
  return { groups: prepared, maxCell, minCell };
}

const allows = (mask: number, need: number): boolean =>
  need < 0 || (mask & (1 << need)) !== 0;

function run(
  prep: Prepared,
  mask: number,
  record: boolean,
): { cost: Float64Array; choice: Uint8Array | null } | null {
  const width = prep.maxCell + 1;
  let cur = new Float64Array(width).fill(Infinity);
  cur[0] = 0;
  let next = new Float64Array(width);
  const choice = record ? new Uint8Array(prep.groups.length * width) : null;
  let span = 0;

  for (let g = 0; g < prep.groups.length; g++) {
    const group = prep.groups[g] as PreparedGroup;
    const allowed: number[] = [];
    let groupMax = 0;
    for (let o = 0; o < group.cells.length; o++) {
      if (!allows(mask, group.needs[o] as number)) continue;
      allowed.push(o);
      groupMax = Math.max(groupMax, group.cells[o] as number);
    }
    if (allowed.length === 0) return null;

    next.fill(Infinity, 0, span + groupMax + 1);
    for (let k = 0; k <= span; k++) {
      const base = cur[k] as number;
      if (base === Infinity) continue;
      for (const o of allowed) {
        const nk = k + (group.cells[o] as number);
        const value = base + (group.costs[o] as number);
        if (value < (next[nk] as number)) {
          next[nk] = value;
          if (choice) choice[g * width + nk] = o;
        }
      }
    }
    span += groupMax;
    [cur, next] = [next, cur];
  }
  // Cells beyond the reachable span still hold values of earlier layers.
  cur.fill(Infinity, span + 1);
  return { cost: cur, choice };
}

/**
 * Minimal variable cost per exact cell count when only the options allowed by
 * `mask` (a bit per permission pair) may be chosen; `Infinity` where the cell
 * count cannot be reached. `null` if some group has no allowed option.
 */
export function dpCosts(prep: Prepared, mask: number): Float64Array | null {
  return run(prep, mask, false)?.cost ?? null;
}

/** The option index per group of a cheapest plan with exactly `targetCell` cells. */
export function reconstruct(
  prep: Prepared,
  mask: number,
  targetCell: number,
): number[] {
  const result = run(prep, mask, true);
  if (
    !result?.choice ||
    (result.cost[targetCell] as number) === Infinity ||
    targetCell < 0
  ) {
    throw new RangeError(`No plan with ${targetCell} cells for mask ${mask}.`);
  }
  const width = prep.maxCell + 1;
  const picks = new Array<number>(prep.groups.length);
  let cell = targetCell;
  for (let g = prep.groups.length - 1; g >= 0; g--) {
    const group = prep.groups[g] as PreparedGroup;
    const option = result.choice[g * width + cell] as number;
    picks[g] = option;
    cell -= group.cells[option] as number;
  }
  return picks;
}
