import type { Candidate, OkOfferResult } from '../../domain';

export type WarrantyPart = 'vehicle' | 'battery';

/**
 * What the warranty section says about one offer (spec "Garantie-Budget",
 * states Z13 and Z17). The numbers come from the result; this only decides
 * which sentence applies and where the budget comes from.
 */
export type WarrantyView =
  | { kind: 'noWarranty' }
  | {
      kind: 'running';
      /** Annual budget in km and the warranty it comes from; `null` for a lease or with the budget off. */
      budget: {
        kmPerYear: number;
        source: WarrantyPart;
        years: number;
        km: number;
      } | null;
      plannedKm: number;
      exceeded: boolean;
      /** The nearest km limit in years, over the running warranties. */
      yearsToLimit: number | null;
      extraCost: number;
      /** A part whose warranty has run out. */
      expired: WarrantyPart[];
    };

const PARTS = ['vehicle', 'battery'] as const;

export function warrantyView(result: OkOfferResult): WarrantyView {
  const { warranty } = result;
  if (warranty.noWarranty) return { kind: 'noWarranty' };

  const running = PARTS.filter(
    (part) =>
      warranty.remaining[part].years > 0 && warranty.remaining[part].km > 0,
  );
  const expired = PARTS.filter((part) => !running.includes(part));
  // The budget is the smallest km per year of the running warranties.
  const sources = running.map((part) => ({
    part,
    years: warranty.remaining[part].years,
    km: warranty.remaining[part].km,
    perYear: warranty.remaining[part].km / warranty.remaining[part].years,
  }));
  const tightest = sources.sort((a, b) => a.perYear - b.perYear)[0];
  const limits = PARTS.flatMap((part) => {
    const years = warranty.yearsToKmLimit[part];
    return years === null ? [] : [years];
  });
  return {
    kind: 'running',
    budget:
      // The budget is not active for a lease: its tier is the limit.
      result.kind === 'purchase' &&
      warranty.budgetKmPerYear !== null &&
      tightest
        ? {
            kmPerYear: warranty.budgetKmPerYear,
            source: tightest.part,
            years: tightest.years,
            km: tightest.km,
          }
        : null,
    plannedKm: result.evKmPerYear,
    exceeded: result.kind === 'purchase' && warranty.budgetExceeded,
    yearsToLimit: limits.length > 0 ? Math.min(...limits) : null,
    extraCost: result.costs.budgetExtraCost,
    expired,
  };
}

/** The normal warranty of one part as the candidate states it. */
export const normalWarranty = (
  candidate: Candidate,
  part: WarrantyPart,
): { years: number | null; km: number | null } =>
  part === 'vehicle' ? candidate.vehicleWarranty : candidate.batteryWarranty;
