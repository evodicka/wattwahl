import { describe, expect, it } from 'vitest';
import { exampleCandidateCompute } from '../../../tests/fixtures/exampleScenario';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import { Trace } from '../trace';
import {
  consumption,
  evDayCost,
  gridEnergy,
  iceDayLitres,
  maintenanceKmPerDay,
  wayEnergy,
} from './energy';
import { mixWeight, roadRanges } from './range';
import type { PerRoad } from './units';

const wayA: PerRoad = { city: 10, rural: 15, highway: 35 };
const candidate = exampleCandidateCompute();

/** Test case 4 uses the January values: cold range, -10 °C. */
function january(trace?: Trace) {
  const w = mixWeight(-10, -10, 23, trace);
  const range = roadRanges(candidate.rangeKm, w, 0, trace);
  const c = consumption(candidate.netCapacityKwh, range, trace);
  const battery = wayEnergy(wayA, c, trace);
  const grid = gridEnergy(battery, 90, trace);
  return { c, battery, grid };
}

describe('TC4: energy and daily cost of the EV (F4)', () => {
  it('TC4: consumption 0.200 / 0.231 / 0.273 kWh/km, 15.01 kWh at the battery, 16.67 kWh from the grid', () => {
    const trace = new Trace();
    const { c, battery, grid } = january(trace);
    expectSpec(c.city, '0,200');
    expectSpec(c.rural, '0,231');
    expectSpec(c.highway, '0,273');
    expectSpec(battery, '15,01');
    expectSpec(grid, '16,67');
    expect(new Set(trace.entries.map((e) => e.formula))).toEqual(
      new Set(['F1.w', 'F1.R', 'F4.c', 'F4.E', 'F4.Egrid']),
    );
  });

  it('TC4: daily cost 10.00 EUR without and 5.00 EUR with charging at work', () => {
    const { grid } = january();
    const trace = new Trace();
    expectSpec(evDayCost(2, grid, 0.3, trace), '10,00');
    expectSpec(evDayCost(1, grid, 0.3), '5,00');
    expect(trace.entries[0]?.formula).toBe('F4.evDayCost');
  });
});

describe('TC5: petrol car per day (F4)', () => {
  it('TC5: 4.15 l per way, 8.3 l per day, 15.77 EUR at 1.90 EUR/l', () => {
    const v: PerRoad = { city: 8, rural: 6, highway: 7 };
    const trace = new Trace();
    const litres = iceDayLitres(wayA, v, trace);
    expectSpec(litres / 2, '4,15');
    expectSpec(litres, '8,3');
    expectSpec(litres * 1.9, '15,77');
    expect(trace.entries.map((e) => e.formula)).toEqual(['F4.iceDayLitres']);
  });
});

describe('F4: maintenance distance', () => {
  it('F4.maintKm: a working day covers twice the one-way distance', () => {
    const trace = new Trace();
    expect(maintenanceKmPerDay(60, trace)).toBe(120);
    expect(trace.entries[0]?.formula).toBe('F4.maintKm');
  });

  it('F4: a traced call returns the same values as an untraced call', () => {
    expect(january(new Trace())).toEqual(january());
  });
});
