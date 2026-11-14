import type { ScenarioCompute, Weekday } from '../../domain';
import type { Trace } from '../trace';
import { finiteRatio } from './units';

// Spec "Berechnungslogik" section 5: working days. "52" in the spec is the
// parameter "Arbeitswochen pro Jahr" (architecture 8.4).

type Workplace = ScenarioCompute['workplaces']['a'];
type WorkdaysInput = Pick<Workplace, 'weekdays' | 'freeDaysPerYear'>;

export type ExpectedDays = {
  both: number;
  onlyA: number;
  onlyB: number;
  /** Neither workplace is staffed. */
  none: number;
};

/** F5.f: share of the visited weekdays that are worked, (weeks · days - free) / (weeks · days). */
export function attendanceFactor(
  workplace: WorkdaysInput,
  weeksPerYear: number,
  trace?: Trace,
): number {
  const workdays = weeksPerYear * workplace.weekdays.length;
  const f = finiteRatio(workdays - workplace.freeDaysPerYear, workdays);
  trace?.add({
    formula: 'F5.f',
    inputs: {
      weeksPerYear,
      weekdays: workplace.weekdays.length,
      freeDaysPerYear: workplace.freeDaysPerYear,
    },
    value: f,
  });
  return f;
}

/** F5.c: occurrences of one weekday in one month on average, weeks / 12. */
export function weekdayOccurrences(
  weeksPerYear: number,
  trace?: Trace,
): number {
  const c = weeksPerYear / 12;
  trace?.add({ formula: 'F5.c', inputs: { weeksPerYear }, value: c });
  return c;
}

/**
 * F5.days: expected days per presence state for one weekday in one month.
 * The four values add up to `weeksPerYear / 12`.
 */
export function expectedDays(
  weekday: Weekday,
  workplaces: { a: WorkdaysInput; b: WorkdaysInput },
  weeksPerYear: number,
  trace?: Trace,
): ExpectedDays {
  const c = weekdayOccurrences(weeksPerYear, trace);
  const inA = workplaces.a.weekdays.includes(weekday);
  const inB = workplaces.b.weekdays.includes(weekday);
  const fA = inA ? attendanceFactor(workplaces.a, weeksPerYear, trace) : 0;
  const fB = inB ? attendanceFactor(workplaces.b, weeksPerYear, trace) : 0;

  const both = inA && inB ? c * fA * fB : 0;
  const onlyA = inA ? c * fA * (inB ? 1 - fB : 1) : 0;
  const onlyB = inB ? c * fB * (inA ? 1 - fA : 1) : 0;
  const days: ExpectedDays = {
    both,
    onlyA,
    onlyB,
    none: c - both - onlyA - onlyB,
  };
  if (trace) {
    for (const state of ['both', 'onlyA', 'onlyB', 'none'] as const) {
      trace.add({
        formula: 'F5.days',
        inputs: { weekday, state, c, fA, fB },
        value: days[state],
      });
    }
  }
  return days;
}
