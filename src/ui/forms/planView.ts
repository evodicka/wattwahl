import { WEEKDAYS, type OkOfferResult, type Weekday } from '../../domain';

type PlanCell = OkOfferResult['plan'][number];

/** One presence state of a day type and what the plan does on it. */
export type PlanLine = {
  state: 'both' | 'onlyA' | 'onlyB';
  /** Who is there: one workplace, or both. */
  present: ('a' | 'b')[];
  /** The EV drives, or the petrol car drives and the EV rests. */
  vehicle: 'ev' | 'ice';
  /** The way the named vehicle drives. */
  target: 'a' | 'b';
};

export type PlanMonth = {
  /** 0 is January. */
  month: number;
  lines: PlanLine[];
  /** The plan of this month differs from the plan most months have ("Winterwechsel"). */
  change: boolean;
};

export type PlanDay = { weekday: Weekday; months: PlanMonth[] };

const STATE_ORDER = ['both', 'onlyA', 'onlyB'] as const;

const lineOf = (cell: PlanCell): PlanLine => {
  const present: ('a' | 'b')[] =
    cell.state === 'both' ? ['a', 'b'] : cell.state === 'onlyA' ? ['a'] : ['b'];
  // With both staffed the petrol car must drive the other way, so the EV is
  // never resting there; "rest" can only stand for a single way.
  const target =
    cell.choice === 'evB'
      ? 'b'
      : cell.choice === 'evA'
        ? 'a'
        : (present[0] ?? 'a');
  return {
    state: cell.state,
    present,
    vehicle: cell.choice === 'rest' ? 'ice' : 'ev',
    target,
  };
};

const keyOf = (lines: PlanLine[]): string =>
  lines.map((l) => `${l.state}:${l.vehicle}:${l.target}`).join('|');

/**
 * The plan as a grid: one row per weekday that has any plan, 12 months per
 * row, in each month the presence states that occur. A month is marked as a
 * change when its plan differs from the plan of `referenceMonth`, the month
 * the plan is made for in the usual case. The caller passes the warmest month,
 * so the marks show the winter changes (spec "Zuordnungsplan"). Without it,
 * the plan most months have is the usual one.
 */
export function planView(
  plan: OkOfferResult['plan'],
  referenceMonth?: number,
): PlanDay[] {
  const days: PlanDay[] = [];
  for (const weekday of WEEKDAYS) {
    const cells = plan.filter((c) => c.weekday === weekday);
    if (cells.length === 0) continue;
    const months: PlanMonth[] = Array.from({ length: 12 }, (_, month) => ({
      month,
      lines: STATE_ORDER.flatMap((state) =>
        cells.filter((c) => c.month === month && c.state === state).map(lineOf),
      ),
      change: false,
    }));
    let usual: string;
    const reference =
      referenceMonth === undefined ? undefined : months[referenceMonth];
    if (reference) {
      usual = keyOf(reference.lines);
    } else {
      // The most frequent plan; on a tie the earlier month's plan counts as usual.
      const counts = new Map<string, number>();
      for (const m of months) {
        counts.set(keyOf(m.lines), (counts.get(keyOf(m.lines)) ?? 0) + 1);
      }
      usual = keyOf(months[0]?.lines ?? []);
      for (const m of months) {
        const key = keyOf(m.lines);
        if ((counts.get(key) ?? 0) > (counts.get(usual) ?? 0)) usual = key;
      }
    }
    for (const m of months) m.change = keyOf(m.lines) !== usual;
    days.push({ weekday, months });
  }
  return days;
}

/** The index of the warmest month; the first one if several are equally warm. */
export function warmestMonth(monthlyTempC: readonly number[]): number {
  let best = 0;
  monthlyTempC.forEach((temp, month) => {
    if (temp > (monthlyTempC[best] ?? -Infinity)) best = month;
  });
  return best;
}
