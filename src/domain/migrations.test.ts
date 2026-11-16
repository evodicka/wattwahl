import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, ScenarioSchema } from './schema';
import { createMigrator, migrate, upgradeScenario, v2ToV3 } from './migrations';

/** Month of the migration, as src/storage would pass it. */
const CONTEXT = { migrationMonth: { month: 11, year: 2026 } };

const fixtureDir = fileURLToPath(new URL('./__fixtures__', import.meta.url));
const fixtureVersion = (name: string): number | undefined => {
  const match = /^scenario\.v(\d+)\.json$/.exec(name);
  return match?.[1] ? Number(match[1]) : undefined;
};
const fixtureFiles = readdirSync(fixtureDir)
  .filter((name) => fixtureVersion(name) !== undefined)
  .sort((a, b) => (fixtureVersion(a) ?? 0) - (fixtureVersion(b) ?? 0));

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
    const versions = fixtureFiles.map(fixtureVersion);
    expect(versions).toEqual(
      Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, i) => i + 1),
    );
  });

  it.each(fixtureFiles)(
    '%s runs through the chain and passes the storage schema',
    (name) => {
      const record = readFixture(name);
      const result = upgradeScenario(deepFreeze(record), CONTEXT);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.migrated).toBe(
          record.schemaVersion < CURRENT_SCHEMA_VERSION,
        );
      }
    },
  );

  it.each(fixtureFiles)('%s is already schema-canonical', (name) => {
    const record = readFixture(name);
    if (record.schemaVersion !== CURRENT_SCHEMA_VERSION) return;
    expect(ScenarioSchema.parse(record.data)).toEqual(record.data);
  });
});

describe('S05: newer schema version', () => {
  it('is recognized as read-only and left untouched', () => {
    const record = {
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      data: { fieldFromTheFuture: [1, 2, 3] },
    };
    const snapshot = structuredClone(record);
    expect(migrate(deepFreeze(record), CONTEXT)).toEqual({
      status: 'readOnly',
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    });
    expect(upgradeScenario(record, CONTEXT)).toEqual({
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
    expect(migrator(input, CONTEXT)).toEqual({
      status: 'migrated',
      data: { original: 1, addedInV2: true, addedInV3: true },
    });
    expect(calls).toEqual(['v1->v2', 'v2->v3']);
  });

  it('starts at the stored version', () => {
    calls.length = 0;
    migrator({ schemaVersion: 2, data: {} }, CONTEXT);
    expect(calls).toEqual(['v2->v3']);
  });

  it('returns current data as it is', () => {
    const data = { current: true };
    const result = migrator({ schemaVersion: 3, data }, CONTEXT);
    expect(result).toEqual({ status: 'current', data });
  });

  it('reports a missing step as invalid', () => {
    const gap = createMigrator({ 2: (data) => data }, 3);
    expect(gap({ schemaVersion: 1, data: {} }, CONTEXT)).toEqual({
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
    expect(broken(record, CONTEXT)).toEqual({
      status: 'invalid',
      reason: 'stepFailed',
    });
    expect(record.data).toEqual({ keep: 'me' });
  });

  it.each([0, -1, 1.5, '1', null, undefined, Number.NaN])(
    'rejects the version %s',
    (schemaVersion) => {
      expect(migrator({ schemaVersion, data: {} }, CONTEXT)).toEqual({
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
    const result = upgradeScenario(record, CONTEXT);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.reason).toBe('schemaMismatch');
      expect(result.issues.map((i) => i.path)).toEqual([
        'candidates[0].purchasePrice',
      ]);
    }
  });

  it('reports garbage as a schema mismatch, not as a crash', () => {
    for (const data of [null, 42, 'text', [], {}]) {
      const result = upgradeScenario({ schemaVersion: 1, data }, CONTEXT);
      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.reason).toBe('schemaMismatch');
      }
    }
  });
});

type V1Candidate = {
  condition: 'new' | 'used';
  firstRegistration: { month: number; year: number } | null;
  mileageKm: number | null;
  vehicleWarranty: { years: number | null; km: number | null };
  batteryWarranty: { years: number | null; km: number | null };
};

describe('C1b: migration v1 -> v2 (warranty from first registration)', () => {
  const v1 = () => readFixture('scenario.v1.json');
  const candidatesOf = (data: unknown) =>
    (data as { candidates: V1Candidate[] }).candidates;
  const upgraded = (record: { schemaVersion: number; data: unknown }) => {
    const result = upgradeScenario(deepFreeze(record), CONTEXT);
    if (result.status !== 'ok') throw new Error(`not ok: ${result.status}`);
    return result.scenario;
  };

  it('C1b: every scenario gets the month of the migration as reference month, not set by the user', () => {
    const scenario = upgraded(v1());
    expect(scenario.parameters.warrantyReferenceMonth).toEqual({
      month: 11,
      year: 2026,
    });
    expect(scenario.parameters.warrantyReferenceMonthSetByUser).toBe(false);
  });

  it('C1b: the v1 example migrated in 11/2026 is the current example file (a = 44 months)', () => {
    const scenario = upgraded(v1());
    const candidate = scenario.candidates[0];
    expect(candidate?.vehicleWarranty).toEqual({
      years: 0 + 44 / 12,
      km: 0 + 80000,
    });
    expect(candidate?.batteryWarranty).toEqual({
      years: 3 + 44 / 12,
      km: 60000 + 80000,
    });
    expect(candidate?.warrantyNeedsReview).toBe(false);
    const { data, schemaVersion } = readFixture('scenario.v3.json');
    expect(schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(scenario).toEqual({
      ...(data as object),
      name: 'Example v1',
      candidates: [
        {
          ...candidatesOf(data)[0],
          note: 'Used for the migration tests',
        },
      ],
    });
  });

  it('C1b: a new car keeps its warranty values', () => {
    const record = v1();
    const [candidate] = candidatesOf(record.data);
    if (!candidate) throw new Error('fixture has no candidate');
    candidate.condition = 'new';
    candidate.firstRegistration = null;
    candidate.mileageKm = 0;
    const migrated = upgraded(record).candidates[0];
    expect(migrated?.vehicleWarranty).toEqual({ years: 0, km: 0 });
    expect(migrated?.batteryWarranty).toEqual({ years: 3, km: 60000 });
    expect(migrated?.warrantyNeedsReview).toBe(false);
  });

  it('C1b: a used car without first registration keeps all its values and is flagged "Garantiewerte prüfen"', () => {
    const record = v1();
    const [candidate] = candidatesOf(record.data);
    if (!candidate) throw new Error('fixture has no candidate');
    candidate.firstRegistration = null;
    const migrated = upgraded(record).candidates[0];
    expect(migrated?.vehicleWarranty).toEqual({ years: 0, km: 0 });
    expect(migrated?.batteryWarranty).toEqual({ years: 3, km: 60000 });
    expect(migrated?.warrantyNeedsReview).toBe(true);
  });

  it('C1b: a used car with empty mileage keeps all its values and is flagged', () => {
    const record = v1();
    const [candidate] = candidatesOf(record.data);
    if (!candidate) throw new Error('fixture has no candidate');
    candidate.mileageKm = null;
    const migrated = upgraded(record).candidates[0];
    expect(migrated?.vehicleWarranty).toEqual({ years: 0, km: 0 });
    expect(migrated?.batteryWarranty).toEqual({ years: 3, km: 60000 });
    expect(migrated?.warrantyNeedsReview).toBe(true);
  });

  it('C1b: an empty warranty field stays empty, the others are turned back, the candidate is flagged', () => {
    const record = v1();
    const [candidate] = candidatesOf(record.data);
    if (!candidate) throw new Error('fixture has no candidate');
    candidate.batteryWarranty = { years: null, km: 60000 };
    const migrated = upgraded(record).candidates[0];
    expect(migrated?.vehicleWarranty).toEqual({ years: 44 / 12, km: 80000 });
    expect(migrated?.batteryWarranty).toEqual({ years: null, km: 140000 });
    expect(migrated?.warrantyNeedsReview).toBe(true);
  });

  it('C1b: a first registration after the month of the migration counts as age 0', () => {
    const record = v1();
    const [candidate] = candidatesOf(record.data);
    if (!candidate) throw new Error('fixture has no candidate');
    candidate.firstRegistration = { month: 1, year: 2027 };
    const migrated = upgraded(record).candidates[0];
    expect(migrated?.batteryWarranty).toEqual({ years: 3, km: 140000 });
  });

  it('C1b: the step does not change its input', () => {
    const record = v1();
    const snapshot = structuredClone(record);
    upgradeScenario(record, CONTEXT);
    expect(record).toEqual(snapshot);
  });
});

describe('C2b: migration v2 -> v3 (Kilometerreserve)', () => {
  const v2 = () => readFixture('scenario.v2.json');

  it('C2b: the v2 example migrates to exactly the v3 example file', () => {
    const result = upgradeScenario(deepFreeze(v2()), CONTEXT);
    if (result.status !== 'ok') throw new Error(`not ok: ${result.status}`);
    expect(result.migrated).toBe(true);
    expect(result.scenario).toEqual(readFixture('scenario.v3.json').data);
  });

  it('C2b: it sets minReserveKm = 0 and changes nothing else', () => {
    const { data } = v2();
    const migrated = v2ToV3(data) as {
      parameters: Record<string, unknown>;
    };
    const { minReserveKm, ...rest } = migrated.parameters;
    expect(minReserveKm).toBe(0);
    expect(rest).toEqual((data as { parameters: object }).parameters);
  });

  it('C2b: the step does not change its input', () => {
    const { data } = v2();
    const snapshot = structuredClone(data);
    v2ToV3(deepFreeze(data));
    expect(data).toEqual(snapshot);
  });

  it('C2b: data without the v2 shape passes through untouched', () => {
    expect(v2ToV3('nothing')).toBe('nothing');
    expect(v2ToV3({ parameters: 3 })).toEqual({ parameters: 3 });
  });
});
