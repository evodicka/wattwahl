import { describe, expect, it } from 'vitest';
import { TraceEntrySchema } from '../../domain';
import { Trace } from '../trace';
import { consumption, gridEnergy } from './energy';
import { mixWeight, mixWeightCold } from './range';
import { sohAt, sohCurve, sohSlope } from './soh';
import { capacityShare, checkWay, reserveKm, reservePct } from './suitability';
import type { PerRoad } from './units';

// Degenerate inputs give finite results, so results and the trace never hold
// NaN or Infinity (the trace schema rejects them).

const ranges: PerRoad = { city: 400, rural: 350, highway: 300 };
const noRange: PerRoad = { city: 0, rural: 0, highway: 0 };
const way: PerRoad = { city: 10, rural: 15, highway: 35 };
const noWay: PerRoad = { city: 0, rural: 0, highway: 0 };

function expectFiniteTrace(trace: Trace) {
  expect(trace.entries.length).toBeGreaterThan(0);
  for (const entry of trace.entries) {
    expect(TraceEntrySchema.safeParse(entry).success).toBe(true);
  }
}

describe('F1: tMild = tCold', () => {
  it('F1.w is a step at the mild temperature', () => {
    const trace = new Trace();
    expect(mixWeight(5, 10, 10, trace)).toBe(0);
    expect(mixWeight(10, 10, 10, trace)).toBe(1);
    expect(mixWeight(20, 10, 10, trace)).toBe(1);
    expectFiniteTrace(trace);
  });

  it('F1.wStar applies the cold reserve before the step', () => {
    expect(mixWeightCold(12, 5, 10, 10)).toBe(0);
    expect(mixWeightCold(15, 5, 10, 10)).toBe(1);
  });
});

describe('F2: kmToSohMin = 0', () => {
  it('F2.slope is finite and the SoH drops to its floor straight away', () => {
    const trace = new Trace();
    const slope = sohSlope(70, 0, trace);
    expect(Number.isFinite(slope)).toBe(true);
    const curve = sohCurve(
      { sohMinPct: 70, kmToSohMin: 0 },
      { mileageKm: 1000, sohKnownPct: null },
      trace,
    );
    expect(sohAt(curve, 1, trace)).toBeCloseTo(0.7, 12);
    expect(sohAt(curve, 0, trace)).toBe(1);
    expectFiniteTrace(trace);
  });

  it('F2.slope is 0 when there is nothing to age', () => {
    expect(sohSlope(100, 0)).toBe(0);
  });
});

describe('F3: zero phi, range or SoH', () => {
  it('F3.phi: a way of 0 km needs no capacity, even without range or SoH', () => {
    expect(capacityShare(noWay, noRange, 0)).toBe(0);
  });

  it('F3.phi: distance without range or without SoH exceeds the battery', () => {
    const trace = new Trace();
    expect(Number.isFinite(capacityShare(way, noRange, 1, trace))).toBe(true);
    expect(capacityShare(way, noRange, 1)).toBeGreaterThan(1);
    expect(capacityShare(way, ranges, 0)).toBeGreaterThan(1);
    expectFiniteTrace(trace);
  });

  it('F3.reserveKm and F3.reservePct are unlimited but finite for φ = 0', () => {
    const trace = new Trace();
    expect(reserveKm(60, 0.63, 0, 2, trace)).toBe(Number.MAX_VALUE);
    expect(reserveKm(0, 0.63, 0, 2, trace)).toBe(0);
    expect(reservePct(0.63, 0, 2, trace)).toBe(Number.MAX_VALUE);
    expect(reservePct(0, 0, 2)).toBe(0);
    expectFiniteTrace(trace);
  });

  it('F3: a way of 0 km is suitable, green, with finite results', () => {
    const trace = new Trace();
    const check = checkWay(
      {
        distanceKm: noWay,
        checkRangeKm: ranges,
        soh: 1,
        u: 0.63,
        chargesFreeAtWork: false,
        greenFromPct: 15,
        minReserveKm: 0,
      },
      trace,
    );
    expect(check.suitable).toBe(true);
    expect(check.light).toBe('green');
    expect(
      Object.values(check).every(
        (v) => typeof v !== 'number' || Number.isFinite(v),
      ),
    ).toBe(true);
    expectFiniteTrace(trace);
  });

  it('F3: a way without range is red with finite results', () => {
    const check = checkWay({
      distanceKm: way,
      checkRangeKm: noRange,
      soh: 1,
      u: 0.63,
      chargesFreeAtWork: false,
      greenFromPct: 15,
      minReserveKm: 0,
    });
    expect(check.suitable).toBe(false);
    expect(check.light).toBe('red');
    expect(Number.isFinite(check.reservePct)).toBe(true);
    expect(Number.isFinite(check.reserveKm)).toBe(true);
  });
});

describe('F4: zero range or efficiency', () => {
  it('F4.c is finite for a range of 0', () => {
    const trace = new Trace();
    const c = consumption(60, noRange, trace);
    expect(Object.values(c).every(Number.isFinite)).toBe(true);
    expectFiniteTrace(trace);
  });

  it('F4.Egrid is finite for an efficiency of 0', () => {
    const trace = new Trace();
    expect(Number.isFinite(gridEnergy(15, 0, trace))).toBe(true);
    expect(gridEnergy(0, 0)).toBe(0);
    expectFiniteTrace(trace);
  });
});
