import { TIE_BAND } from '../select';
import type { SolverInput } from '../types';

// Reference for the dynamic programming (Q4, TC13): tries every combination of
// options on the same discretised problem and applies the selection rules
// (budget, tie band, reserve, distance) again on its own. Test code only; the
// lint rule keeps it out of the production build.
//
// Per number of cells it keeps the cheapest combination, and among equally
// cheap ones the one with the fewest exact km. The budget, the offer cost and
// the "smaller distance" rule use those exact km; the SoH uses the rounded-up
// cells (architecture 8.4).

export type BruteForceResult =
  | {
      status: 'ok';
      /** Cells of the chosen plan: the rounded-up yearly EV km over the cell size. */
      cells: number;
      /** Exact yearly EV km of the chosen plan. */
      evKmPerYear: number;
      /** Variable cost plus offer cost at the exact km, the cost the choice is made on. */
      targetCost: number;
      budgetExtraCost: number;
      budgetExceeded: boolean;
    }
  | { status: 'unsuitable' };

type Plan = { cells: number; km: number; cost: number; target: number };

export function bruteForce(input: SolverInput): BruteForceResult {
  const { groups, thresholds, cellKm, gridKm } = input;
  const budget = input.budgetKmPerYear;
  const sohOfCells = (cells: number): number =>
    input.sohForKmPerYear(Math.ceil((cells * cellKm) / gridKm) * gridKm);

  const cheapest = new Map<number, Plan>();
  const visit = (
    index: number,
    cells: number,
    km: number,
    cost: number,
    needs: number[],
  ) => {
    if (index === groups.length) {
      const soh = sohOfCells(cells);
      const allowed = (pair: number) => (thresholds[pair] as number) <= soh;
      const ok = input.strict
        ? thresholds.every((_, pair) => allowed(pair))
        : needs.every(allowed);
      if (!ok) return;
      const known = cheapest.get(cells);
      if (
        !known ||
        cost < known.cost ||
        (cost === known.cost && km < known.km)
      ) {
        cheapest.set(cells, {
          cells,
          km,
          cost,
          target: cost + input.offerCost(km),
        });
      }
      return;
    }
    for (const option of groups[index]?.options ?? []) {
      visit(
        index + 1,
        cells + Math.ceil(option.km / cellKm),
        km + option.km,
        cost + option.cost,
        option.needs === null ? needs : [...needs, option.needs],
      );
    }
  };
  visit(0, 0, 0, 0, []);

  const plans = [...cheapest.values()].sort((a, b) => a.cells - b.cells);
  if (plans.length === 0) return { status: 'unsuitable' };

  const globalMin = Math.min(...plans.map((plan) => plan.target));
  const within = plans.filter((plan) => budget === null || plan.km <= budget);
  if (within.length === 0) {
    // Over budget with no way back: the smallest feasible distance, then the cheaper plan.
    const forced = plans.reduce((best, plan) =>
      plan.km < best.km || (plan.km === best.km && plan.target < best.target)
        ? plan
        : best,
    );
    return {
      status: 'ok',
      cells: forced.cells,
      evKmPerYear: forced.km,
      targetCost: forced.target,
      budgetExtraCost: 0,
      budgetExceeded: true,
    };
  }
  const minWithin = Math.min(...within.map((plan) => plan.target));
  const tied = within.filter((plan) => plan.target <= minWithin + TIE_BAND);
  // Larger smallest reserve first, then the smaller exact distance, then fewer cells.
  const chosen = tied.reduce((best, plan) => {
    const reserve = input.reserveAtSoh(sohOfCells(plan.cells));
    const bestReserve = input.reserveAtSoh(sohOfCells(best.cells));
    return reserve > bestReserve ||
      (reserve === bestReserve && plan.km < best.km)
      ? plan
      : best;
  });
  return {
    status: 'ok',
    cells: chosen.cells,
    evKmPerYear: chosen.km,
    targetCost: chosen.target,
    budgetExtraCost: Math.max(0, minWithin - globalMin),
    budgetExceeded: false,
  };
}
