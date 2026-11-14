import type { RoadType } from '../../domain';

/** The one place that turns stored percent values into fractions (architecture 8.1). */
export const fraction = (percent: number): number => percent / 100;

/** A value per road type, e.g. km or km/100 l. */
export type PerRoad = Record<RoadType, number>;
