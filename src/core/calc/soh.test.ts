import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import { Trace } from '../trace';
import { monthsUntilSoh, sohAt, sohCurve, sohKEnd, sohSlope } from './soh';

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

describe('C2b: months until the SoH falls below a threshold', () => {
  // Corsa 2023 of test case 21: 95 % at 19.000 km, 85 % after 200.000 km.
  const corsa = sohCurve(
    { sohMinPct: 85, kmToSohMin: 200000 },
    { mileageKm: 19000, sohKnownPct: 95 },
  );
  const kEv = 19055.307692307702;

  it('TC21: a threshold of 0,914 is crossed after 30,2 months (the spec rounds the threshold, test case 21 has the exact one)', () => {
    expectSpec(monthsUntilSoh(corsa, 19000, kEv, 0.914), '30,2');
    // 0,95 - 0,9137 = 0,0363 of SoH at 7,5e-7 per km, at 19.055 km a year.
    const threshold = 0.9137;
    const expected = (12 * ((0.95 - threshold) / 7.5e-7)) / kEv;
    expect(monthsUntilSoh(corsa, 19000, kEv, threshold)).toBeCloseTo(
      expected,
      6,
    );
  });

  it('TC21: a threshold under the lowest SoH is never crossed', () => {
    expect(monthsUntilSoh(corsa, 19000, kEv, 0.829)).toBe(Infinity);
    // exactly the lowest SoH: the car stays at it, it does not fall below
    expect(monthsUntilSoh(corsa, 19000, kEv, 0.85)).toBe(Infinity);
  });

  it('is 0 if the SoH is below the threshold at the start, and at exactly the start SoH', () => {
    expect(monthsUntilSoh(corsa, 19000, kEv, 0.9501)).toBe(0);
    expect(monthsUntilSoh(corsa, 19000, kEv, 0.95)).toBe(0);
  });

  it('never crosses if the EV does not drive', () => {
    expect(monthsUntilSoh(corsa, 19000, 0, 0.9)).toBe(Infinity);
  });

  it('a car without a known SoH ages from 0 km, not from its odometer', () => {
    const used = sohCurve(
      { sohMinPct: 85, kmToSohMin: 200000 },
      { mileageKm: 50000, sohKnownPct: null },
    );
    // SoH(50.000) = 1 - 0,15 · 0,25 = 0,9625; threshold 0,9: 0,1 / 7,5e-7 = 133.333 km in all.
    const months = monthsUntilSoh(used, 50000, 10000, 0.9);
    expect(months).toBeCloseTo((12 * (133333.333333 - 50000)) / 10000, 4);
  });

  it('F2: the SoH at the returned month equals the threshold, shortly before it is above', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.86, max: 0.949, noNaN: true }),
        fc.double({ min: 1000, max: 40000, noNaN: true }),
        (threshold, perYear) => {
          const months = monthsUntilSoh(corsa, 19000, perYear, threshold);
          expect(Number.isFinite(months)).toBe(true);
          const at = (m: number) => sohAt(corsa, sohKEnd(19000, perYear, m));
          expect(at(months)).toBeCloseTo(threshold, 9);
          if (months > 0) {
            expect(at(months * 0.999)).toBeGreaterThanOrEqual(threshold);
          }
          expect(at(months + 0.5 + months * 0.001)).toBeLessThan(threshold);
        },
      ),
    );
  });
});
