import type { Group } from './types';

// Multiple-choice knapsack over the decision groups (spec "Algorithmus", step 3):
// minimal variable cost for every exact number of yearly EV km, counted in cells.

type PreparedGroup = {
  cells: Int32Array;
  /** Exact yearly EV km of each option. */
  km: Float64Array;
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
  /** Exact yearly EV km of the plan with the fewest EV km, ignoring permissions. */
  minKm: number;
};

/** Most options per group; the choice table stores an option index in 16 bits. */
export const MAX_OPTIONS = 65535;

/** Rounds each option's km up to whole cells, so a limit on cells also holds for exact km (E2). */
export function prepare(groups: readonly Group[], cellKm: number): Prepared {
  let maxCell = 0;
  let minCell = 0;
  let minKm = 0;
  const prepared = groups.map((group): PreparedGroup => {
    const count = group.options.length;
    if (count === 0 || count > MAX_OPTIONS) {
      throw new RangeError(
        `Group ${group.key} needs 1 to ${MAX_OPTIONS} options.`,
      );
    }
    const cells = new Int32Array(count);
    const km = new Float64Array(count);
    const costs = new Float64Array(count);
    const needs = new Int32Array(count);
    group.options.forEach((option, index) => {
      cells[index] = Math.ceil(option.km / cellKm);
      km[index] = option.km;
      costs[index] = option.cost;
      needs[index] = option.needs ?? -1;
    });
    let groupMax = 0;
    let groupMin = Infinity;
    for (const cell of cells) {
      groupMax = Math.max(groupMax, cell);
      groupMin = Math.min(groupMin, cell);
    }
    maxCell += groupMax;
    minCell += groupMin;
    minKm += Math.min(...km);
    return { cells, km, costs, needs };
  });
  return { groups: prepared, maxCell, minCell, minKm };
}

const allows = (mask: number, need: number): boolean =>
  need < 0 || (mask & (1 << need)) !== 0;

type DpResult = {
  /** Minimal variable cost per exact cell count, `Infinity` if unreachable. */
  cost: Float64Array;
  /** Exact yearly EV km of that cheapest plan (fewest km among equally cheap plans). */
  km: Float64Array;
  choice: Uint16Array | null;
};

function run(prep: Prepared, mask: number, record: boolean): DpResult | null {
  const width = prep.maxCell + 1;
  let cur = new Float64Array(width).fill(Infinity);
  let curKm = new Float64Array(width).fill(Infinity);
  cur[0] = 0;
  curKm[0] = 0;
  let next = new Float64Array(width);
  let nextKm = new Float64Array(width);
  const choice = record ? new Uint16Array(prep.groups.length * width) : null;
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
    nextKm.fill(Infinity, 0, span + groupMax + 1);
    for (let k = 0; k <= span; k++) {
      const base = cur[k] as number;
      if (base === Infinity) continue;
      const baseKm = curKm[k] as number;
      for (const o of allowed) {
        const nk = k + (group.cells[o] as number);
        const value = base + (group.costs[o] as number);
        const km = baseKm + (group.km[o] as number);
        const known = next[nk] as number;
        // Cheaper wins; at exactly equal cost the plan with fewer exact km.
        if (value < known || (value === known && km < (nextKm[nk] as number))) {
          next[nk] = value;
          nextKm[nk] = km;
          if (choice) choice[g * width + nk] = o;
        }
      }
    }
    span += groupMax;
    [cur, next] = [next, cur];
    [curKm, nextKm] = [nextKm, curKm];
  }
  // Cells beyond the reachable span still hold values of earlier layers.
  cur.fill(Infinity, span + 1);
  curKm.fill(Infinity, span + 1);
  return { cost: cur, km: curKm, choice };
}

/**
 * Minimal variable cost per exact cell count when only the options allowed by
 * `mask` (a bit per permission pair) may be chosen; `Infinity` where the cell
 * count cannot be reached. `null` if some group has no allowed option.
 */
export function dpCosts(prep: Prepared, mask: number): Float64Array | null {
  return run(prep, mask, false)?.cost ?? null;
}

/** `dpCosts` together with the exact km of each cell's cheapest plan. */
export function dpTable(
  prep: Prepared,
  mask: number,
): { cost: Float64Array; km: Float64Array } | null {
  const result = run(prep, mask, false);
  return result ? { cost: result.cost, km: result.km } : null;
}

/**
 * Runs the DP for `mask` once, keeps the choices, and returns a function that
 * gives the option index per group of a cheapest plan with exactly `targetCell`
 * cells. Reuse it for several target cells of the same mask.
 */
export function planner(
  prep: Prepared,
  mask: number,
): (targetCell: number) => number[] {
  const result = run(prep, mask, true);
  const width = prep.maxCell + 1;
  return (targetCell) => {
    if (
      !result?.choice ||
      targetCell < 0 ||
      targetCell > prep.maxCell ||
      (result.cost[targetCell] as number) === Infinity
    ) {
      throw new RangeError(
        `No plan with ${targetCell} cells for mask ${mask}.`,
      );
    }
    const picks = new Array<number>(prep.groups.length);
    let cell = targetCell;
    for (let g = prep.groups.length - 1; g >= 0; g--) {
      const group = prep.groups[g] as PreparedGroup;
      const option = result.choice[g * width + cell] as number;
      picks[g] = option;
      cell -= group.cells[option] as number;
    }
    return picks;
  };
}

/** The option index per group of a cheapest plan with exactly `targetCell` cells. */
export function reconstruct(
  prep: Prepared,
  mask: number,
  targetCell: number,
): number[] {
  return planner(prep, mask)(targetCell);
}
