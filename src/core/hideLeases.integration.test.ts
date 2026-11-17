import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadExportScenario } from '../../tests/helpers/exportScenario';
import {
  listOffers,
  listScenarioOffers,
  upgradeScenario,
  type OfferResult,
  type Scenario,
} from '../domain';
import { ComputeCache, computeOffer, hashResult } from './index';

// Change C4b (docs/change-leasing-ausblenden.md): test case 27 on the export
// of the published app, and the migration v4 -> v5 keeping every result.

type Results = Record<string, OfferResult>;

function resultsOf(
  scenario: Scenario,
  offersOf: typeof listOffers | typeof listScenarioOffers,
): Results {
  const cache = new ComputeCache();
  const results: Results = {};
  for (const candidate of scenario.candidates) {
    const offers =
      offersOf === listOffers
        ? listOffers(candidate)
        : listScenarioOffers(scenario, candidate);
    for (const offer of offers) {
      results[offer.offerId] = computeOffer(scenario, offer, 'mid', { cache });
    }
  }
  return results;
}

describe('C4b: test case 27, lease offers hidden (export of the published app)', () => {
  const shown = loadExportScenario();
  const hidden: Scenario = { ...shown, includeLeaseOffers: false };

  it('has only purchase offers, and each equals its result with the leases shown', () => {
    expect(shown.includeLeaseOffers).toBe(true);
    expect(
      shown.candidates.some((candidate) => candidate.leaseTiers.length > 0),
    ).toBe(true);
    const all = resultsOf(shown, listScenarioOffers);
    const purchases = resultsOf(hidden, listScenarioOffers);
    expect(Object.keys(purchases)).toHaveLength(shown.candidates.length);
    expect(Object.keys(purchases).some((id) => id.includes(':lease:'))).toBe(
      false,
    );
    for (const [offerId, result] of Object.entries(purchases)) {
      expect(result).toEqual(all[offerId]);
    }
  });
});

describe('C4b: migration v4 -> v5 keeps every result and the hash', () => {
  it('the migrated v4 example computes the same offers as before the change', () => {
    const record = JSON.parse(
      readFileSync('src/domain/__fixtures__/scenario.v4.json', 'utf8'),
    ) as { schemaVersion: number; data: unknown };
    const upgraded = upgradeScenario(record, {
      migrationMonth: { month: 11, year: 2026 },
    });
    if (upgraded.status !== 'ok') throw new Error(`not ok: ${upgraded.status}`);
    const scenario = upgraded.scenario;
    expect(scenario.includeLeaseOffers).toBe(true);
    // The offers before the change: every offer of every candidate.
    const before = resultsOf(scenario, listOffers);
    const after = resultsOf(scenario, listScenarioOffers);
    expect(Object.keys(before).some((id) => id.includes(':lease:'))).toBe(true);
    expect(hashResult(after)).toBe(hashResult(before));
  });
});
