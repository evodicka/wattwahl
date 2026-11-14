import type { CandidateCompute } from '../../domain';
import type { Trace } from '../trace';
import { finiteRatio } from '../calc/units';

// Spec "Garantie-Budget": the yearly km budget from the remaining warranty.

type Warranty = CandidateCompute['vehicleWarranty'];

export type WarrantyBudget = {
  /** Both warranties are expired: no budget, the offer shows "ohne Garantie". */
  noWarranty: boolean;
  /** B in km per year, null without a running warranty. Shown even if it is not a target. */
  budgetKmPerYear: number | null;
  /** B steers the optimizer: not for leases (the tier is the limit) and only if switched on. */
  active: boolean;
};

/** A warranty with 0 years or 0 km is expired and does not enter the budget. */
export const isExpired = (warranty: Warranty): boolean =>
  warranty.years <= 0 || warranty.km <= 0;

/**
 * OPT.budget: B = min(vehicle km / years, battery km / years) over the
 * warranties that still run.
 */
export function warrantyBudget(
  vehicle: Warranty,
  battery: Warranty,
  options: { isLease: boolean; asTarget: boolean },
  trace?: Trace,
): WarrantyBudget {
  const perYear = (warranty: Warranty): number[] =>
    isExpired(warranty) ? [] : [finiteRatio(warranty.km, warranty.years)];
  const budgets = [...perYear(vehicle), ...perYear(battery)];
  const budgetKmPerYear = budgets.length > 0 ? Math.min(...budgets) : null;
  const result: WarrantyBudget = {
    noWarranty: budgetKmPerYear === null,
    budgetKmPerYear,
    active: budgetKmPerYear !== null && !options.isLease && options.asTarget,
  };
  trace?.add({
    formula: 'OPT.budget',
    inputs: {
      vehicleYears: vehicle.years,
      vehicleKm: vehicle.km,
      batteryYears: battery.years,
      batteryKm: battery.km,
      isLease: options.isLease,
      asTarget: options.asTarget,
    },
    value: budgetKmPerYear ?? 'none',
  });
  return result;
}

/** OPT.yearsToKmLimit: years until a warranty's km limit is reached at the planned yearly EV km. */
export function yearsToKmLimit(
  warrantyKm: number,
  evKmPerYear: number,
  trace?: Trace,
): number {
  const years = finiteRatio(warrantyKm, evKmPerYear);
  trace?.add({
    formula: 'OPT.yearsToKmLimit',
    inputs: { warrantyKm, evKmPerYear },
    value: years,
  });
  return years;
}
