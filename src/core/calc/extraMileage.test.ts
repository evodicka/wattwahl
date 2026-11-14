import { describe, expect, it } from 'vitest';
import { Trace } from '../trace';
import { splitExtraMileage } from './extraMileage';

const km = { city: 50, rural: 100, highway: 150 };

describe('F6: extra mileage split', () => {
  it('F6.share: 30 % to the EV, the rest to the petrol car, per road type', () => {
    const trace = new Trace();
    const { ev, ice } = splitExtraMileage(km, 30, trace);
    expect(ev.city).toBeCloseTo(15, 12);
    expect(ev.highway).toBeCloseTo(45, 12);
    expect(ice.rural).toBeCloseTo(70, 12);
    expect(trace.entries.map((e) => e.formula)).toEqual([
      'F6.share',
      'F6.share',
      'F6.share',
    ]);
  });

  it('F6.share: 0 % and 100 % give everything to one car', () => {
    expect(splitExtraMileage(km, 0).ev).toEqual({
      city: 0,
      rural: 0,
      highway: 0,
    });
    expect(splitExtraMileage(km, 100).ice).toEqual({
      city: 0,
      rural: 0,
      highway: 0,
    });
  });
});
