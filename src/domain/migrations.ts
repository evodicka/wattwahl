import { z } from 'zod';
import {
  CURRENT_SCHEMA_VERSION,
  ScenarioSchema,
  YearMonthSchema,
  ageInMonths,
  type YearMonth,
} from './schema';

// Migration chain of architecture 8.2: one pure function per version step.
// Nothing here writes to storage. A caller keeps the old record until the
// migrated data has passed the schema check.

/**
 * What a step may need besides the data. `migrationMonth` is the current
 * month, passed in by src/storage on load and import: the domain reads no
 * clock (ADR-17).
 */
export const MigrationContextSchema = z.object({
  migrationMonth: YearMonthSchema,
});
export type MigrationContext = z.infer<typeof MigrationContextSchema>;

/** Pure function `vN -> vN+1`. Must not mutate its input. */
export type MigrationStep = (
  data: unknown,
  context: MigrationContext,
) => unknown;

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
  return function migrate(
    record: {
      schemaVersion: unknown;
      data: unknown;
    },
    context: MigrationContext,
  ): MigrationResult {
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
        data = step(data, context);
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

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * One used candidate of v1: its warranty fields held the remaining warranty,
 * in v2 they hold the normal one. Years go back by the age at the migration
 * month, km by the mileage, so the core derives the old remaining warranty
 * again. Without first registration or mileage nothing can be turned back:
 * all values stay as they are. Empty warranty fields stay empty. Either way
 * the candidate is flagged "Garantiewerte prüfen".
 */
function usedCandidateV1ToV2(candidate: Json, migrationMonth: YearMonth): Json {
  const registration = YearMonthSchema.safeParse(candidate.firstRegistration);
  const mileage = candidate.mileageKm;
  if (!registration.success || !isNumber(mileage)) {
    return { ...candidate, warrantyNeedsReview: true };
  }
  const ageYears = ageInMonths(registration.data, migrationMonth) / 12;
  let needsReview = false;
  const convert = (warranty: unknown): unknown => {
    if (!isObject(warranty)) {
      needsReview = true;
      return warranty;
    }
    const { years, km } = warranty;
    if (!isNumber(years) || !isNumber(km)) needsReview = true;
    return {
      ...warranty,
      years: isNumber(years) ? years + ageYears : years,
      km: isNumber(km) ? km + mileage : km,
    };
  };
  const vehicleWarranty = convert(candidate.vehicleWarranty);
  const batteryWarranty = convert(candidate.batteryWarranty);
  return {
    ...candidate,
    vehicleWarranty,
    batteryWarranty,
    warrantyNeedsReview: needsReview,
  };
}

/**
 * v1 -> v2, warranty from first registration (docs/change-garantie.md): every
 * scenario gets the migration month as warranty reference month, not set by
 * the user; used candidates get their normal warranty back. Data without the
 * v1 shape passes through untouched, the schema check reports it.
 */
export function v1ToV2(data: unknown, context: MigrationContext): unknown {
  if (
    !isObject(data) ||
    !isObject(data.parameters) ||
    !Array.isArray(data.candidates)
  ) {
    return data;
  }
  const { migrationMonth } = context;
  return {
    ...data,
    parameters: {
      ...data.parameters,
      warrantyReferenceMonth: { ...migrationMonth },
      warrantyReferenceMonthSetByUser: false,
    },
    candidates: data.candidates.map((candidate: unknown) => {
      if (!isObject(candidate)) return candidate;
      if (candidate.condition === 'used') {
        return usedCandidateV1ToV2(candidate, migrationMonth);
      }
      return { ...candidate, warrantyNeedsReview: false };
    }),
  };
}

/** Steps keyed by the version they start from. */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = {
  1: v1ToV2,
};

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
export function upgradeScenario(
  record: {
    schemaVersion: unknown;
    data: unknown;
  },
  context: MigrationContext,
): UpgradeResult {
  const migration = migrate(record, context);
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
