import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  exampleCandidateCompute,
  exampleScenario,
} from '../../../tests/fixtures/exampleScenario';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import { Trace } from '../trace';
import { checkRanges, mixWeightCold } from './range';
import {
  checkWay,
  isSuitable,
  sohThreshold,
  trafficLight,
  usableShare,
} from './suitability';
import type { PerRoad } from './units';

const params = exampleScenario().parameters;
const wayA: PerRoad = { city: 10, rural: 15, highway: 35 };

/** Test case 1 and 2: January at -10 °C, SoH 1, check range of the common data. */
function january(chargesFreeAtWork: boolean, trace?: Trace, minReserveKm = 0) {
  const w = mixWeightCold(-10, params.coldReserveK, -10, 23, trace);
  const checkRangeKm = checkRanges(
    exampleCandidateCompute().rangeKm,
    w,
    params.highwayDiscountPct,
    trace,
  );
  const u = usableShare(params, trace);
  return checkWay(
    {
      distanceKm: wayA,
      checkRangeKm,
      soh: 1,
      u,
      chargesFreeAtWork,
      greenFromPct: params.trafficLightGreenFromPct,
      minReserveKm,
    },
    trace,
  );
}

describe('TC1: suitability in winter without charging at work (F3)', () => {
  it('TC1: φ = 0.2501, n·φ = 0.5002 ≤ u = 0.63, suitable, reserve 31.1 km (25.9 %)', () => {
    const trace = new Trace();
    const check = january(false, trace);
    expect(usableShare(params)).toBeCloseTo(0.63, 12);
    expectSpec(check.phi, '0,2501');
    expectSpec(check.n * check.phi, '0,5002');
    expect(check.suitable).toBe(true);
    expectSpec(check.reserveKm, '31,1');
    expectSpec(check.reservePct, '25,9');
    expect(check.light).toBe('green');
    expect(trace.entries.map((e) => e.formula)).toEqual([
      'F1.wStar',
      'F1.RStar',
      'F1.RStar',
      'F1.RStar',
      'F3.u',
      'F3.n',
      'F3.phi',
      'F3.reservePct',
      'F3.suitable',
      'F3.reserveKm',
      'F3.trafficLight',
    ]);
    const entry = (formula: string) =>
      trace.entries.find((e) => e.formula === formula);
    expect(entry('F3.n')?.value).toBe(2);
    expect(entry('F3.phi')?.value).toBe(check.phi);
    expect(entry('F3.suitable')?.value).toBe(true);
    expect(entry('F3.trafficLight')?.value).toBe('green');
  });
});

describe('TC2: suitability with charging at work (F3)', () => {
  it('TC2: with n = 1 the reserve is 91.1 km (151.9 %)', () => {
    const check = january(true);
    expect(check.n).toBe(1);
    expectSpec(check.reserveKm, '91,1');
    expectSpec(check.reservePct, '151,9');
  });
});

describe('F3: traffic light and threshold', () => {
  it('F3.trafficLight: green from the threshold, yellow from 0 %, red below', () => {
    expect(trafficLight(15, 15)).toBe('green');
    expect(trafficLight(14.9, 15)).toBe('yellow');
    expect(trafficLight(0, 15)).toBe('yellow');
    expect(trafficLight(-0.1, 15)).toBe('red');
  });

  it('OPT.threshold: a way is suitable exactly from the threshold SoH', () => {
    const w = mixWeightCold(-10, 0, -10, 23);
    const checkRangeKm = checkRanges(exampleCandidateCompute().rangeKm, w, 0);
    const u = usableShare(params);
    const threshold = sohThreshold(wayA, checkRangeKm, 2, u, 0);
    const at = (soh: number) =>
      checkWay({
        distanceKm: wayA,
        checkRangeKm,
        soh,
        u,
        chargesFreeAtWork: false,
        greenFromPct: 15,
        minReserveKm: 0,
      });
    expect(at(threshold * 1.0001).suitable).toBe(true);
    expect(at(threshold * 0.9999).suitable).toBe(false);
  });

  it('OPT.threshold: above 1 the way is never suitable, and it stays finite for u = 0', () => {
    const w = mixWeightCold(-10, 0, -10, 23);
    const checkRangeKm = checkRanges(exampleCandidateCompute().rangeKm, w, 0);
    const longWay: PerRoad = { city: 100, rural: 100, highway: 200 };
    const threshold = sohThreshold(longWay, checkRangeKm, 2, 0.63, 0);
    expect(threshold).toBeGreaterThan(1);
    expect(
      checkWay({
        distanceKm: longWay,
        checkRangeKm,
        soh: 1,
        u: 0.63,
        chargesFreeAtWork: false,
        greenFromPct: 15,
        minReserveKm: 0,
      }).suitable,
    ).toBe(false);
    expect(Number.isFinite(sohThreshold(wayA, checkRangeKm, 2, 0, 0))).toBe(
      true,
    );
  });
});

describe('F3: properties', () => {
  const road = (max: number) =>
    fc.record({
      city: fc.double({ min: 0, max, noNaN: true }),
      rural: fc.double({ min: 0, max, noNaN: true }),
      highway: fc.double({ min: 0.1, max, noNaN: true }),
    });
  const input = fc.record({
    distanceKm: road(150),
    checkRangeKm: fc.record({
      city: fc.double({ min: 50, max: 700, noNaN: true }),
      rural: fc.double({ min: 50, max: 700, noNaN: true }),
      highway: fc.double({ min: 50, max: 700, noNaN: true }),
    }),
    soh: fc.double({ min: 0.5, max: 1, noNaN: true }),
    u: fc.double({ min: 0.1, max: 0.7, noNaN: true }),
    chargesFreeAtWork: fc.boolean(),
    greenFromPct: fc.constant(15),
    minReserveKm: fc.constant(0),
  });

  it('F3: a suitable way has a reserve of at least 0 km and 0 %', () => {
    fc.assert(
      fc.property(input, (i) => {
        const check = checkWay(i);
        if (check.suitable) {
          expect(check.reserveKm).toBeGreaterThanOrEqual(-1e-9);
          expect(check.reservePct).toBeGreaterThanOrEqual(-1e-9);
        } else {
          expect(check.reservePct).toBeLessThan(1e-9);
        }
        // the light never contradicts the suitability flag, even at the boundary
        expect(check.light === 'red').toBe(!check.suitable);
      }),
    );
  });

  it('F3: a traced call returns the same values as an untraced call', () => {
    fc.assert(
      fc.property(input, (i) => {
        expect(checkWay(i, new Trace())).toEqual(checkWay(i));
      }),
    );
  });
});

describe('TC20: Kilometerreserve (F3, OPT.threshold)', () => {
  // Test case 1: January, no charging at work, reserve 31,1 km, n = 2.
  // Test case 2: the same with charging at work, reserve 91,1 km, n = 1.
  it.each([
    { name: 'TC1', free: false, reserve: '31,1', below: 30, above: 32 },
    { name: 'TC2', free: true, reserve: '91,1', below: 90, above: 92 },
  ])(
    '$name: R below the reserve is suitable, R above is not, the shown reserve stays',
    ({ free, reserve, below, above }) => {
      const without = january(free);
      expectSpec(without.reserveKm, reserve);

      const fits = january(free, undefined, below);
      expect(fits.suitable).toBe(true);
      expect(fits.light).not.toBe('red');
      expect(fits.belowMinReserve).toBe(false);
      expectSpec(fits.reserveKm, reserve);

      const short = january(free, undefined, above);
      expect(short.suitable).toBe(false);
      expect(short.light).toBe('red');
      expect(short.belowMinReserve).toBe(true);
      // the reserve itself is untouched, only the verdict changes
      expectSpec(short.reserveKm, reserve);
      expect(short.reservePct).toBe(without.reservePct);
    },
  );

  it('TC20: R = 0 gives exactly the values of test cases 1 and 2', () => {
    for (const free of [false, true]) {
      expect(january(free, undefined, 0)).toEqual({
        ...january(free),
        belowMinReserve: false,
      });
    }
    expect(january(false).belowMinReserve).toBe(false);
  });

  it('TC20: a way of 0 km needs no reserve, with R = 50 and without', () => {
    expect(isSuitable(2, 0, 0.63, 0, 50)).toBe(true);
    expect(isSuitable(2, 0, 0.63, 0, 0)).toBe(true);
    const check = checkWay({
      distanceKm: { city: 0, rural: 0, highway: 0 },
      checkRangeKm: { city: 100, rural: 100, highway: 100 },
      soh: 1,
      u: 0.63,
      chargesFreeAtWork: false,
      greenFromPct: 15,
      minReserveKm: 50,
    });
    expect(check.suitable).toBe(true);
    expect(check.light).toBe('green');
    expect(check.belowMinReserve).toBe(false);
  });

  it('TC20: the reserve is not counted as below the Kilometerreserve when the way does not fit at all', () => {
    // A way too long for the battery has a negative reserve: not "below R".
    const check = checkWay({
      distanceKm: { city: 100, rural: 100, highway: 200 },
      checkRangeKm: { city: 300, rural: 300, highway: 300 },
      soh: 1,
      u: 0.63,
      chargesFreeAtWork: false,
      greenFromPct: 15,
      minReserveKm: 10,
    });
    expect(check.reserveKm).toBeLessThan(0);
    expect(check.suitable).toBe(false);
    expect(check.belowMinReserve).toBe(false);
  });

  it('OPT.threshold with R: φ₁ · (n + R / d_w) / u, and the way is suitable exactly from it', () => {
    const w = mixWeightCold(-10, 0, -10, 23);
    const checkRangeKm = checkRanges(exampleCandidateCompute().rangeKm, w, 0);
    const u = usableShare(params);
    const wayKm = 10 + 15 + 35;
    const plain = sohThreshold(wayA, checkRangeKm, 2, u, 0);
    const withR = sohThreshold(wayA, checkRangeKm, 2, u, 12);
    expect(withR).toBeCloseTo((plain * (2 + 12 / wayKm)) / 2, 12);
    expect(withR).toBeGreaterThan(plain);
    const at = (soh: number) =>
      checkWay({
        distanceKm: wayA,
        checkRangeKm,
        soh,
        u,
        chargesFreeAtWork: false,
        greenFromPct: 15,
        minReserveKm: 12,
      });
    expect(at(withR * 1.0001).suitable).toBe(true);
    expect(at(withR * 0.9999).suitable).toBe(false);
    // at the threshold the reserve is R, up to rounding
    expect(at(withR * 1.0000001).reserveKm).toBeCloseTo(12, 3);
  });

  it('OPT.threshold: a way of 0 km has the threshold of R = 0, whatever R is', () => {
    const checkRangeKm = { city: 100, rural: 100, highway: 100 };
    const none: PerRoad = { city: 0, rural: 0, highway: 0 };
    expect(sohThreshold(none, checkRangeKm, 2, 0.63, 50)).toBe(
      sohThreshold(none, checkRangeKm, 2, 0.63, 0),
    );
  });

  it('traces the Kilometerreserve and the way length as inputs', () => {
    const trace = new Trace();
    january(false, trace, 5);
    const suitable = trace.entries.find((e) => e.formula === 'F3.suitable');
    expect(suitable?.inputs).toMatchObject({ minReserveKm: 5, wayKm: 60 });
  });

  it('F3 with R: suitable exactly when the reserve reaches R, red exactly when not suitable', () => {
    const road = (max: number) =>
      fc.record({
        city: fc.double({ min: 0, max, noNaN: true }),
        rural: fc.double({ min: 0, max, noNaN: true }),
        highway: fc.double({ min: 1, max, noNaN: true }),
      });
    const input = fc.record({
      distanceKm: road(150),
      checkRangeKm: fc.record({
        city: fc.double({ min: 50, max: 700, noNaN: true }),
        rural: fc.double({ min: 50, max: 700, noNaN: true }),
        highway: fc.double({ min: 50, max: 700, noNaN: true }),
      }),
      soh: fc.double({ min: 0.5, max: 1, noNaN: true }),
      u: fc.double({ min: 0.1, max: 0.7, noNaN: true }),
      chargesFreeAtWork: fc.boolean(),
      greenFromPct: fc.constant(15),
      minReserveKm: fc.double({ min: 0, max: 120, noNaN: true }),
    });
    fc.assert(
      fc.property(input, (i) => {
        const check = checkWay(i);
        const margin = 1e-6 * Math.max(1, Math.abs(i.minReserveKm));
        if (check.reserveKm > i.minReserveKm + margin) {
          expect(check.suitable).toBe(true);
        }
        if (check.reserveKm < i.minReserveKm - margin) {
          expect(check.suitable).toBe(false);
        }
        expect(check.light === 'red').toBe(!check.suitable);
        if (check.belowMinReserve) {
          expect(check.suitable).toBe(false);
          expect(check.reserveKm).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});
