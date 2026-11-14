import type { RoadType } from '../../domain';

/** The one place that turns stored percent values into fractions (architecture 8.1). */
export const fraction = (percent: number): number => percent / 100;

/** Inverse of `fraction`: a fraction as the percent value that is stored and shown. */
export const percent = (fractionValue: number): number => fractionValue * 100;

/** Trips per working day (there and back); F3.n counts `2 - z` of them. */
export const TRIPS_PER_WORKING_DAY = 2;

/**
 * num / den that always returns a finite number, so degenerate inputs never put
 * NaN or Infinity into results or the trace: 0 when there is nothing to divide
 * (num = 0), the largest finite number when den <= 0 or the quotient overflows.
 */
export function finiteRatio(num: number, den: number): number {
  if (num === 0) return 0;
  if (den <= 0) return Number.MAX_VALUE;
  return Math.min(num / den, Number.MAX_VALUE);
}

/** A value per road type, e.g. km or km/100 l. */
export type PerRoad = Record<RoadType, number>;

const ROADS = ['city', 'rural', 'highway'] as const;

/**
 * Trace inputs of a per-road value: `city`, `rural`, `highway`, or with a
 * prefix `cCity`, `cRural`, `cHighway`.
 */
export function roadInputs(
  perRoad: PerRoad,
  prefix?: string,
): Record<string, number> {
  const inputs: Record<string, number> = {};
  for (const road of ROADS) {
    const key = prefix
      ? prefix + road.charAt(0).toUpperCase() + road.slice(1)
      : road;
    inputs[key] = perRoad[road];
  }
  return inputs;
}
