import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { expectSpec } from '../../tests/helpers/specTolerance';
import { listOffers, upgradeScenario, type Scenario } from '../domain';
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
});
