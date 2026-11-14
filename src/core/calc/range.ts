import { ROAD_TYPES, type CandidateCompute, type RoadType } from '../../domain';
import type { Trace } from '../trace';
import { fraction, type PerRoad } from './units';

// Spec "Berechnungslogik" section 1: range at a monthly temperature.

type RangePair = { mild: number; cold: number };
export type CandidateRanges = CandidateCompute['rangeKm'];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Position of `tempC` between the cold and mild temperature, clamped to 0..1.
 * With tColdC = tMildC there is no transition, so the weight is a step: 1 from
 * the mild temperature, 0 below.
 */
function weightAt(tempC: number, tColdC: number, tMildC: number): number {
  const span = tMildC - tColdC;
  if (span === 0) return tempC >= tMildC ? 1 : 0;
  return clamp01((tempC - tColdC) / span);
}

/** F1.w: weight of the mild range at monthly temperature `tempC`. */
export function mixWeight(
  tempC: number,
  tColdC: number,
  tMildC: number,
  trace?: Trace,
): number {
  const w = weightAt(tempC, tColdC, tMildC);
  trace?.add({ formula: 'F1.w', inputs: { tempC, tColdC, tMildC }, value: w });
  return w;
}

/** F1.wStar: the same weight at `tempC - ΔT`, for the suitability check. */
export function mixWeightCold(
  tempC: number,
  coldReserveK: number,
  tColdC: number,
  tMildC: number,
  trace?: Trace,
): number {
  const w = weightAt(tempC - coldReserveK, tColdC, tMildC);
  trace?.add({
    formula: 'F1.wStar',
    inputs: { tempC, coldReserveK, tColdC, tMildC },
    value: w,
  });
  return w;
}

/** Which candidate range each road type uses: rural is the combined range. */
const RANGE_SOURCE: Record<RoadType, keyof CandidateRanges> = {
  city: 'city',
  rural: 'combined',
  highway: 'highway',
};

function rangesFor(
  formula: 'F1.R' | 'F1.RStar',
  ranges: CandidateRanges,
  weight: number,
  highwayDiscountPct: number,
  trace?: Trace,
): PerRoad {
  const at = (pair: RangePair): number =>
    pair.cold + weight * (pair.mild - pair.cold);
  const result: PerRoad = {
    city: at(ranges.city),
    rural: at(ranges.combined),
    highway: at(ranges.highway) * (1 - fraction(highwayDiscountPct)),
  };
  if (trace) {
    for (const road of ROAD_TYPES) {
      const pair = ranges[RANGE_SOURCE[road]];
      trace.add({
        formula,
        inputs: {
          road,
          weight,
          cold: pair.cold,
          mild: pair.mild,
          ...(road === 'highway' && { highwayDiscountPct }),
        },
        value: result[road],
      });
    }
  }
  return result;
}

/**
 * F1.R: range per road type at the monthly weight from `mixWeight`. City is
 * city, rural is combined, highway is reduced by the highway discount.
 */
export function roadRanges(
  ranges: CandidateRanges,
  weight: number,
  highwayDiscountPct: number,
  trace?: Trace,
): PerRoad {
  return rangesFor('F1.R', ranges, weight, highwayDiscountPct, trace);
}

/** F1.RStar: the same ranges with the weight from `mixWeightCold`, for the suitability check. */
export function checkRanges(
  ranges: CandidateRanges,
  weight: number,
  highwayDiscountPct: number,
  trace?: Trace,
): PerRoad {
  return rangesFor('F1.RStar', ranges, weight, highwayDiscountPct, trace);
}
