import { z } from 'zod';
import {
  CURRENT_SCHEMA_VERSION,
  upgradeScenario,
  type Scenario,
  type YearMonth,
} from '../domain';

// Export file and import check of architecture 8.3. Nothing here touches the
// database: parseImport only reads the file, the repository writes the result
// in one transaction (writeImport).

export const EXPORT_FORMAT = 'eauto-export';
/** Largest file the import reads (architecture 8.3, set in S13). */
export const MAX_IMPORT_BYTES = 1024 * 1024;
const IMPORT_SUFFIX = ' (Import)';

export type ImportMode = 'replace' | 'add';

export type ExportFile = { fileName: string; content: string };

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * The export file of 8.3 for the given scenarios. The file name carries the
 * local calendar date, `exportedAt` the exact time in UTC. Device settings are
 * never part of it.
 */
export function buildExport(
  scenarios: readonly Scenario[],
  now: Date,
): ExportFile {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const payload = {
    format: EXPORT_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    scenarios,
  };
  return {
    fileName: `${EXPORT_FORMAT}-${date}-v${CURRENT_SCHEMA_VERSION}.json`,
    content: JSON.stringify(payload, null, 2),
  };
}

export type ImportErrorCode =
  /** Larger than MAX_IMPORT_BYTES; the file was not read. */
  | 'tooLarge'
  | 'invalidJson'
  /** Not an export of this app (`format` is missing or different). */
  | 'wrongFormat'
  /** Written by a newer app; this app cannot read it. */
  | 'newerVersion'
  /** The envelope around the scenarios is broken, see `path`. */
  | 'invalidFile'
  | 'noScenarios'
  /** One scenario fails the migration or the storage schema, see `path`. */
  | 'invalidScenario'
  | 'duplicateId';

export type ImportError = {
  status: 'error';
  code: ImportErrorCode;
  /** Schema path of the first failure, e.g. `scenarios[0].candidates[2].purchasePrice`. */
  path?: string;
  message?: string;
};

export type ParsedImport =
  { status: 'ok'; scenarios: Scenario[] } | ImportError;

const EnvelopeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  scenarios: z.array(z.unknown()),
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const joinPath = (base: string, path: string): string =>
  path === '' ? base : path.startsWith('[') ? base + path : `${base}.${path}`;

const monthOf = (date: Date): YearMonth => ({
  month: date.getMonth() + 1,
  year: date.getFullYear(),
});

/**
 * Reads an export file (6.3, steps 2 and 3): size, `JSON.parse`, format,
 * version, then every scenario through the migration chain and the storage
 * schema. The first failure ends the import with its schema path, so nothing
 * is written. The file is only read as data, never run.
 */
export async function parseImport(
  file: Blob,
  options: { now?: () => Date } = {},
): Promise<ParsedImport> {
  const { now = () => new Date() } = options;
  if (file.size > MAX_IMPORT_BYTES)
    return { status: 'error', code: 'tooLarge' };

  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return { status: 'error', code: 'invalidJson' };
  }
  if (!isObject(json) || json.format !== EXPORT_FORMAT) {
    return { status: 'error', code: 'wrongFormat', path: 'format' };
  }
  if (
    typeof json.schemaVersion === 'number' &&
    json.schemaVersion > CURRENT_SCHEMA_VERSION
  ) {
    return { status: 'error', code: 'newerVersion', path: 'schemaVersion' };
  }
  const envelope = EnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    const [issue] = envelope.error.issues;
    return {
      status: 'error',
      code: 'invalidFile',
      path: issue?.path.join('.'),
      message: issue?.message,
    };
  }
  const { schemaVersion, scenarios: raw } = envelope.data;
  if (raw.length === 0) return { status: 'error', code: 'noScenarios' };

  const context = { migrationMonth: monthOf(now()) };
  const scenarios: Scenario[] = [];
  const ids = new Set<string>();
  for (const [index, data] of raw.entries()) {
    const base = `scenarios[${index}]`;
    const upgrade = upgradeScenario({ schemaVersion, data }, context);
    if (upgrade.status === 'readOnly') {
      return { status: 'error', code: 'newerVersion', path: 'schemaVersion' };
    }
    if (upgrade.status === 'invalid') {
      const [issue] = upgrade.issues;
      return {
        status: 'error',
        code: 'invalidScenario',
        path: joinPath(base, issue?.path ?? ''),
        message: issue?.message ?? upgrade.reason,
      };
    }
    if (ids.has(upgrade.scenario.id)) {
      return { status: 'error', code: 'duplicateId', path: `${base}.id` };
    }
    ids.add(upgrade.scenario.id);
    scenarios.push(upgrade.scenario);
  }
  return { status: 'ok', scenarios };
}

/**
 * Mode "add" (8.3): every scenario gets a new id from `newId`, which src/state
 * supplies, because ids are only made there (8.1). A name that is already
 * taken, by a stored scenario or an earlier one of the same import, gets
 * " (Import)" until it is unique.
 */
export function prepareAddImport(
  scenarios: readonly Scenario[],
  existingNames: Iterable<string>,
  newId: () => string,
): Scenario[] {
  const taken = new Set(existingNames);
  return scenarios.map((scenario) => {
    let name = scenario.name;
    while (taken.has(name)) name += IMPORT_SUFFIX;
    taken.add(name);
    return { ...scenario, id: newId(), name };
  });
}
