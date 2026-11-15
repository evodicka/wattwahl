import { listOffers, type Scenario } from '../../domain';
import type { Results } from './resultRows';

/** One scenario's results in the price case "Mittel". */
export type ComparedScenario = {
  scenario: Scenario;
  /** `undefined` while the worker has not answered for it. */
  results: Results | undefined;
};

/** What a scenario says about one offer. `null`: it has no such offer or no computed result. */
export type ComparisonCell = {
  total: number;
  costs: {
    acquisition: number;
    electricity: number;
    petrol: number;
    maintenance: number;
    total: number;
  };
} | null;

export type ComparisonRow = {
  /** Candidate name plus offer kind: how offers of different scenarios are matched (spec "Szenariovergleich"). */
  key: string;
  candidateName: string;
  /** `null` for a purchase, the tier in km per year for a lease. */
  leaseTierKm: number | null;
  /** One cell per compared scenario, in the order of `scenarios`. */
  cells: ComparisonCell[];
  /** Highest minus lowest total over the scenarios that have this offer; `null` with fewer than two. */
  difference: number | null;
};

const normalise = (name: string) => name.trim().toLowerCase();

/**
 * Matches the offers of the scenarios by candidate name (case and edge spaces
 * ignored) plus offer kind: a purchase, or a lease with the same tier in km
 * per year. An offer that only some scenarios have is a row with empty cells.
 * Rows are in the order they first appear. Two candidates of one scenario
 * with the same name and kind: the first one counts.
 */
export function comparisonRows(scenarios: ComparedScenario[]): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>();
  scenarios.forEach(({ scenario, results }, column) => {
    for (const candidate of scenario.candidates) {
      for (const offer of listOffers(candidate)) {
        const tier =
          offer.kind === 'lease'
            ? (candidate.leaseTiers.find((t) => t.id === offer.leaseTierId)
                ?.tierKmPerYear ?? null)
            : null;
        const key = `${normalise(candidate.name)}|${tier === null ? 'purchase' : `lease:${tier}`}`;
        let row = rows.get(key);
        if (!row) {
          row = {
            key,
            candidateName: candidate.name.trim(),
            leaseTierKm: tier,
            cells: scenarios.map(() => null),
            difference: null,
          };
          rows.set(key, row);
        }
        if (row.cells[column]) continue;
        const result = results?.[offer.offerId]?.mid;
        if (result?.status === 'ok') {
          row.cells[column] = {
            total: result.costs.total,
            costs: result.costs,
          };
        }
      }
    }
  });
  return [...rows.values()].map((row) => {
    const totals = row.cells.flatMap((cell) => (cell ? [cell.total] : []));
    return {
      ...row,
      difference:
        totals.length < 2 ? null : Math.max(...totals) - Math.min(...totals),
    };
  });
}
