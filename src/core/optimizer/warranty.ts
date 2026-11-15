import {
  ageInMonths,
  type CandidateCompute,
  type YearMonth,
} from '../../domain';
import type { Trace } from '../trace';
import { finiteRatio } from '../calc/units';

// Spec "Garantie-Budget": the yearly km budget from the remaining warranty,
// which is derived first from the normal warranty (subsection "Restgarantie").

/** Years and km of a warranty: the normal one as entered, or what remains of it. */
type Warranty = CandidateCompute['vehicleWarranty'];

/** Remaining years and km of one warranty at the reference month. */
export type RemainingWarranty = Warranty;

/**
 * OPT.remainingWarranty: a = months from first registration to the reference
 * month (at least 0), remaining years = max(0, years - a / 12), remaining km
 * = max(0, km - mileage). A new car keeps its normal warranty. Writes one
 * entry for the years and one for the km.
 */
export function remainingWarranty(
  part: 'vehicle' | 'battery',
  warranty: Warranty,
  candidate: Pick<
    CandidateCompute,
    'condition' | 'firstRegistration' | 'mileageKm'
  >,
  referenceMonth: YearMonth,
  trace?: Trace,
): RemainingWarranty {
  let ageMonths = 0;
  let remaining: RemainingWarranty = { ...warranty };
  if (candidate.condition === 'used') {
    if (!candidate.firstRegistration) {
      throw new RangeError('A used car needs its first registration.');
    }
    ageMonths = ageInMonths(candidate.firstRegistration, referenceMonth);
    remaining = {
      years: Math.max(0, warranty.years - ageMonths / 12),
      km: Math.max(0, warranty.km - candidate.mileageKm),
    };
  }
  const inputs = {
    part,
    condition: candidate.condition,
    ageMonths,
    mileageKm: candidate.mileageKm,
  };
  trace?.add({
    formula: 'OPT.remainingWarranty',
    inputs: { ...inputs, quantity: 'years', warrantyYears: warranty.years },
    value: remaining.years,
  });
  trace?.add({
    formula: 'OPT.remainingWarranty',
    inputs: { ...inputs, quantity: 'km', warrantyKm: warranty.km },
    value: remaining.km,
  });
  return remaining;
}

export type WarrantyBudget = {
  /** Both warranties are expired: no budget, the offer shows "ohne Garantie". */
  noWarranty: boolean;
  /** B in km per year, null without a running warranty. Shown even if it is not a target. */
  budgetKmPerYear: number | null;
  /** B steers the optimizer: not for leases (the tier is the limit) and only if switched on. */
  active: boolean;
};

/** A warranty with 0 years or 0 km is expired and does not enter the budget. */
export const isExpired = (warranty: RemainingWarranty): boolean =>
  warranty.years <= 0 || warranty.km <= 0;

/**
 * OPT.budget: B = min(vehicle km / years, battery km / years) over the
 * warranties that still run.
 */
export function warrantyBudget(
  /** Remaining warranties from `remainingWarranty`, not the normal ones. */
  vehicle: RemainingWarranty,
  battery: RemainingWarranty,
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
