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
  sohThreshold,
  trafficLight,
  usableShare,
} from './suitability';
import type { PerRoad } from './units';

const params = exampleScenario().parameters;
const wayA: PerRoad = { city: 10, rural: 15, highway: 35 };

/** Test case 1 and 2: January at -10 °C, SoH 1, check range of the common data. */
function january(chargesFreeAtWork: boolean, trace?: Trace) {
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
    const threshold = sohThreshold(wayA, checkRangeKm, 2, u);
    const at = (soh: number) =>
      checkWay({
        distanceKm: wayA,
        checkRangeKm,
        soh,
        u,
        chargesFreeAtWork: false,
        greenFromPct: 15,
      });
    expect(at(threshold * 1.0001).suitable).toBe(true);
    expect(at(threshold * 0.9999).suitable).toBe(false);
  });

  it('OPT.threshold: above 1 the way is never suitable, and it stays finite for u = 0', () => {
    const w = mixWeightCold(-10, 0, -10, 23);
    const checkRangeKm = checkRanges(exampleCandidateCompute().rangeKm, w, 0);
    const longWay: PerRoad = { city: 100, rural: 100, highway: 200 };
    const threshold = sohThreshold(longWay, checkRangeKm, 2, 0.63);
    expect(threshold).toBeGreaterThan(1);
    expect(
      checkWay({
        distanceKm: longWay,
        checkRangeKm,
        soh: 1,
        u: 0.63,
        chargesFreeAtWork: false,
        greenFromPct: 15,
      }).suitable,
    ).toBe(false);
    expect(Number.isFinite(sohThreshold(wayA, checkRangeKm, 2, 0))).toBe(true);
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
