import {
  listOffers,
  type OfferResult,
  type OkOfferResult,
  type PriceCase,
  type Scenario,
} from '../../domain';
import { reserveLightOf, type Results } from './candidateStatus';

/** One offer in the result table (spec "Ergebnistabelle"). */
export type ResultRow = {
  offerId: string;
  candidateId: string;
  candidateName: string;
  /** `null` for a purchase, the tier in km per year for a lease. */
  leaseTierKm: number | null;
  /** The result in the shown price case. */
  result: OfferResult;
  /** Total cost in the shown price case; `null` unless the offer is `ok`. */
  total: number | null;
  /** Total cost from "E-Auto günstig" to "E-Auto ungünstig". */
  range: { min: number; max: number } | null;
  suitability: 'suitable' | 'tight' | 'unsuitable' | 'incomplete';
  /** Schema paths of this offer's own missing fields. */
  missing: string[];
  /** Fields outside the candidate (Fahrprofil, Parameter) are missing too. */
  profileMissing: boolean;
};

const totalOf = (result: OfferResult | undefined): number | null =>
  result?.status === 'ok' ? result.costs.total : null;

/**
 * The rows of the result table in the given price case: suitable offers by
 * ascending total cost first, then the unsuitable and incomplete ones in the
 * order of the list (spec "Ergebnistabelle"). An offer without a result in
 * this price case is left out.
 */
export function resultRows(
  scenario: Scenario,
  results: Results,
  priceCase: PriceCase,
): ResultRow[] {
  const rows: ResultRow[] = [];
  scenario.candidates.forEach((candidate, index) => {
    const own = `candidates[${index}]`;
    for (const offer of listOffers(candidate)) {
      const byCase = results[offer.offerId];
      const result = byCase?.[priceCase];
      if (!result) continue;
      const favorable = totalOf(byCase?.evFavorable);
      const unfavorable = totalOf(byCase?.evUnfavorable);
      const issues = result.status === 'incomplete' ? result.issues : [];
      const paths = issues.map((issue) => issue.path);
      rows.push({
        offerId: offer.offerId,
        candidateId: candidate.id,
        candidateName: candidate.name,
        leaseTierKm:
          offer.kind === 'lease'
            ? (candidate.leaseTiers.find((t) => t.id === offer.leaseTierId)
                ?.tierKmPerYear ?? null)
            : null,
        result,
        total: totalOf(result),
        range:
          favorable !== null && unfavorable !== null
            ? {
                min: Math.min(favorable, unfavorable),
                max: Math.max(favorable, unfavorable),
              }
            : null,
        suitability:
          result.status === 'ok'
            ? reserveLightOf(result) === 'yellow'
              ? 'tight'
              : 'suitable'
            : result.status,
        missing: [...new Set(paths.filter((p) => p.startsWith(own)))],
        profileMissing: paths.some((p) => !p.startsWith(own)),
      });
    }
  });
  const ok = rows
    .filter((row) => row.total !== null)
    .sort((a, b) => (a.total ?? 0) - (b.total ?? 0));
  return [...ok, ...rows.filter((row) => row.total === null)];
}

/** What the warranty column says about an offer (spec "Ergebnistabelle"). */
export type WarrantyStatus =
  | { kind: 'none' }
  | { kind: 'noWarranty' }
  | { kind: 'leaseLimit' }
  | { kind: 'exceeded' }
  | { kind: 'budgetActive'; extraCost: number }
  | { kind: 'inBudget' };

export function warrantyStatus(result: OkOfferResult): WarrantyStatus {
  const { warranty } = result;
  if (warranty.noWarranty) return { kind: 'noWarranty' };
  // A lease is not held to the budget: its tier is the limit (spec "Garantie-Budget").
  if (result.kind === 'lease') return { kind: 'leaseLimit' };
  if (warranty.budgetExceeded) return { kind: 'exceeded' };
  if (warranty.budgetKmPerYear === null) return { kind: 'none' };
  return result.costs.budgetExtraCost > 0
    ? { kind: 'budgetActive', extraCost: result.costs.budgetExtraCost }
    : { kind: 'inBudget' };
}
