import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, ScenarioSchema } from './schema';

// Migration chain of architecture 8.2: one pure function per version step.
// Nothing here writes to storage. A caller keeps the old record until the
// migrated data has passed the schema check.

/** Pure function `vN -> vN+1`. Must not mutate its input. */
export type MigrationStep = (data: unknown) => unknown;

export const MigrationResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('current'), data: z.unknown() }),
  z.object({ status: z.literal('migrated'), data: z.unknown() }),
  /** Newer than this app: show it, never change or overwrite it. */
  z.object({ status: z.literal('readOnly'), schemaVersion: z.number() }),
  z.object({
    status: z.literal('invalid'),
    reason: z.enum(['unknownVersion', 'missingStep', 'stepFailed']),
  }),
]);
export type MigrationResult = z.infer<typeof MigrationResultSchema>;

/** Steps are keyed by the version they start from: `steps[1]` is v1 to v2. */
export function createMigrator(
  steps: Readonly<Record<number, MigrationStep>>,
  targetVersion: number,
) {
  return function migrate(record: {
    schemaVersion: unknown;
    data: unknown;
  }): MigrationResult {
    const { schemaVersion } = record;
    if (
      typeof schemaVersion !== 'number' ||
      !Number.isInteger(schemaVersion) ||
      schemaVersion < 1
    ) {
      return { status: 'invalid', reason: 'unknownVersion' };
    }
    if (schemaVersion > targetVersion) {
      return { status: 'readOnly', schemaVersion };
    }
    let data = record.data;
    for (let version = schemaVersion; version < targetVersion; version++) {
      const step = steps[version];
      if (!step) return { status: 'invalid', reason: 'missingStep' };
      try {
        data = step(data);
      } catch {
        return { status: 'invalid', reason: 'stepFailed' };
      }
    }
    return {
      status: schemaVersion === targetVersion ? 'current' : 'migrated',
      data,
    };
  };
}

/** No step yet: version 1 is the first schema. */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = {};

export const migrate = createMigrator(MIGRATIONS, CURRENT_SCHEMA_VERSION);

export const UpgradeResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    migrated: z.boolean(),
    scenario: ScenarioSchema,
  }),
  z.object({ status: z.literal('readOnly'), schemaVersion: z.number() }),
  z.object({
    status: z.literal('invalid'),
    reason: z.enum([
      'unknownVersion',
      'missingStep',
      'stepFailed',
      'schemaMismatch',
    ]),
    /** Schema paths of the failures, empty unless `schemaMismatch`. */
    issues: z.array(z.object({ path: z.string(), message: z.string() })),
  }),
]);
export type UpgradeResult = z.infer<typeof UpgradeResultSchema>;

/** Formats a Zod issue path like the spec (architecture 8.3): `candidates[2].price`. */
function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`;
    const key = String(segment);
    return acc === '' ? key : `${acc}.${key}`;
  }, '');
}

/** Migrates a stored or imported scenario record and checks it with the storage schema. */
export function upgradeScenario(record: {
  schemaVersion: unknown;
  data: unknown;
}): UpgradeResult {
  const migration = migrate(record);
  if (migration.status === 'readOnly') return migration;
  if (migration.status === 'invalid') {
    return { status: 'invalid', reason: migration.reason, issues: [] };
  }
  const parsed = ScenarioSchema.safeParse(migration.data);
  if (!parsed.success) {
    return {
      status: 'invalid',
      reason: 'schemaMismatch',
      issues: parsed.error.issues.map((issue) => ({
        path: formatPath(issue.path),
        message: issue.message,
      })),
    };
  }
  return {
    status: 'ok',
    migrated: migration.status === 'migrated',
    scenario: parsed.data,
  };
}
