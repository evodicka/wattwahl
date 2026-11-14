import type { Parameters } from '../../domain';
import type { Trace } from '../trace';
import { fraction, type PerRoad } from './units';

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
  const n = chargesFreeAtWork ? 1 : 2;
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
  const phi =
    distanceKm.city / (checkRangeKm.city * soh) +
    distanceKm.rural / (checkRangeKm.rural * soh) +
    distanceKm.highway / (checkRangeKm.highway * soh);
  trace?.add({
    formula: 'F3.phi',
    inputs: {
      city: distanceKm.city,
      rural: distanceKm.rural,
      highway: distanceKm.highway,
      rangeCity: checkRangeKm.city,
      rangeRural: checkRangeKm.rural,
      rangeHighway: checkRangeKm.highway,
      soh,
    },
    value: phi,
  });
  return phi;
}

/** F3.suitable: n · φ ≤ u. */
export function isSuitable(
  n: number,
  phi: number,
  u: number,
  trace?: Trace,
): boolean {
  const suitable = n * phi <= u;
  trace?.add({
    formula: 'F3.suitable',
    inputs: { n, phi, u },
    value: suitable,
  });
  return suitable;
}

/** F3.reserveKm: d_w (u / φ - n). Negative when the way is not suitable. */
export function reserveKm(
  wayKm: number,
  u: number,
  phi: number,
  n: number,
  trace?: Trace,
): number {
  const reserve = wayKm * (u / phi - n);
  trace?.add({
    formula: 'F3.reserveKm',
    inputs: { wayKm, u, phi, n },
    value: reserve,
  });
  return reserve;
}

/** F3.reservePct: u / (n · φ) - 1, in percent. */
export function reservePct(
  u: number,
  phi: number,
  n: number,
  trace?: Trace,
): number {
  const reserve = (u / (n * phi) - 1) * 100;
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
  return {
    phi,
    n,
    suitable: isSuitable(n, phi, input.u, trace),
    reserveKm: reserveKm(sumRoads(input.distanceKm), input.u, phi, n, trace),
    reservePct: reserve,
    light: trafficLight(reserve, input.greenFromPct, trace),
  };
}

/**
 * OPT.threshold: the lowest SoH at which the way is suitable, n · φ_1 / u with
 * φ_1 the capacity share at SoH 1. The optimizer uses it to find which options
 * a given SoH permits.
 */
export function sohThreshold(
  distanceKm: PerRoad,
  checkRangeKm: PerRoad,
  n: number,
  u: number,
  trace?: Trace,
): number {
  const phiAtFullSoh = capacityShare(distanceKm, checkRangeKm, 1);
  const threshold = (n * phiAtFullSoh) / u;
  trace?.add({
    formula: 'OPT.threshold',
    inputs: { phiAtFullSoh, n, u },
    value: threshold,
  });
  return threshold;
}
