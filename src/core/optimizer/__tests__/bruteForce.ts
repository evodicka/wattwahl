import type { SolverInput } from '../types';

// Reference for the dynamic programming (Q4, TC13): tries every combination of
// options on the same discretised problem. Test code only; the lint rule keeps
// it out of the production build.

export type BruteForceResult =
  | { status: 'ok'; targetCost: number; evKmPerYear: number }
  | { status: 'unsuitable' };

export function bruteForce(input: SolverInput): BruteForceResult {
  const { groups, thresholds, cellKm, gridKm } = input;
  const budget = input.budgetKmPerYear;

  type Candidate = { cells: number; target: number };
  const feasible: Candidate[] = [];

  const visit = (
    index: number,
    cells: number,
    cost: number,
    needs: number[],
  ) => {
    if (index === groups.length) {
      const km = cells * cellKm;
      const soh = input.sohForKmPerYear(Math.ceil(km / gridKm) * gridKm);
      const allowed = (pair: number) => (thresholds[pair] as number) <= soh;
      const ok = input.strict
        ? thresholds.every((_, pair) => allowed(pair))
        : needs.every(allowed);
      if (ok) feasible.push({ cells, target: cost + input.offerCost(km) });
      return;
    }
    for (const option of groups[index]?.options ?? []) {
      visit(
        index + 1,
        cells + Math.ceil(option.km / cellKm),
        cost + option.cost,
        option.needs === null ? needs : [...needs, option.needs],
      );
    }
  };
  visit(0, 0, 0, []);

  if (feasible.length === 0) return { status: 'unsuitable' };
  const within =
    budget === null
      ? feasible
      : feasible.filter((candidate) => candidate.cells * cellKm <= budget);
  // Over budget with no way back: the smallest feasible distance, then the cheapest.
  const pool =
    within.length > 0
      ? within
      : feasible.filter(
          (candidate) =>
            candidate.cells === Math.min(...feasible.map((c) => c.cells)),
        );
  const best = pool.reduce((a, b) => (b.target < a.target ? b : a));
  return {
    status: 'ok',
    targetCost: best.target,
    evKmPerYear: best.cells * cellKm,
  };
}
