import {
  listScenarioOffers,
  type Candidate,
  type OkOfferResult,
  type Scenario,
  type UnsuitableReason,
} from '../../domain';
import { MONTH_KEYS, formatKm, formatPercent, i18n } from '../../i18n';
import { reserveLightOf, type Results } from './resultRows';

/** What a candidate card says (boards D2, M2, Z02, Z03). */
export type CandidateStatus =
  | { kind: 'pending' }
  | {
      kind: 'incomplete';
      /** Schema paths of the fields of this candidate that block it. */
      missing: string[];
      /** Fields outside the candidate (Fahrprofil, Parameter) block it too. */
      profileMissing: boolean;
    }
  | { kind: 'unsuitable'; reason: UnsuitableReason }
  | {
      kind: 'suitable' | 'tight';
      /** The cheapest suitable offer in the price case "Mittel". */
      best: OkOfferResult;
    };

/**
 * One status per candidate from its offers in the price case "Mittel": the
 * cheapest suitable offer decides; a yellow smallest reserve is "knapp".
 * Without a suitable offer an incomplete one wins over an unsuitable one,
 * because the missing fields must be filled in before anything else counts.
 * Hidden lease offers do not count, even if the results still hold them.
 */
export function candidateStatus(
  candidate: Candidate,
  index: number,
  results: Results | undefined,
  scenario: Pick<Scenario, 'includeLeaseOffers'> = { includeLeaseOffers: true },
): CandidateStatus {
  const own = `candidates[${index}]`;
  const found = listScenarioOffers(scenario, candidate).flatMap((offer) => {
    const result = results?.[offer.offerId]?.mid;
    return result ? [result] : [];
  });
  if (found.length === 0) return { kind: 'pending' };

  const ok = found
    .filter((r): r is OkOfferResult => r.status === 'ok')
    .sort((a, b) => a.costs.total - b.costs.total);
  const best = ok[0];
  if (best) {
    return {
      kind: reserveLightOf(best) === 'yellow' ? 'tight' : 'suitable',
      best,
    };
  }

  const issues = found.flatMap((r) =>
    r.status === 'incomplete' ? r.issues : [],
  );
  if (issues.length > 0) {
    const paths = issues.map((issue) => issue.path);
    return {
      kind: 'incomplete',
      missing: [...new Set(paths.filter((p) => p.startsWith(own)))],
      profileMissing: paths.some((p) => !p.startsWith(own)),
    };
  }
  // The purchase offer's reason first, so the card does not describe a lease
  // when the purchase has one too.
  const unsuitable =
    found.find((r) => r.status === 'unsuitable' && r.kind === 'purchase') ??
    found.find((r) => r.status === 'unsuitable');
  return unsuitable && unsuitable.status === 'unsuitable'
    ? { kind: 'unsuitable', reason: unsuitable.reason }
    : { kind: 'pending' };
}

const t = (key: string, options: Record<string, unknown> = {}): string =>
  i18n.t(key as never, options) as unknown as string;

const month = (index: number): string =>
  t(`months.${MONTH_KEYS[index] ?? 'jan'}`);

const KEYS = {
  card: {
    both: 'kandidaten:card.unsuitableBoth',
    strict: 'kandidaten:card.unsuitableStrict',
    bothReserve: 'kandidaten:card.unsuitableBothReserve',
    strictReserve: 'kandidaten:card.unsuitableStrictReserve',
    coupling: 'kandidaten:card.unsuitableCoupling',
  },
  table: {
    both: 'ergebnis:unsuitable.both',
    strict: 'ergebnis:unsuitable.strict',
    bothReserve: 'ergebnis:unsuitable.bothReserve',
    strictReserve: 'ergebnis:unsuitable.strictReserve',
    coupling: 'ergebnis:unsuitable.coupling',
  },
} as const;

/**
 * The reason of an unsuitable offer as a sentence (Z03): `card` for the
 * candidate list, `table` for the result table (texts of the Ergebnis area).
 */
export function unsuitableText(
  reason: UnsuitableReason,
  variant: 'card' | 'table' = 'card',
): string {
  const base = baseText(reason, variant);
  // Mode "mit Wechsel": the time the last way tips (spec "Ungeeignet").
  if (
    (reason.kind === 'both' || reason.kind === 'strict') &&
    reason.afterMonths !== undefined
  ) {
    return `${base} ${t(
      reason.afterMonths === 0
        ? 'ergebnis:unsuitable.afterMonthsStart'
        : reason.kind === 'both'
          ? 'ergebnis:unsuitable.afterMonthsBoth'
          : 'ergebnis:unsuitable.afterMonthsStrict',
      {
        months: reason.afterMonths,
        way: 'way' in reason ? reason.way.toUpperCase() : '',
      },
    )}`;
  }
  return base;
}

function baseText(reason: UnsuitableReason, variant: 'card' | 'table'): string {
  const key = KEYS[variant];
  switch (reason.kind) {
    case 'both': {
      const values = {
        weekday: t(`weekdays.${reason.weekday}`),
        month: month(reason.month),
        a: formatKm(reason.reserveKm.a),
        b: formatKm(reason.reserveKm.b),
      };
      if (reason.minReserveKm <= 0) return t(key.both, values);
      return t(key.bothReserve, {
        ...values,
        minReserve: formatKm(reason.minReserveKm),
        // The better way is the one that comes closest.
        missing: formatKm(
          reason.minReserveKm -
            Math.max(reason.reserveKm.a, reason.reserveKm.b),
        ),
      });
    }
    case 'strict': {
      const values = {
        way: reason.way.toUpperCase(),
        month: month(reason.month),
        km: formatKm(reason.reserveKm),
      };
      if (reason.minReserveKm <= 0) return t(key.strict, values);
      return t(key.strictReserve, {
        ...values,
        minReserve: formatKm(reason.minReserveKm),
        missing: formatKm(reason.minReserveKm - reason.reserveKm),
      });
    }
    case 'coupling':
      return t(key.coupling, { soh: formatPercent(reason.soh * 100, 1) });
  }
}
