import type { CandidateCompute } from '../../domain';
import type { Trace } from '../trace';
import { fraction, type PerRoad } from './units';

// Spec "Berechnungslogik" section 1: range at a monthly temperature.

type RangePair = { mild: number; cold: number };
export type CandidateRanges = CandidateCompute['rangeKm'];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** F1.w: weight of the mild range at monthly temperature `tempC`. */
export function mixWeight(
  tempC: number,
  tColdC: number,
  tMildC: number,
  trace?: Trace,
): number {
  const w = clamp01((tempC - tColdC) / (tMildC - tColdC));
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
  const w = clamp01((tempC - coldReserveK - tColdC) / (tMildC - tColdC));
  trace?.add({
    formula: 'F1.wStar',
    inputs: { tempC, coldReserveK, tColdC, tMildC },
    value: w,
  });
  return w;
}

/**
 * F1.R, or F1.RStar with the weight from `mixWeightCold`: range per road type.
 * City is city, rural is combined, highway is reduced by the highway discount.
 */
export function roadRanges(
  ranges: CandidateRanges,
  weight: number,
  highwayDiscountPct: number,
  trace?: Trace,
  formula: 'F1.R' | 'F1.RStar' = 'F1.R',
): PerRoad {
  const at = (pair: RangePair): number =>
    pair.cold + weight * (pair.mild - pair.cold);
  const result: PerRoad = {
    city: at(ranges.city),
    rural: at(ranges.combined),
    highway: at(ranges.highway) * (1 - fraction(highwayDiscountPct)),
  };
  if (trace) {
    const source = { city: 'city', rural: 'combined', highway: 'highway' };
    for (const road of ['city', 'rural', 'highway'] as const) {
      const pair = ranges[source[road] as keyof CandidateRanges];
      trace.add({
        formula,
        inputs: {
          road,
          weight,
          cold: pair.cold,
          mild: pair.mild,
          highwayDiscountPct: road === 'highway' ? highwayDiscountPct : 0,
        },
        value: result[road],
      });
    }
  }
  return result;
}
