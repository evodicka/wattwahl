import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WEEKDAYS } from '../../domain';
import { exampleScenarioCompute } from '../../../tests/fixtures/exampleScenario';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import { Trace } from '../trace';
import { attendanceFactor, expectedDays } from './workdays';

const { workplaces, parameters } = exampleScenarioCompute();
const weeks = parameters.workWeeksPerYear;

describe('TC9: working days (F5)', () => {
  it('TC9: f_A = 0.8846 and f_B = 0.9038', () => {
    const trace = new Trace();
    expectSpec(attendanceFactor(workplaces.a, weeks, trace), '0,8846');
    expectSpec(attendanceFactor(workplaces.b, weeks, trace), '0,9038');
    expect(trace.entries.map((e) => e.formula)).toEqual(['F5.f', 'F5.f']);
  });

  it('TC9: Tuesday per month is 3.46 days with both, 0.37 only A, 0.45 only B, 0.05 neither', () => {
    const trace = new Trace();
    const days = expectedDays('tue', workplaces, weeks, trace);
    expectSpec(days.both, '3,46');
    expectSpec(days.onlyA, '0,37');
    expectSpec(days.onlyB, '0,45');
    expectSpec(days.none, '0,05');
    expect(new Set(trace.entries.map((e) => e.formula))).toEqual(
      new Set(['F5.c', 'F5.f', 'F5.days']),
    );
  });

  it('F5.days: a weekday only workplace A visits has no "only B" and no "both" days', () => {
    const days = expectedDays('mon', workplaces, weeks);
    expect(days.both).toBe(0);
    expect(days.onlyB).toBe(0);
    expect(days.onlyA).toBeCloseTo((weeks / 12) * (1 - 30 / 260), 12);
  });

  it('F5.days: a weekday neither workplace visits is a free day', () => {
    const days = expectedDays('sun', workplaces, weeks);
    expect(days).toEqual({ both: 0, onlyA: 0, onlyB: 0, none: weeks / 12 });
  });
});

describe('F5: properties', () => {
  // Free days never exceed the working days (ScenarioComputeSchema rejects that).
  const workplace = (weeksPerYear: number) =>
    fc.subarray([...WEEKDAYS], { minLength: 1 }).chain((days) =>
      fc.record({
        weekdays: fc.constant(days),
        freeDaysPerYear: fc.integer({
          min: 0,
          max: weeksPerYear * days.length,
        }),
      }),
    );

  it('F5: for every weekday the four states add up to weeks/12 and none is negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 40, max: 53 }).chain((weeksPerYear) =>
          fc.record({
            weeksPerYear: fc.constant(weeksPerYear),
            a: workplace(weeksPerYear),
            b: workplace(weeksPerYear),
          }),
        ),
        ({ weeksPerYear, a, b }) => {
          for (const weekday of WEEKDAYS) {
            const days = expectedDays(weekday, { a, b }, weeksPerYear);
            const sum = days.both + days.onlyA + days.onlyB + days.none;
            expect(sum).toBeCloseTo(weeksPerYear / 12, 10);
            for (const value of Object.values(days)) {
              expect(value).toBeGreaterThanOrEqual(-1e-12);
            }
          }
        },
      ),
    );
  });

  it('F5: a traced call returns the same values as an untraced call', () => {
    expect(expectedDays('tue', workplaces, weeks, new Trace())).toEqual(
      expectedDays('tue', workplaces, weeks),
    );
  });
});
