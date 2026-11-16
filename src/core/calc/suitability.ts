import type { Parameters } from '../../domain';
import type { Trace } from '../trace';
import {
  TRIPS_PER_WORKING_DAY,
  finiteRatio,
  fraction,
  percent,
  roadInputs,
  type PerRoad,
} from './units';

// Spec "Berechnungslogik" section 3: suitability of one way in one month.
// Reserves are in percent (25.9 means 25.9 %), like every stored percentage.

export type TrafficLight = 'green' | 'yellow' | 'red';

const sumRoads = (km: PerRoad): number => km.city + km.rural + km.highway;

/** F3.u: usable share of the capacity, (upper - lower) · (1 - buffer). */
export function usableShare(
  parameters: Pick<
    Parameters,
    'chargeLowerPct' | 'chargeUpperPct' | 'safetyBufferPct'
  >,
  trace?: Trace,
): number {
  const { chargeLowerPct, chargeUpperPct, safetyBufferPct } = parameters;
  const u =
    fraction(chargeUpperPct - chargeLowerPct) * (1 - fraction(safetyBufferPct));
  trace?.add({
    formula: 'F3.u',
    inputs: { chargeLowerPct, chargeUpperPct, safetyBufferPct },
    value: u,
  });
  return u;
}

/** F3.n: trips counted against the range, 2 - z (1 if charging at work is possible). */
export function tripsCounted(
  chargesFreeAtWork: boolean,
  trace?: Trace,
): number {
  const n = TRIPS_PER_WORKING_DAY - (chargesFreeAtWork ? 1 : 0);
  trace?.add({ formula: 'F3.n', inputs: { chargesFreeAtWork }, value: n });
  return n;
}

/** F3.phi: capacity share needed for one way, Σ d_i / (R*_i · SoH). */
export function capacityShare(
  distanceKm: PerRoad,
  checkRangeKm: PerRoad,
  soh: number,
  trace?: Trace,
): number {
  // A road without distance needs no capacity; a road with distance but no
  // range or no SoH needs more than the battery has (largest finite share).
  const phi = Math.min(
    finiteRatio(distanceKm.city, checkRangeKm.city * soh) +
      finiteRatio(distanceKm.rural, checkRangeKm.rural * soh) +
      finiteRatio(distanceKm.highway, checkRangeKm.highway * soh),
    Number.MAX_VALUE,
  );
  trace?.add({
    formula: 'F3.phi',
    inputs: {
      ...roadInputs(distanceKm),
      ...roadInputs(checkRangeKm, 'range'),
      soh,
    },
    value: phi,
  });
  return phi;
}

/**
 * Trips counted with the Kilometerreserve added as a share of the way,
 * n + R / d_w. A way of 0 km has no such share (no division by 0): it needs no
 * reserve. With R = 0 this is n, bit for bit.
 */
function tripsWithReserve(
  n: number,
  wayKm: number,
  minReserveKm: number,
): number {
  return wayKm === 0 ? n : n + minReserveKm / wayKm;
}

/**
 * F3.suitable: (n + R / d_w) · φ ≤ u, the same as reserve in km ≥ R. A way of
 * 0 km is always suitable.
 */
export function isSuitable(
  n: number,
  phi: number,
  u: number,
  wayKm: number,
  minReserveKm: number,
  trace?: Trace,
): boolean {
  const suitable =
    wayKm === 0 || tripsWithReserve(n, wayKm, minReserveKm) * phi <= u;
  trace?.add({
    formula: 'F3.suitable',
    inputs: { n, phi, u, minReserveKm, wayKm },
    value: suitable,
  });
  return suitable;
}

/**
 * F3.reserveKm: d_w (u / φ - n). Negative when the way is not suitable. With
 * φ = 0 the reserve is unlimited (largest finite value), or 0 for a way of 0 km.
 */
export function reserveKm(
  wayKm: number,
  u: number,
  phi: number,
  n: number,
  trace?: Trace,
): number {
  const reserve = Math.min(wayKm * (finiteRatio(u, phi) - n), Number.MAX_VALUE);
  trace?.add({
    formula: 'F3.reserveKm',
    inputs: { wayKm, u, phi, n },
    value: reserve,
  });
  return reserve;
}

/**
 * F3.reservePct: u / (n · φ) - 1, in percent. Without a need (n · φ = 0) the
 * reserve is unlimited (largest finite value), or 0 when there is no usable
 * capacity either.
 */
export function reservePct(
  u: number,
  phi: number,
  n: number,
  trace?: Trace,
): number {
  const need = n * phi;
  const reserve =
    need <= 0
      ? u > 0
        ? Number.MAX_VALUE
        : 0
      : Math.min(percent(u / need - 1), Number.MAX_VALUE);
  trace?.add({
    formula: 'F3.reservePct',
    inputs: { u, phi, n },
    value: reserve,
  });
  return reserve;
}

/** F3.trafficLight: green from the threshold, yellow from 0 %, red below. */
export function trafficLight(
  reservePercent: number,
  greenFromPct: number,
  trace?: Trace,
): TrafficLight {
  const light: TrafficLight =
    reservePercent >= greenFromPct
      ? 'green'
      : reservePercent >= 0
        ? 'yellow'
        : 'red';
  trace?.add({
    formula: 'F3.trafficLight',
    inputs: { reservePercent, greenFromPct },
    value: light,
  });
  return light;
}

export type WayCheck = {
  phi: number;
  n: number;
  suitable: boolean;
  reserveKm: number;
  reservePct: number;
  light: TrafficLight;
  /**
   * Not suitable although the reserve is not negative: it lies between 0 and
   * the Kilometerreserve. The light is red then, and the cell says why.
   */
  belowMinReserve: boolean;
};

/** All of section 3 for one way, month and SoH. */
export function checkWay(
  input: {
    distanceKm: PerRoad;
    checkRangeKm: PerRoad;
    soh: number;
    u: number;
    chargesFreeAtWork: boolean;
    greenFromPct: number;
    /** Kilometerreserve R in km. */
    minReserveKm: number;
  },
  trace?: Trace,
): WayCheck {
  const n = tripsCounted(input.chargesFreeAtWork, trace);
  const phi = capacityShare(
    input.distanceKm,
    input.checkRangeKm,
    input.soh,
    trace,
  );
  const reserve = reservePct(input.u, phi, n, trace);
  const wayKm = sumRoads(input.distanceKm);
  const suitable = isSuitable(
    n,
    phi,
    input.u,
    wayKm,
    input.minReserveKm,
    trace,
  );
  // n·φ ≤ u and u/(n·φ) - 1 ≥ 0 differ by rounding at the boundary; the
  // suitability flag decides, so the light is red exactly when not suitable.
  const lightReserve = suitable
    ? Math.max(reserve, 0)
    : Math.min(reserve, -Number.MIN_VALUE);
  const reserveInKm = reserveKm(wayKm, input.u, phi, n, trace);
  return {
    phi,
    n,
    suitable,
    reserveKm: reserveInKm,
    reservePct: reserve,
    light: trafficLight(lightReserve, input.greenFromPct, trace),
    belowMinReserve: !suitable && input.minReserveKm > 0 && reserveInKm >= 0,
  };
}

/**
 * OPT.threshold: the lowest SoH at which the way is suitable,
 * (n + R / d_w) · φ_1 / u with φ_1 the capacity share at SoH 1. The optimizer uses it to find which options
 * a given SoH permits. The value is not clamped: above 1 the way is never
 * suitable, below the minimum SoH it is always suitable.
 */
export function sohThreshold(
  distanceKm: PerRoad,
  checkRangeKm: PerRoad,
  n: number,
  u: number,
  minReserveKm: number,
  trace?: Trace,
): number {
  // Untraced on purpose: only OPT.threshold belongs in the Rechenweg here.
  const phiAtFullSoh = capacityShare(distanceKm, checkRangeKm, 1);
  const wayKm = sumRoads(distanceKm);
  const threshold = finiteRatio(
    tripsWithReserve(n, wayKm, minReserveKm) * phiAtFullSoh,
    u,
  );
  trace?.add({
    formula: 'OPT.threshold',
    inputs: { phiAtFullSoh, n, u, minReserveKm, wayKm },
    value: threshold,
  });
  return threshold;
}
