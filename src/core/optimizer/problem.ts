import {
  WEEKDAYS,
  type CandidateCompute,
  type PresenceState,
  type ScenarioCompute,
  type Weekday,
} from '../../domain';
import {
  consumption,
  evDayCost,
  gridEnergy,
  iceDayLitres,
  maintenanceKmPerDay,
  wayEnergy,
} from '../calc/energy';
import { splitExtraMileage } from '../calc/extraMileage';
import { effectiveEvMaintenancePerKm } from '../calc/costs';
import {
  electricityFactor,
  maintenanceFactor,
  petrolFactor,
  type ResolvedPrices,
} from '../calc/prices';
import {
  checkRanges,
  mixWeight,
  mixWeightCold,
  roadRanges,
} from '../calc/range';
import { sohAt, sohCurve, sohKEnd } from '../calc/soh';
import {
  checkWay,
  sohThreshold,
  tripsCounted,
  usableShare,
  type WayCheck,
} from '../calc/suitability';
import { attendanceFactors, expectedDays } from '../calc/workdays';
import { createSolver, type Solver } from './select';
import type { Group, Option } from './types';

// Maps a scenario, a candidate and one price case to the decision groups of the
// generic solver (spec "Entscheidungen und Zulässigkeit"). The result does not
// depend on the offer (purchase or lease tier), so all offers of a candidate
// share it.

/** Size of one DP cell in km per year (architecture 8.4, E2). S11 may coarsen it. */
export const DP_CELL_KM = 1;

export const WAYS = ['a', 'b'] as const;
export type Way = (typeof WAYS)[number];

/** Permission pair of a way in a month: the EV may drive the way at a SoH from its threshold. */
export const pairIndex = (way: Way, month: number): number =>
  (way === 'a' ? 0 : 12) + month;

/** What a group stands for, parallel to `Problem.groups`. */
export type GroupInfo =
  | {
      kind: 'day';
      weekday: Weekday;
      month: number;
      state: PresenceState;
      /** Expected days of this weekday in this month (F5.days), also the yearly weight. */
      days: number;
    }
  | { kind: 'extra'; month: number };

export type Problem = {
  groups: Group[];
  info: GroupInfo[];
  /** DP and plan cache of this candidate and price case, shared by all its offers. */
  solver: Solver;
  /** SoH thresholds per permission pair, indexed by `pairIndex`. */
  thresholds: number[];
  sohForKmPerYear: (kmPerYear: number) => number;
  /** Smallest reserve in percent over both ways and all months at a SoH. */
  reserveAtSoh: (soh: number) => number;
  /** Suitability of one way in one month at a SoH (section 3). */
  checkWayAt: (way: Way, month: number, soh: number) => WayCheck;
};

/**
 * Shares 0, step, 2 step, … below 100 and 100 itself, in percent. Each share is
 * computed from its index and rounded, so a step such as 0.1 does not drift.
 */
export function shareOptions(stepPct: number): number[] {
  const shares: number[] = [];
  for (let index = 0; ; index++) {
    const share = Math.round(index * stepPct * 1e6) / 1e6;
    if (share >= 100) break;
    shares.push(share);
  }
  shares.push(100);
  return shares;
}

function fixedShare(share: number | null): number {
  if (share === null) {
    throw new Error(
      'Extra mileage mode "fixed" needs a share (ScenarioComputeSchema).',
    );
  }
  return share;
}

export function buildProblem(
  scenario: ScenarioCompute,
  candidate: CandidateCompute,
  prices: ResolvedPrices,
): Problem {
  const { iceVehicle, workplaces, extraMileage, parameters } = scenario;
  const comparisonMonths = parameters.comparisonMonths;
  const fb = petrolFactor(prices.petrolEscalationPct, comparisonMonths);
  const fs = electricityFactor(
    prices.electricityEscalationPct,
    comparisonMonths,
  );
  const fm = maintenanceFactor(comparisonMonths);
  const evPerKm = effectiveEvMaintenancePerKm(candidate, parameters);
  const icePerKm = iceVehicle.maintenancePerKm;
  const u = usableShare(parameters);
  const trips = {
    a: tripsCounted(workplaces.a.chargesFreeAtWork),
    b: tripsCounted(workplaces.b.chargesFreeAtWork),
  };

  const months = Array.from({ length: 12 }, (_, month) => {
    const tempC = parameters.monthlyTempC[month] as number;
    const range = roadRanges(
      candidate.rangeKm,
      mixWeight(tempC, parameters.tempColdC, parameters.tempMildC),
      parameters.highwayDiscountPct,
    );
    const checkRange = checkRanges(
      candidate.rangeKm,
      mixWeightCold(
        tempC,
        parameters.coldReserveK,
        parameters.tempColdC,
        parameters.tempMildC,
      ),
      parameters.highwayDiscountPct,
    );
    const c = consumption(candidate.netCapacityKwh, range);
    const wayCosts = (way: Way) => {
      const commute = workplaces[way].commute;
      const km = maintenanceKmPerDay(
        commute.city + commute.rural + commute.highway,
      );
      const grid = gridEnergy(
        wayEnergy(commute, c),
        parameters.chargingEfficiencyPct,
      );
      return {
        // Cost over the comparison period of one working day of this kind,
        // counted once per year; options multiply it by the expected days.
        ev:
          evDayCost(trips[way], grid, prices.electricityPrice) * fs +
          fm * evPerKm * km,
        ice:
          iceDayLitres(commute, iceVehicle.consumptionLPer100Km) *
            prices.petrolPrice *
            fb +
          fm * icePerKm * km,
        evKm: km,
        threshold: sohThreshold(commute, checkRange, trips[way], u),
      };
    };
    return { range, checkRange, c, a: wayCosts('a'), b: wayCosts('b') };
  });

  const thresholds = new Array<number>(24);
  for (const way of WAYS) {
    for (let month = 0; month < 12; month++) {
      thresholds[pairIndex(way, month)] = (months[month] as (typeof months)[0])[
        way
      ].threshold;
    }
  }

  const attendance = attendanceFactors(workplaces, parameters.workWeeksPerYear);
  const groups: Group[] = [];
  const info: GroupInfo[] = [];
  const add = (group: Group, entry: GroupInfo) => {
    groups.push(group);
    info.push(entry);
  };

  for (const weekday of WEEKDAYS) {
    const days = expectedDays(
      weekday,
      workplaces,
      parameters.workWeeksPerYear,
      attendance,
    );
    for (let month = 0; month < 12; month++) {
      const m = months[month] as (typeof months)[0];
      const drive = (
        evWay: Way,
        iceWay: Way | null,
        weight: number,
        choice: string,
      ): Option => ({
        km: weight * m[evWay].evKm,
        cost: weight * (m[evWay].ev + (iceWay ? m[iceWay].ice : 0)),
        needs: pairIndex(evWay, month),
        choice,
      });
      const rest = (iceWay: Way, weight: number): Option => ({
        km: 0,
        cost: weight * m[iceWay].ice,
        needs: null,
        choice: 'rest',
      });
      const states: [PresenceState, number, Option[]][] = [
        [
          'onlyA',
          days.onlyA,
          [drive('a', null, days.onlyA, 'evA'), rest('a', days.onlyA)],
        ],
        [
          'onlyB',
          days.onlyB,
          [drive('b', null, days.onlyB, 'evB'), rest('b', days.onlyB)],
        ],
        [
          'both',
          days.both,
          [
            drive('a', 'b', days.both, 'evA'),
            drive('b', 'a', days.both, 'evB'),
          ],
        ],
      ];
      for (const [state, weight, options] of states) {
        if (weight > 0) {
          add(
            { key: `${weekday}:${month}:${state}`, options },
            { kind: 'day', weekday, month, state, days: weight },
          );
        }
      }
    }
  }

  // Extra mileage: a share of each month's km goes to the EV (spec section 6).
  const extraKm = extraMileage.kmPerMonth;
  if (extraKm.city + extraKm.rural + extraKm.highway > 0) {
    const shares =
      parameters.extraMileageMode === 'fixed'
        ? [fixedShare(parameters.extraMileageFixedEvSharePct)]
        : shareOptions(parameters.extraMileageStepPct);
    for (let month = 0; month < 12; month++) {
      const m = months[month] as (typeof months)[0];
      const options = shares.map((share): Option => {
        const split = splitExtraMileage(extraKm, share);
        const evKm = split.ev.city + split.ev.rural + split.ev.highway;
        const iceKm = split.ice.city + split.ice.rural + split.ice.highway;
        const electricity =
          gridEnergy(
            wayEnergy(split.ev, m.c),
            parameters.chargingEfficiencyPct,
          ) *
          prices.electricityPrice *
          fs;
        const petrol =
          ((split.ice.city * iceVehicle.consumptionLPer100Km.city +
            split.ice.rural * iceVehicle.consumptionLPer100Km.rural +
            split.ice.highway * iceVehicle.consumptionLPer100Km.highway) /
            100) *
          prices.petrolPrice *
          fb;
        return {
          km: evKm,
          cost: electricity + petrol + fm * (evPerKm * evKm + icePerKm * iceKm),
          needs: null,
          choice: `share:${share}`,
        };
      });
      add({ key: `extra:${month}`, options }, { kind: 'extra', month });
    }
  }

  const curve = sohCurve(parameters, candidate);
  const sohForKmPerYear = (kmPerYear: number): number =>
    sohAt(
      curve,
      parameters.sohReference === 'end'
        ? sohKEnd(candidate.mileageKm, kmPerYear, comparisonMonths)
        : candidate.mileageKm,
    );

  const checkWayAt = (way: Way, month: number, soh: number): WayCheck =>
    checkWay({
      distanceKm: workplaces[way].commute,
      checkRangeKm: (months[month] as (typeof months)[0]).checkRange,
      soh,
      u,
      chargesFreeAtWork: workplaces[way].chargesFreeAtWork,
      greenFromPct: parameters.trafficLightGreenFromPct,
    });

  const reserveAtSoh = (soh: number): number => {
    let smallest = Infinity;
    for (const way of WAYS) {
      for (let month = 0; month < 12; month++) {
        smallest = Math.min(smallest, checkWayAt(way, month, soh).reservePct);
      }
    }
    return smallest;
  };

  const solver = createSolver({
    groups,
    thresholds,
    sohForKmPerYear,
    gridKm: parameters.kmGridPerYear,
    cellKm: DP_CELL_KM,
  });

  return {
    groups,
    info,
    solver,
    thresholds,
    sohForKmPerYear,
    reserveAtSoh,
    checkWayAt,
  };
}
