// Generic layer of the optimizer (spec "Optimierung", architecture 5.2). The
// solver knows nothing about scenarios: it gets decision groups, SoH
// thresholds and a few functions. The problem builder (problem.ts) maps a
// scenario to this form, and brute force and Q4 run directly on it.

/** One choice inside a decision group. */
export type Option = {
  /** Yearly EV km of this option. */
  km: number;
  /** Variable cost over the comparison period: energy of both cars and maintenance. */
  cost: number;
  /** Index of the permission pair the option needs, or null if it is always allowed. */
  needs: number | null;
  /** What the option means; the problem builder decodes it. */
  choice: string;
  /** For an extra-mileage option: the share of the km the EV takes, in percent. */
  sharePct?: number;
  /**
   * Yearly quantities behind `cost`, so the result can show electricity,
   * petrol and maintenance separately (F8.energy, F8.maintenance).
   */
  quantities?: { gridKwh: number; litres: number; iceKm: number };
};

/** Exactly one option is chosen per group (the knapsack picks one item per class). */
export type Group = { key: string; options: readonly Option[] };

export type SolverInput = {
  groups: readonly Group[];
  /**
   * Per permission pair: the lowest SoH at which the options that need it are
   * allowed (OPT.threshold). At most 30 pairs.
   */
  thresholds: readonly number[];
  /** SoH used for the suitability check when the EV drives `kmPerYear` per year. */
  sohForKmPerYear: (kmPerYear: number) => number;
  /** Smallest reserve over all ways and months at a SoH, for the tie rule (larger wins). */
  reserveAtSoh: (soh: number) => number;
  /** Acquisition or lease cost over the comparison period, as a function of the yearly EV km. */
  offerCost: (evKmPerYear: number) => number;
  /** Warranty budget in km per year, or null if it is not active. */
  budgetKmPerYear: number | null;
  /** Strict mode: the EV must be able to drive every way in every month. */
  strict: boolean;
  /** Raster of the SoH lookup in km per year (spec: 250). */
  gridKm: number;
  /** Size of one DP cell in km per year (architecture 8.4: 1). */
  cellKm: number;
};

export type Selection =
  | {
      status: 'ok';
      /** Index of the chosen option per group, in group order. */
      optionIndex: number[];
      /** Exact yearly EV km of the chosen plan. */
      evKmPerYear: number;
      /** Sum of the exact option costs. */
      variableCost: number;
      /** Variable cost plus the offer cost at the exact EV km. */
      targetCost: number;
      /** SoH of the raster bucket the plan was checked at. */
      bucketSoh: number;
      /** The budget is active but the cheapest plan within it is not the cheapest overall. */
      budgetExtraCost: number;
      /** The plan forces more km than the budget allows (warning, spec "Garantie-Budget"). */
      budgetExceeded: boolean;
    }
  | {
      status: 'unsuitable';
      /** `groups`: a group has no allowed option. `strict`: only strict mode fails. */
      cause: 'groups' | 'strict';
      /** Best SoH any plan can have (at the smallest possible EV km). */
      bestSoh: number;
    };
