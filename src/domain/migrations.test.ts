import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from './schema';
import { createMigrator, migrate, upgradeScenario } from './migrations';

const fixtureDir = join(process.cwd(), 'src/domain/__fixtures__');
const fixtureFiles = readdirSync(fixtureDir)
  .filter((name) => /^scenario\.v\d+\.json$/.test(name))
  .sort();

function readFixture(name: string): { schemaVersion: number; data: unknown } {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('S05: example file per schema version', () => {
  it('has exactly one example file for each version 1 to current', () => {
    const versions = fixtureFiles.map((name) =>
      Number(/\d+/.exec(name.replace('scenario.', ''))?.[0]),
    );
    expect(versions).toEqual(
      Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, i) => i + 1),
    );
  });

  it.each(fixtureFiles)(
    '%s runs through the chain and passes the storage schema',
    (name) => {
      const record = readFixture(name);
      const result = upgradeScenario(deepFreeze(record));
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.migrated).toBe(
          record.schemaVersion < CURRENT_SCHEMA_VERSION,
        );
      }
    },
  );

  it('keeps the data of the v1 file unchanged by the current chain', () => {
    const record = readFixture('scenario.v1.json');
    const result = upgradeScenario(record);
    expect(result.status === 'ok' && result.scenario).toEqual(record.data);
  });
});

describe('S05: newer schema version', () => {
  it('is recognized as read-only and left untouched', () => {
    const record = {
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      data: { fieldFromTheFuture: [1, 2, 3] },
    };
    const snapshot = structuredClone(record);
    expect(migrate(deepFreeze(record))).toEqual({
      status: 'readOnly',
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    });
    expect(upgradeScenario(record)).toEqual({
      status: 'readOnly',
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    });
    expect(record).toEqual(snapshot);
  });
});

describe('S05: migration chain', () => {
  const calls: string[] = [];
  const migrator = createMigrator(
    {
      1: (data) => {
        calls.push('v1->v2');
        return { ...(data as object), addedInV2: true };
      },
      2: (data) => {
        calls.push('v2->v3');
        return { ...(data as object), addedInV3: true };
      },
    },
    3,
  );

  it('S05: test chain v1 -> v2 -> v3 applies the steps in order', () => {
    calls.length = 0;
    const input = deepFreeze({ schemaVersion: 1, data: { original: 1 } });
    expect(migrator(input)).toEqual({
      status: 'migrated',
      data: { original: 1, addedInV2: true, addedInV3: true },
    });
    expect(calls).toEqual(['v1->v2', 'v2->v3']);
  });

  it('starts at the stored version', () => {
    calls.length = 0;
    migrator({ schemaVersion: 2, data: {} });
    expect(calls).toEqual(['v2->v3']);
  });

  it('returns current data as it is', () => {
    const data = { current: true };
    const result = migrator({ schemaVersion: 3, data });
    expect(result).toEqual({ status: 'current', data });
  });

  it('reports a missing step as invalid', () => {
    const gap = createMigrator({ 2: (data) => data }, 3);
    expect(gap({ schemaVersion: 1, data: {} })).toEqual({
      status: 'invalid',
      reason: 'missingStep',
    });
  });

  it('reports a throwing step as invalid and keeps the old record', () => {
    const broken = createMigrator(
      {
        1: () => {
          throw new Error('boom');
        },
      },
      2,
    );
    const record = deepFreeze({ schemaVersion: 1, data: { keep: 'me' } });
    expect(broken(record)).toEqual({ status: 'invalid', reason: 'stepFailed' });
    expect(record.data).toEqual({ keep: 'me' });
  });

  it.each([0, -1, 1.5, '1', null, undefined, Number.NaN])(
    'rejects the version %s',
    (schemaVersion) => {
      expect(migrator({ schemaVersion, data: {} })).toEqual({
        status: 'invalid',
        reason: 'unknownVersion',
      });
    },
  );
});

describe('S05: upgradeScenario reports schema failures with paths', () => {
  it('names the field of a bad value', () => {
    const record = readFixture('scenario.v1.json');
    const data = record.data as {
      candidates: { purchasePrice: number }[];
    };
    const candidate = data.candidates[0];
    if (!candidate) throw new Error('fixture has no candidate');
    candidate.purchasePrice = -5;
    const result = upgradeScenario(record);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.reason).toBe('schemaMismatch');
      expect(result.issues.map((i) => i.path)).toEqual([
        'candidates.0.purchasePrice',
      ]);
    }
  });

  it('reports garbage as a schema mismatch, not as a crash', () => {
    for (const data of [null, 42, 'text', [], {}]) {
      const result = upgradeScenario({ schemaVersion: 1, data });
      expect(result.status).toBe('invalid');
    }
  });
});
