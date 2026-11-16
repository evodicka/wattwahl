import { describe, expect, it } from 'vitest';
import { hashResult } from '../../src/core';
import { createCoreEndpoint } from '../../src/worker/endpoint';
import { q1Scenario } from '../fixtures/q1Scenario';

// C2b guard: with a Kilometerreserve of 0 the results are those of the release
// candidate (docs/change-kilometerreserve.md, "Migration"). The Q5 hash of the
// Q1 scenario before the change was this one; the fields C2b adds are removed
// before hashing, everything else must be bit-identical.

const HASH_BEFORE_C2B = '89c6cd5b3b287080';

const ADDED_KEYS = new Set([
  'evOdometerEnd',
  'timeline',
  'belowMinReserve',
  'minReserveKm',
]);

function withoutAddedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAddedFields);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ADDED_KEYS.has(key))
      .map(([key, entry]) => [key, withoutAddedFields(entry)]),
  );
}

describe('C2b: results with a Kilometerreserve of 0', () => {
  it('equal the results before the change, apart from the new fields', async () => {
    const response = await createCoreEndpoint({
      yieldToEventLoop: async () => {},
    }).compute({ generation: 1, scenario: q1Scenario() });
    if (response.status !== 'done') throw new Error('superseded');
    expect(hashResult(withoutAddedFields(response.results))).toBe(
      HASH_BEFORE_C2B,
    );
  }, 60_000);
});
