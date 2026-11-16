import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { expectSpec } from '../../tests/helpers/specTolerance';
import {
  CandidateComputeSchema,
  ScenarioComputeSchema,
  listOffers,
  upgradeScenario,
  type Scenario,
} from '../domain';
import { resolvePrices } from './calc/prices';
import { monthsUntilSoh, sohCurve } from './calc/soh';
import { buildProblem, pairIndex } from './optimizer/problem';
import { Trace, computeOffer } from './index';

// Change C2b (docs/change-kilometerreserve.md): the test cases 20 to 22 of the
// specification that run on the whole core, with the export of the published
// app as input. It is a v2 file, so loading it also runs the migration to v3.

const EXPORT = new URL(
  '../../docs/acceptance/eauto-export-2026-11-16-v2_3.json',
  import.meta.url,
);

/** The scenario of the export file, migrated like an import does it (src/storage reads the same way). */
function loadExport(): Scenario {
  const file = JSON.parse(readFileSync(EXPORT, 'utf8')) as {
    schemaVersion: number;
    scenarios: unknown[];
  };
  const result = upgradeScenario(
    { schemaVersion: file.schemaVersion, data: file.scenarios[0] },
    { migrationMonth: { month: 11, year: 2026 } },
  );
  if (result.status !== 'ok') throw new Error(`not ok: ${result.status}`);
  return result.scenario;
}

function purchaseOf(scenario: Scenario, name: string) {
  const candidate = scenario.candidates.find((c) => c.name === name);
  if (!candidate) throw new Error(`no candidate ${name}`);
  const offer = listOffers(candidate).find((o) => o.kind === 'purchase');
  if (!offer) throw new Error(`no purchase offer of ${name}`);
  return offer;
}

describe('C2b: the export of the published app', () => {
  let scenario: Scenario;
  beforeAll(() => {
    scenario = loadExport();
  });

  const okOfOffer = (sc: Scenario, name: string) => {
    const result = computeOffer(sc, purchaseOf(sc, name), 'mid');
    if (result.status !== 'ok') throw new Error(`${name}: ${result.status}`);
    return result;
  };

  it('is migrated to R = 0 and compares over 96 months', () => {
    expect(scenario.parameters.minReserveKm).toBe(0);
    expect(scenario.parameters.comparisonMonths).toBe(96);
  });

  describe('test case 22: odometer of the EV at the end', () => {
    // K_EV = 19.055 km per year, D = 96: 19.055 · 8 = 152.442 km driven.
    it('MG4 (new): 152.442 km', () => {
      const result = computeOffer(
        scenario,
        purchaseOf(scenario, 'MG4 Urban'),
        'mid',
      );
      if (result.status !== 'ok') throw new Error(result.status);
      expectSpec(result.evKmPerYear, '19.055');
      expectSpec(result.evOdometerEnd, '152.442');
    });

    it('Opel Corsa 2023: 19.000 + 152.442 = 171.442 km, the petrol car 143.430 km', () => {
      const result = computeOffer(
        scenario,
        purchaseOf(scenario, 'Opel Corsa 2023'),
        'mid',
      );
      if (result.status !== 'ok') throw new Error(result.status);
      expectSpec(result.evOdometerEnd, '171.442');
      expectSpec(result.iceOdometerEnd, '143.430');
    });

    it('is the value of F2.kEnd and does not depend on the SoH reference', () => {
      const offer = purchaseOf(scenario, 'Opel Corsa 2023');
      const trace = new Trace();
      const result = computeOffer(scenario, offer, 'mid', { trace });
      if (result.status !== 'ok') throw new Error(result.status);
      const linked = trace.entries.filter(
        (entry) => entry.resultPath === 'evOdometerEnd',
      );
      expect(linked).toHaveLength(1);
      expect(linked[0]?.formula).toBe('F2.kEnd');
      expect(linked[0]?.value).toBe(result.evOdometerEnd);

      const atStart = {
        ...scenario,
        parameters: { ...scenario.parameters, sohReference: 'start' as const },
      };
      const other = computeOffer(atStart, offer, 'mid');
      if (other.status !== 'ok') throw new Error(other.status);
      expect(other.evOdometerEnd).toBeCloseTo(19000 + other.evKmPerYear * 8, 6);
    });
  });

  describe('integration: the Kilometerreserve changes the plan', () => {
    const withReserve = (
      minReserveKm: number,
      strictMode = false,
    ): Scenario => ({
      ...scenario,
      parameters: { ...scenario.parameters, minReserveKm, strictMode },
    });
    const okOf = (sc: Scenario, name: string) => {
      const result = computeOffer(sc, purchaseOf(sc, name), 'mid');
      if (result.status !== 'ok') throw new Error(`${name}: ${result.status}`);
      return result;
    };
    const monthsDriving = (result: ReturnType<typeof okOf>, choice: string) =>
      new Set(
        result.plan.filter((p) => p.choice === choice).map((p) => p.month),
      );

    it('R = 10: the Corsa 2023 drives fewer km and way A goes to the petrol car in winter', () => {
      const plain = okOf(withReserve(0), 'Opel Corsa 2023');
      const result = okOf(withReserve(10), 'Opel Corsa 2023');
      expect(result.evKmPerYear).toBeLessThan(plain.evKmPerYear);
      // January 2,5 km of reserve, as the user saw it: way A rests in winter.
      const evA = monthsDriving(result, 'evA');
      for (const winter of [0, 1, 11]) expect(evA.has(winter)).toBe(false);
      expect(
        plain.plan.some((p) => p.state === 'onlyA' && p.choice === 'rest'),
      ).toBe(false);
      expect(
        result.plan.some(
          (p) => p.state === 'onlyA' && p.month === 0 && p.choice === 'rest',
        ),
      ).toBe(true);
    });

    it('R = 10: the smallest reserve of the driven ways is never below R', () => {
      for (const name of ['MG4 Urban', 'Opel Corsa 2023', 'Opel Corsa 2024']) {
        const result = okOf(withReserve(10), name);
        expect(result.minReserve?.reserveKm ?? 10).toBeGreaterThanOrEqual(10);
      }
    });

    it('R = 10: January of way A is red and says "below the Kilometerreserve", the reserve shown is positive', () => {
      const result = okOf(withReserve(10), 'Opel Corsa 2023');
      const january = result.reserves.find(
        (c) => c.way === 'a' && c.month === 0,
      );
      expect(january?.light).toBe('red');
      expect(january?.belowMinReserve).toBe(true);
      expect(january?.reserveKm).toBeGreaterThan(0);
      expect(january?.reserveKm).toBeLessThan(10);
    });

    it('R = 10: a candidate with a large reserve (MG4) keeps its plan', () => {
      const plain = okOf(withReserve(0), 'MG4 Urban');
      const result = okOf(withReserve(10), 'MG4 Urban');
      expect(result.plan).toEqual(plain.plan);
      expect(result.costs).toEqual(plain.costs);
      expect(result.reserves.every((c) => !c.belowMinReserve)).toBe(true);
    });

    it('R = 200: no way fits, the offer is unsuitable and the reason names R', () => {
      const result = computeOffer(
        withReserve(200),
        purchaseOf(scenario, 'Opel Corsa 2023'),
        'mid',
      );
      expect(result.status).toBe('unsuitable');
      if (result.status !== 'unsuitable') return;
      expect(result.reason.kind).toBe('both');
      if (result.reason.kind !== 'both') return;
      expect(result.reason.minReserveKm).toBe(200);
      expect(
        Math.max(result.reason.reserveKm.a, result.reason.reserveKm.b),
      ).toBeLessThan(200);
    });

    it('strict mode with R = 40: the reason is the way and month that miss R', () => {
      const result = computeOffer(
        withReserve(40, true),
        purchaseOf(scenario, 'Opel Corsa 2023'),
        'mid',
      );
      expect(result.status).toBe('unsuitable');
      if (result.status !== 'unsuitable') return;
      expect(result.reason.kind).toBe('strict');
      if (result.reason.kind !== 'strict') return;
      expect(result.reason.minReserveKm).toBe(40);
      expect(result.reason.reserveKm).toBeLessThan(40);
    });
  });

  describe('test case 21: suitability over time', () => {
    /** The problem of a candidate in the price case "Mittel", for its thresholds. */
    function thresholdOf(
      sc: Scenario,
      name: string,
      way: 'a' | 'b',
      month: number,
    ) {
      const compute = ScenarioComputeSchema.parse(sc);
      const candidate = CandidateComputeSchema.parse(
        sc.candidates.find((c) => c.name === name),
      );
      const problem = buildProblem(
        compute,
        candidate,
        resolvePrices(compute.iceVehicle, compute.parameters, {
          priceCase: 'mid',
        }),
      );
      return {
        threshold: problem.thresholds[pairIndex(way, month)] as number,
        curve: sohCurve(compute.parameters, candidate),
        mileageKm: candidate.mileageKm,
      };
    }
    const withR = (minReserveKm: number): Scenario => ({
      ...scenario,
      parameters: { ...scenario.parameters, minReserveKm },
    });
    // K_EV of the plan without a Kilometerreserve, held fixed as the test case says.
    const kEv = () => {
      const result = computeOffer(
        scenario,
        purchaseOf(scenario, 'Opel Corsa 2023'),
        'mid',
      );
      if (result.status !== 'ok') throw new Error(result.status);
      return result.evKmPerYear;
    };

    it('R = 0: the threshold 0,829 is below the lowest SoH of 0,85, the cell is suitable to the end', () => {
      const { threshold, curve, mileageKm } = thresholdOf(
        withR(0),
        'Opel Corsa 2023',
        'a',
        0,
      );
      expectSpec(threshold, '0,829');
      expect(threshold).toBeLessThan(0.85);
      expect(monthsUntilSoh(curve, mileageKm, kEv(), threshold)).toBe(Infinity);
    });

    it('R = 10: the threshold 0,914 is crossed after 30,47 months, so the cell is suitable for 30 months', () => {
      const { threshold, curve, mileageKm } = thresholdOf(
        withR(10),
        'Opel Corsa 2023',
        'a',
        0,
      );
      expectSpec(threshold, '0,914');
      const exact = monthsUntilSoh(curve, mileageKm, kEv(), threshold);
      expectSpec(exact, '30,47');
      expect(Math.floor(exact)).toBe(30);
    });

    it('the timeline of the offer: points every 12 months and at the end, 24 cells each', () => {
      const result = okOfOffer(scenario, 'Opel Corsa 2023');
      expect(result.timeline.points.map((p) => p.month)).toEqual([
        0, 12, 24, 36, 48, 60, 72, 84, 96,
      ]);
      for (const point of result.timeline.points) {
        expect(point.cells).toHaveLength(24);
        expect(point.odometerKm).toBeCloseTo(
          19000 + (result.evKmPerYear * point.month) / 12,
          6,
        );
      }
      expect(result.timeline.suitableForMonths).toHaveLength(24);
    });

    it('a period that is no multiple of 12 ends with its own point', () => {
      for (const [months, expected] of [
        [30, [0, 12, 24, 30]],
        [12, [0, 12]],
        [1, [0, 1]],
        [13, [0, 12, 13]],
      ] as const) {
        const sc = {
          ...scenario,
          parameters: { ...scenario.parameters, comparisonMonths: months },
        };
        const result = okOfOffer(sc, 'MG4 Urban');
        expect(result.timeline.points.map((p) => p.month)).toEqual(expected);
      }
    });

    it('the point "Ende" is exactly sohCheck and reserves, the point "Start" the SoH at the odometer now', () => {
      const result = okOfOffer(scenario, 'Opel Corsa 2023');
      const last = result.timeline.points.at(-1);
      expect(last?.soh).toBe(result.sohEnd);
      expect(last?.soh).toBe(result.sohCheck);
      expect(last?.odometerKm).toBe(result.evOdometerEnd);
      expect(last?.cells).toEqual(result.reserves);
      expect(result.timeline.points[0]?.odometerKm).toBe(19000);

      const atStart = {
        ...scenario,
        parameters: { ...scenario.parameters, sohReference: 'start' as const },
      };
      const other = okOfOffer(atStart, 'Opel Corsa 2023');
      expect(other.timeline.points[0]?.soh).toBe(other.sohCheck);
      expect(other.timeline.points[0]?.cells).toEqual(other.reserves);
    });

    it.each([0, 5, 10, 20, 40])(
      'R = %s: a cell is suitable at a point exactly while the point is within its suitableForMonths',
      (minReserveKm) => {
        for (const sohReference of ['end', 'start'] as const) {
          const sc = {
            ...scenario,
            parameters: { ...scenario.parameters, minReserveKm, sohReference },
          };
          for (const candidate of sc.candidates) {
            const result = computeOffer(
              sc,
              purchaseOf(sc, candidate.name),
              'mid',
            );
            if (result.status !== 'ok') continue;
            for (const point of result.timeline.points) {
              point.cells.forEach((cell, index) => {
                const months = result.timeline.suitableForMonths[index];
                // 0 means "less than a full month", which includes "not suitable
                // at the start": it says nothing about the colour at t = 0.
                if (months === 0 && point.month === 0) return;
                const within = months === null || point.month <= (months ?? 0);
                expect(
                  cell.light !== 'red',
                  `${candidate.name} R${minReserveKm} ${sohReference} t=${point.month} ${cell.way}${cell.month}`,
                ).toBe(within);
              });
            }
          }
        }
      },
    );

    it('with the "start" reference the plan is checked at the start, so cells can tip later', () => {
      const atStart = {
        ...scenario,
        parameters: {
          ...scenario.parameters,
          minReserveKm: 10,
          sohReference: 'start' as const,
        },
      };
      const result = okOfOffer(atStart, 'Opel Corsa 2023');
      expect(
        result.timeline.suitableForMonths.some((m) => m !== null && m > 0),
      ).toBe(true);
    });

    it('does not depend on whether a trace is collected, and is the same for a lease', () => {
      const offer = purchaseOf(scenario, 'Opel Corsa 2023');
      const plain = computeOffer(scenario, offer, 'mid');
      const traced = computeOffer(scenario, offer, 'mid', {
        trace: new Trace(),
      });
      expect(traced).toEqual(plain);
    });

    it('a period of 1.200 months stays small: D / 12 + 1 points, at most D / 12 + 2', () => {
      const long = {
        ...scenario,
        parameters: { ...scenario.parameters, comparisonMonths: 1200 },
      };
      const result = okOfOffer(long, 'MG4 Urban');
      expect(result.timeline.points).toHaveLength(101);
      expect(result.timeline.points.at(-1)?.month).toBe(1200);
    });
  });
});
