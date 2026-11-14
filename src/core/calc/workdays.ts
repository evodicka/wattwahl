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

/** F5.f of both workplaces, computed once and passed to `expectedDays` for every weekday. */
export function attendanceFactors(
  workplaces: { a: WorkdaysInput; b: WorkdaysInput },
  weeksPerYear: number,
  trace?: Trace,
): { a: number; b: number } {
  return {
    a: attendanceFactor(workplaces.a, weeksPerYear, trace),
    b: attendanceFactor(workplaces.b, weeksPerYear, trace),
  };
}

/**
 * F5.days: expected days per presence state for one weekday in one month.
 * The four values add up to `weeksPerYear / 12`. `attendance` comes from
 * `attendanceFactors`; a workplace that does not visit `weekday` ignores its factor.
 */
export function expectedDays(
  weekday: Weekday,
  workplaces: { a: WorkdaysInput; b: WorkdaysInput },
  weeksPerYear: number,
  attendance: { a: number; b: number },
  trace?: Trace,
): ExpectedDays {
  const c = weekdayOccurrences(weeksPerYear, trace);
  const inA = workplaces.a.weekdays.includes(weekday);
  const inB = workplaces.b.weekdays.includes(weekday);
  const fA = inA ? attendance.a : 0;
  const fB = inB ? attendance.b : 0;

  const days: ExpectedDays = {
    both: inA && inB ? c * fA * fB : 0,
    onlyA: inA ? c * fA * (inB ? 1 - fB : 1) : 0,
    onlyB: inB ? c * fB * (inA ? 1 - fA : 1) : 0,
    none: c * (inA ? 1 - fA : 1) * (inB ? 1 - fB : 1),
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
