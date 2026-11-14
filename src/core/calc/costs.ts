import type { CandidateCompute, ScenarioCompute } from '../../domain';
import { detPow } from '../math/detPow';
import type { Trace } from '../trace';
import { fraction } from './units';

// Spec "Berechnungslogik" section 8: total fleet cost over the comparison period.

type LeaseTier = CandidateCompute['leaseTiers'][number];

/** Depreciation of a candidate: its own value, else the scenario default. */
export const effectiveDepreciationPct = (
  candidate: Pick<CandidateCompute, 'depreciationPctPerYear'>,
  parameters: Pick<ScenarioCompute['parameters'], 'depreciationPctPerYear'>,
): number =>
  candidate.depreciationPctPerYear ?? parameters.depreciationPctPerYear;

/** EV maintenance and tyres in EUR/km: its own value, else the scenario default. */
export const effectiveEvMaintenancePerKm = (
  candidate: Pick<CandidateCompute, 'maintenancePerKm'>,
  parameters: Pick<ScenarioCompute['parameters'], 'evMaintenancePerKm'>,
): number => candidate.maintenancePerKm ?? parameters.evMaintenancePerKm;

/** F8.purchase: purchase cost over D, P - P (1 - w)^(D/12), the value lost. */
export function purchaseCost(
  purchasePrice: number,
  depreciationPctPerYear: number,
  comparisonMonths: number,
  trace?: Trace,
): number {
  const residual =
    purchasePrice *
    detPow(1 - fraction(depreciationPctPerYear), comparisonMonths / 12);
  const cost = purchasePrice - residual;
  trace?.add({
    formula: 'F8.purchase',
    inputs: { purchasePrice, depreciationPctPerYear, comparisonMonths },
    value: cost,
  });
  return cost;
}

export type LeaseCost = {
  /** Kilometres per year above the tier, F8.extraKm. */
  extraKmPerYear: number;
  /** Kilometres per year below the tier, F8.underKm. */
  underKmPerYear: number;
  /** D · (rate + down payment / term). */
  rateAndDownPayment: number;
  /** D/12 · (extra - refund); negative when the refund is larger. */
  kmSettlement: number;
  total: number;
};

/**
 * F8.lease: D · (rate + down payment / L) + D/12 · (extra - refund). A term L
 * different from D continues or cuts the lease on the same terms (spec,
 * simplification).
 */
export function leaseCost(
  tier: Pick<
    LeaseTier,
    | 'tierKmPerYear'
    | 'monthlyRate'
    | 'termMonths'
    | 'downPayment'
    | 'extraKmPrice'
    | 'underKmRefund'
  >,
  evKmPerYear: number,
  comparisonMonths: number,
  trace?: Trace,
): LeaseCost {
  const extraKmPerYear = Math.max(0, evKmPerYear - tier.tierKmPerYear);
  const underKmPerYear = Math.max(0, tier.tierKmPerYear - evKmPerYear);
  trace?.add({
    formula: 'F8.extraKm',
    inputs: { evKmPerYear, tierKmPerYear: tier.tierKmPerYear },
    value: extraKmPerYear,
  });
  trace?.add({
    formula: 'F8.underKm',
    inputs: { evKmPerYear, tierKmPerYear: tier.tierKmPerYear },
    value: underKmPerYear,
  });
  const rateAndDownPayment =
    comparisonMonths * (tier.monthlyRate + tier.downPayment / tier.termMonths);
  const kmSettlement =
    (comparisonMonths / 12) *
    (extraKmPerYear * tier.extraKmPrice - underKmPerYear * tier.underKmRefund);
  const total = rateAndDownPayment + kmSettlement;
  trace?.add({
    formula: 'F8.lease',
    inputs: {
      comparisonMonths,
      monthlyRate: tier.monthlyRate,
      downPayment: tier.downPayment,
      termMonths: tier.termMonths,
      extraKmPerYear,
      extraKmPrice: tier.extraKmPrice,
      underKmPerYear,
      underKmRefund: tier.underKmRefund,
    },
    value: total,
  });
  return {
    extraKmPerYear,
    underKmPerYear,
    rateAndDownPayment,
    kmSettlement,
    total,
  };
}

/**
 * F8.energy: cost of one energy carrier, yearly quantity · price · factor
 * (F_s for home electricity in kWh from the grid, F_b for petrol in litres).
 */
export function energyCost(
  carrier: 'electricity' | 'petrol',
  yearlyQuantity: number,
  price: number,
  priceFactor: number,
  trace?: Trace,
): number {
  const cost = yearlyQuantity * price * priceFactor;
  trace?.add({
    formula: 'F8.energy',
    inputs: { carrier, yearlyQuantity, price, priceFactor },
    value: cost,
  });
  return cost;
}

/** F8.kIce: yearly km of the petrol car, total km - K_EV. */
export function iceKmPerYear(
  totalKmPerYear: number,
  evKmPerYear: number,
  trace?: Trace,
): number {
  const km = totalKmPerYear - evKmPerYear;
  trace?.add({
    formula: 'F8.kIce',
    inputs: { totalKmPerYear, evKmPerYear },
    value: km,
  });
  return km;
}

/** F8.maintenance: F_m · (m_EV K_EV + m_ICE K_ICE). Maintenance does not escalate. */
export function maintenanceCost(
  km: { ev: number; ice: number },
  perKm: { ev: number; ice: number },
  maintenanceFactor: number,
  trace?: Trace,
): number {
  const cost = maintenanceFactor * (perKm.ev * km.ev + perKm.ice * km.ice);
  trace?.add({
    formula: 'F8.maintenance',
    inputs: {
      maintenanceFactor,
      evPerKm: perKm.ev,
      evKm: km.ev,
      icePerKm: perKm.ice,
      iceKm: km.ice,
    },
    value: cost,
  });
  return cost;
}

/**
 * F8.iceOdometer: planned mileage of the petrol car at the end, k_ICE,0 + K_ICE · D/12.
 * Shown only; it never enters a cost.
 */
export function iceOdometerEnd(
  currentMileageKm: number,
  iceKmPerYearValue: number,
  comparisonMonths: number,
  trace?: Trace,
): number {
  const end = currentMileageKm + (iceKmPerYearValue * comparisonMonths) / 12;
  trace?.add({
    formula: 'F8.iceOdometer',
    inputs: {
      currentMileageKm,
      iceKmPerYear: iceKmPerYearValue,
      comparisonMonths,
    },
    value: end,
  });
  return end;
}
