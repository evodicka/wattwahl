import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { exampleCandidateCompute } from '../../../tests/fixtures/exampleScenario';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import { Trace } from '../trace';
import { mixWeight, mixWeightCold, roadRanges } from './range';

const ranges = exampleCandidateCompute().rangeKm;
const formulas = (trace: Trace) => trace.entries.map((e) => e.formula);

describe('TC3: temperature mixing (F1)', () => {
  it('TC3: 6.5 °C without cold reserve gives w = 0.5 and the mixed ranges', () => {
    const trace = new Trace();
    const w = mixWeight(6.5, -10, 23, trace);
    const r = roadRanges(ranges, w, 0, trace);
    expect(w).toBe(0.5);
    expectSpec(r.city, '360');
    expectSpec(r.highway, '260');
    expectSpec(r.rural, '310');
    expect(formulas(trace)).toEqual(['F1.w', 'F1.R', 'F1.R', 'F1.R']);
  });

  it('F1.wStar: the cold reserve shifts the temperature and clamps at 0 and 1', () => {
    expect(mixWeightCold(6.5, 5, -10, 23)).toBeCloseTo(11.5 / 33, 12);
    expect(mixWeightCold(-10, 0, -10, 23)).toBe(0);
    expect(mixWeightCold(40, 5, -10, 23)).toBe(1);
    expect(mixWeight(-30, -10, 23)).toBe(0);
  });

  it('F1.RStar: the check range uses its own formula ID and the highway discount', () => {
    const trace = new Trace();
    const r = roadRanges(ranges, 0, 12, trace, 'F1.RStar');
    expect(r.highway).toBeCloseTo(220 * 0.88, 10);
    expect(r.city).toBe(300);
    expect(new Set(formulas(trace))).toEqual(new Set(['F1.RStar']));
  });
});

describe('F1: properties', () => {
  const pair = fc.record({
    mild: fc.double({ min: 50, max: 800, noNaN: true }),
    cold: fc.double({ min: 50, max: 800, noNaN: true }),
  });
  const rangesArb = fc.record({ city: pair, highway: pair, combined: pair });

  it('F1: every range lies between its cold and mild value (cold > mild only warns)', () => {
    fc.assert(
      fc.property(
        rangesArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (r, w) => {
          const result = roadRanges(r, w, 0);
          const checks: [number, typeof r.city][] = [
            [result.city, r.city],
            [result.rural, r.combined],
            [result.highway, r.highway],
          ];
          for (const [value, p] of checks) {
            const lo = Math.min(p.cold, p.mild);
            const hi = Math.max(p.cold, p.mild);
            expect(value).toBeGreaterThanOrEqual(lo - 1e-9);
            expect(value).toBeLessThanOrEqual(hi + 1e-9);
          }
        },
      ),
    );
  });

  it('F1: a traced call returns the same values as an untraced call', () => {
    fc.assert(
      fc.property(
        rangesArb,
        fc.double({ min: -30, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 30, noNaN: true }),
        (r, temp, discount) => {
          const trace = new Trace();
          const w = mixWeightCold(temp, 5, -10, 23);
          expect(mixWeightCold(temp, 5, -10, 23, trace)).toBe(w);
          expect(roadRanges(r, w, discount, trace, 'F1.RStar')).toEqual(
            roadRanges(r, w, discount),
          );
        },
      ),
    );
  });
});
