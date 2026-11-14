import type { Trace } from '../trace';
import type { PerRoad } from './units';
import { fraction } from './units';

// Spec "Berechnungslogik" section 4: consumption and energy. Consumption is
// derived from range and capacity and does not depend on the SoH.

/** F4.c: consumption in kWh/km per road type, C / R_i(m). */
export function consumption(
  capacityKwh: number,
  rangeKm: PerRoad,
  trace?: Trace,
): PerRoad {
  const result: PerRoad = {
    city: capacityKwh / rangeKm.city,
    rural: capacityKwh / rangeKm.rural,
    highway: capacityKwh / rangeKm.highway,
  };
  if (trace) {
    for (const road of ['city', 'rural', 'highway'] as const) {
      trace.add({
        formula: 'F4.c',
        inputs: { road, capacityKwh, rangeKm: rangeKm[road] },
        value: result[road],
      });
    }
  }
  return result;
}

/** F4.E: battery energy of one way in kWh, Σ d_i c_i. */
export function wayEnergy(
  distanceKm: PerRoad,
  consumptionKwhPerKm: PerRoad,
  trace?: Trace,
): number {
  const energy =
    distanceKm.city * consumptionKwhPerKm.city +
    distanceKm.rural * consumptionKwhPerKm.rural +
    distanceKm.highway * consumptionKwhPerKm.highway;
  trace?.add({
    formula: 'F4.E',
    inputs: {
      city: distanceKm.city,
      rural: distanceKm.rural,
      highway: distanceKm.highway,
      cCity: consumptionKwhPerKm.city,
      cRural: consumptionKwhPerKm.rural,
      cHighway: consumptionKwhPerKm.highway,
    },
    value: energy,
  });
  return energy;
}

/** F4.Egrid: energy drawn from the grid, E / η. */
export function gridEnergy(
  batteryKwh: number,
  chargingEfficiencyPct: number,
  trace?: Trace,
): number {
  const grid = batteryKwh / fraction(chargingEfficiencyPct);
  trace?.add({
    formula: 'F4.Egrid',
    inputs: { batteryKwh, chargingEfficiencyPct },
    value: grid,
  });
  return grid;
}

/** F4.evDayCost: home charging cost per working day, n · E_grid · price (n = 2 - z). */
export function evDayCost(
  n: number,
  gridKwh: number,
  electricityPrice: number,
  trace?: Trace,
): number {
  const cost = n * gridKwh * electricityPrice;
  trace?.add({
    formula: 'F4.evDayCost',
    inputs: { n, gridKwh, electricityPrice },
    value: cost,
  });
  return cost;
}

/** F4.iceDayLitres: petrol per working day, 2 · Σ d_i v_i / 100. */
export function iceDayLitres(
  distanceKm: PerRoad,
  consumptionLPer100Km: PerRoad,
  trace?: Trace,
): number {
  const litres =
    (2 *
      (distanceKm.city * consumptionLPer100Km.city +
        distanceKm.rural * consumptionLPer100Km.rural +
        distanceKm.highway * consumptionLPer100Km.highway)) /
    100;
  trace?.add({
    formula: 'F4.iceDayLitres',
    inputs: {
      city: distanceKm.city,
      rural: distanceKm.rural,
      highway: distanceKm.highway,
      vCity: consumptionLPer100Km.city,
      vRural: consumptionLPer100Km.rural,
      vHighway: consumptionLPer100Km.highway,
    },
    value: litres,
  });
  return litres;
}

/** F4.maintKm: km per working day and car that incur maintenance, 2 · d_w. */
export function maintenanceKmPerDay(wayKm: number, trace?: Trace): number {
  const km = 2 * wayKm;
  trace?.add({ formula: 'F4.maintKm', inputs: { wayKm }, value: km });
  return km;
}
