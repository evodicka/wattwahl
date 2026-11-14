import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import { Trace } from '../trace';
import { sohAt, sohCurve, sohKEnd, sohSlope } from './soh';

const params = { sohMinPct: 85, kmToSohMin: 200000 };
const used = (mileageKm: number, sohKnownPct: number | null) => ({
  mileageKm,
  sohKnownPct,
});
const pct = (soh: number) => soh * 100;

describe('TC6: SoH (F2)', () => {
  it('TC6: used car with 80,000 km and unknown SoH: 94 %, 91 % at 120,000 km, floor 85 % at 250,000 km', () => {
    const curve = sohCurve(params, used(80000, null));
    expectSpec(pct(sohAt(curve, 80000)), '94');
    expectSpec(pct(sohAt(curve, 120000)), '91');
    expectSpec(pct(sohAt(curve, 250000)), '85');
  });

  it('TC6: known SoH 92 % at 80,000 km gives 89 % at 120,000 km', () => {
    const curve = sohCurve(params, used(80000, 92));
    expectSpec(pct(sohAt(curve, 80000)), '92');
    expectSpec(pct(sohAt(curve, 120000)), '89');
  });

  it('TC6: the trace names F2.slope and F2.soh', () => {
    const trace = new Trace();
    sohAt(sohCurve(params, used(0, null), trace), 100000, trace);
    expect(trace.entries.map((e) => e.formula)).toEqual(['F2.slope', 'F2.soh']);
  });

  it('F2.slope: (1 - SoH_min) / k_SoH', () => {
    expect(sohSlope(85, 200000)).toBeCloseTo(0.15 / 200000, 15);
  });

  it('F2.kEnd: the end reading starts at the current mileage (E3)', () => {
    const trace = new Trace();
    expect(sohKEnd(80000, 15000, 48, trace)).toBe(140000);
    expect(trace.entries[0]?.formula).toBe('F2.kEnd');
  });
});

describe('F2: properties', () => {
  it('F2: SoH never falls below min(SoH_min, SoH_0) and never rises above SoH_0 after k_0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 50, max: 100, noNaN: true }),
        fc.integer({ min: 0, max: 300000 }),
        fc.integer({ min: 0, max: 600000 }),
        fc.boolean(),
        (known, mileage, driven, hasKnown) => {
          const curve = sohCurve(
            params,
            used(mileage, hasKnown ? known : null),
          );
          const soh = sohAt(curve, mileage + driven);
          expect(soh).toBeGreaterThanOrEqual(
            Math.min(curve.sohMin, curve.soh0) - 1e-12,
          );
          expect(soh).toBeLessThanOrEqual(curve.soh0 + 1e-12);
        },
      ),
    );
  });

  it('F2: a traced call returns the same value as an untraced call', () => {
    const curve = sohCurve(params, used(80000, 92));
    expect(sohAt(curve, 123456, new Trace())).toBe(sohAt(curve, 123456));
  });
});
