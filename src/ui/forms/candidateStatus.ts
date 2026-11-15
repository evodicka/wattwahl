import {
  listOffers,
  type Candidate,
  type OkOfferResult,
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
 */
export function candidateStatus(
  candidate: Candidate,
  index: number,
  results: Results | undefined,
): CandidateStatus {
  const own = `candidates[${index}]`;
  const found = listOffers(candidate).flatMap((offer) => {
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
    coupling: 'kandidaten:card.unsuitableCoupling',
  },
  table: {
    both: 'ergebnis:unsuitable.both',
    strict: 'ergebnis:unsuitable.strict',
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
  const key = KEYS[variant];
  switch (reason.kind) {
    case 'both':
      return t(key.both, {
        weekday: t(`weekdays.${reason.weekday}`),
        month: month(reason.month),
        a: formatKm(reason.reserveKm.a),
        b: formatKm(reason.reserveKm.b),
      });
    case 'strict':
      return t(key.strict, {
        way: reason.way.toUpperCase(),
        month: month(reason.month),
        km: formatKm(reason.reserveKm),
      });
    case 'coupling':
      return t(key.coupling, { soh: formatPercent(reason.soh * 100, 1) });
  }
}
