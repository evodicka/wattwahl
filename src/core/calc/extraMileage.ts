import type { Trace } from '../trace';
import { fraction, type PerRoad } from './units';

// Spec "Berechnungslogik" section 6: the extra mileage of a month is split
// between the EV (share x) and the petrol car (the rest).

const ROADS = ['city', 'rural', 'highway'] as const;

export type ExtraMileageSplit = { ev: PerRoad; ice: PerRoad };

/** F6.share: km per month and road type for the EV (`evSharePct`) and the petrol car. */
export function splitExtraMileage(
  kmPerMonth: PerRoad,
  evSharePct: number,
  trace?: Trace,
): ExtraMileageSplit {
  const x = fraction(evSharePct);
  const ev: PerRoad = {
    city: kmPerMonth.city * x,
    rural: kmPerMonth.rural * x,
    highway: kmPerMonth.highway * x,
  };
  const ice: PerRoad = {
    city: kmPerMonth.city - ev.city,
    rural: kmPerMonth.rural - ev.rural,
    highway: kmPerMonth.highway - ev.highway,
  };
  if (trace) {
    for (const road of ROADS) {
      trace.add({
        formula: 'F6.share',
        inputs: { road, kmPerMonth: kmPerMonth[road], evSharePct },
        value: ev[road],
      });
    }
  }
  return { ev, ice };
}
