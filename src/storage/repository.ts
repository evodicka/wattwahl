import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DEVICE_SETTINGS,
  DeviceSettingsSchema,
  upgradeScenario,
  type DeviceSettings,
  type Scenario,
  type UpgradeResult,
  type YearMonth,
} from '../domain';
import { buildExport, type ExportFile, type ImportMode } from './exportImport';

// The only place that opens the database (architecture 8.2, enforced by lint).
// Writes never throw for the cases the app has to show: a full storage, a
// record of a newer app and a connection closed for a newer tab come back as a
// status, so the state in memory stays as it is (8.10).

export const DB_NAME = 'eauto';
const SETTINGS_KEY = 'device';

/** One scenario as stored: the data keeps the schema version it was written with. */
export type StoredScenario = {
  id: string;
  schemaVersion: number;
  updatedAt: string;
  data: unknown;
};

interface EautoDB extends DBSchema {
  scenarios: { key: string; value: StoredScenario };
  settings: { key: string; value: unknown };
}

export type WriteResult =
  | { status: 'ok' }
  /** A newer app owns the record or the database: nothing was written. */
  | { status: 'readOnly' }
  /** `QuotaExceededError`: nothing was written, ask for an export (8.10). */
  | { status: 'quotaExceeded' }
  /** A newer tab took over the database: reload the page. */
  | { status: 'closed' };

export type ReadOnlyRecord = {
  id: string;
  schemaVersion: number;
  data: unknown;
};
export type InvalidRecord = {
  id: string;
  reason: Extract<UpgradeResult, { status: 'invalid' }>['reason'];
  issues: { path: string; message: string }[];
};

export type LoadResult = {
  scenarios: Scenario[];
  /** Records of a newer app: shown with a hint to update, never written. */
  readOnly: ReadOnlyRecord[];
  /** Records that could not be migrated or checked: left untouched. */
  invalid: InvalidRecord[];
};

export type RepositoryOptions = {
  dbName?: string;
  /** The clock for `updatedAt` and the month of the migration. */
  now?: () => Date;
  /** A newer tab opened the database; this connection is closed now. */
  onVersionChange?: () => void;
};

export type Repository = {
  /**
   * `readOnly` when the database was already upgraded by a newer app: data
   * can be read, every write is refused.
   */
  readonly mode: 'readWrite' | 'readOnly';
  loadAll(): Promise<LoadResult>;
  save(scenario: Scenario): Promise<WriteResult>;
  loadSettings(): Promise<DeviceSettings>;
  saveSettings(settings: DeviceSettings): Promise<WriteResult>;
  /** The export file (8.3) of the given scenarios, or of all readable ones. */
  exportFile(ids?: readonly string[]): Promise<ExportFile>;
  /**
   * Writes checked import scenarios in one transaction (8.3): all or nothing.
   * `replace` removes the readable scenarios first and keeps records of a
   * newer app. Ids must be new for `add` (see prepareAddImport).
   */
  writeImport(
    scenarios: readonly Scenario[],
    mode: ImportMode,
  ): Promise<WriteResult>;
  close(): void;
};

const monthOf = (date: Date): YearMonth => ({
  month: date.getMonth() + 1,
  year: date.getFullYear(),
});

const errorName = (error: unknown): string | undefined =>
  error instanceof Error || error instanceof DOMException
    ? error.name
    : undefined;

/** Maps the errors the app has to show to a status; anything else is a bug and is thrown. */
function writeFailure(error: unknown): WriteResult {
  const name = errorName(error);
  if (name === 'QuotaExceededError') return { status: 'quotaExceeded' };
  // The connection was closed for a newer tab while the write started.
  if (name === 'InvalidStateError') return { status: 'closed' };
  throw error;
}

const isNewer = (record: StoredScenario | undefined): boolean =>
  typeof record?.schemaVersion === 'number' &&
  record.schemaVersion > CURRENT_SCHEMA_VERSION;

export async function openRepository(
  options: RepositoryOptions = {},
): Promise<Repository> {
  const { dbName = DB_NAME, now = () => new Date(), onVersionChange } = options;

  let db: IDBPDatabase<EautoDB> | null = null;
  const blocking = () => {
    db?.close();
    db = null;
    onVersionChange?.();
  };

  let mode: Repository['mode'] = 'readWrite';
  try {
    // The database version follows the schema version (8.2), so a newer tab
    // makes the older ones close their connection.
    db = await openDB<EautoDB>(dbName, CURRENT_SCHEMA_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('scenarios')) {
          database.createObjectStore('scenarios', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('settings')) {
          database.createObjectStore('settings');
        }
      },
      blocking,
    });
  } catch (error) {
    if (errorName(error) !== 'VersionError') throw error;
    // A newer app has upgraded the database. Open it as it is, read only, so
    // an old cached app still starts and can show its data with a hint.
    db = await openDB<EautoDB>(dbName, undefined, { blocking });
    mode = 'readOnly';
  }

  const hasStore = (
    database: IDBPDatabase<EautoDB>,
    name: 'scenarios' | 'settings',
  ) => database.objectStoreNames.contains(name);

  function connection(): IDBPDatabase<EautoDB> {
    const database = db;
    if (!database) throw new Error('The database was closed for a newer tab.');
    return database;
  }

  async function loadAll(): Promise<LoadResult> {
    const database = connection();
    const result: LoadResult = { scenarios: [], readOnly: [], invalid: [] };
    if (!hasStore(database, 'scenarios')) return result;
    const records = await database.getAll('scenarios');
    const context = { migrationMonth: monthOf(now()) };
    const migrated: { read: StoredScenario; write: StoredScenario }[] = [];
    for (const record of records) {
      const upgrade = upgradeScenario(record, context);
      if (upgrade.status === 'readOnly') {
        result.readOnly.push({
          id: record.id,
          schemaVersion: upgrade.schemaVersion,
          data: record.data,
        });
      } else if (upgrade.status === 'invalid') {
        result.invalid.push({
          id: record.id,
          reason: upgrade.reason,
          issues: upgrade.issues,
        });
      } else if (upgrade.scenario.id !== record.id) {
        // Stored under another key than its id: saving it would write a
        // second record. Left untouched, like any record that fails to load.
        result.invalid.push({
          id: record.id,
          reason: 'schemaMismatch',
          issues: [
            { path: 'id', message: 'The id differs from the record key.' },
          ],
        });
      } else {
        result.scenarios.push(upgrade.scenario);
        if (upgrade.migrated) {
          // A migration is no edit: the record keeps its updatedAt.
          migrated.push({
            read: record,
            write: {
              ...toRecord(upgrade.scenario),
              updatedAt: record.updatedAt,
            },
          });
        }
      }
    }
    if (migrated.length > 0 && mode === 'readWrite') {
      // Write the migrated records back. A failure here loses nothing: the
      // old record stays, it is migrated again on the next load, and the
      // next save of the scenario writes it anyway.
      await writeBack(migrated).catch(() => undefined);
    }
    return result;
  }

  function toRecord(scenario: Scenario): StoredScenario {
    return {
      id: scenario.id,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: now().toISOString(),
      data: scenario,
    };
  }

  /**
   * Writes migrated records back, each only if the stored record is still the
   * one that was read: another tab or a save may have written it meanwhile,
   * possibly a newer app (8.2).
   */
  async function writeBack(
    records: { read: StoredScenario; write: StoredScenario }[],
  ): Promise<void> {
    const tx = connection().transaction('scenarios', 'readwrite');
    await Promise.all([
      ...records.map(async ({ read, write }) => {
        const stored = await tx.store.get(read.id);
        if (
          stored?.schemaVersion === read.schemaVersion &&
          stored.updatedAt === read.updatedAt
        ) {
          await tx.store.put(write);
        }
      }),
      tx.done,
    ]);
  }

  async function save(scenario: Scenario): Promise<WriteResult> {
    if (mode === 'readOnly') return { status: 'readOnly' };
    const database = db;
    if (!database) return { status: 'closed' };
    try {
      const tx = database.transaction('scenarios', 'readwrite');
      const done = tx.done;
      done.catch(() => undefined); // handled below; avoids an unhandled rejection
      const stored = await tx.store.get(scenario.id);
      if (isNewer(stored)) {
        await done;
        return { status: 'readOnly' };
      }
      // Browsers often report a full storage only when the transaction
      // aborts, so the error is taken from `put` or from `done`.
      await Promise.all([tx.store.put(toRecord(scenario)), done]);
      return { status: 'ok' };
    } catch (error) {
      return writeFailure(error);
    }
  }

  async function loadSettings(): Promise<DeviceSettings> {
    const database = connection();
    if (!hasStore(database, 'settings')) return { ...DEFAULT_DEVICE_SETTINGS };
    const parsed = DeviceSettingsSchema.safeParse(
      await database.get('settings', SETTINGS_KEY),
    );
    return parsed.success ? parsed.data : { ...DEFAULT_DEVICE_SETTINGS };
  }

  async function saveSettings(settings: DeviceSettings): Promise<WriteResult> {
    if (mode === 'readOnly') return { status: 'readOnly' };
    const database = db;
    if (!database) return { status: 'closed' };
    try {
      const tx = database.transaction('settings', 'readwrite');
      await Promise.all([tx.store.put(settings, SETTINGS_KEY), tx.done]);
      return { status: 'ok' };
    } catch (error) {
      return writeFailure(error);
    }
  }

  async function exportFile(ids?: readonly string[]): Promise<ExportFile> {
    const { scenarios } = await loadAll();
    const wanted = ids && new Set(ids);
    return buildExport(
      wanted
        ? scenarios.filter((scenario) => wanted.has(scenario.id))
        : scenarios,
      now(),
    );
  }

  async function writeImport(
    scenarios: readonly Scenario[],
    importMode: ImportMode,
  ): Promise<WriteResult> {
    if (mode === 'readOnly') return { status: 'readOnly' };
    const database = db;
    if (!database) return { status: 'closed' };
    const tx = database.transaction('scenarios', 'readwrite');
    const done = tx.done;
    done.catch(() => undefined); // handled below; avoids an unhandled rejection
    const writes: Promise<unknown>[] = [];
    try {
      const existing = await tx.store.getAll();
      const newer = new Set(
        existing.filter(isNewer).map((record) => record.id),
      );
      if (scenarios.some((scenario) => newer.has(scenario.id))) {
        tx.abort();
        return { status: 'readOnly' };
      }
      if (importMode === 'replace') {
        // Only what this app can read is replaced. Records of a newer app and
        // records that fail to load stay untouched (8.2), unless the file
        // brings a scenario with the same id.
        const context = { migrationMonth: monthOf(now()) };
        const imported = new Set(scenarios.map((scenario) => scenario.id));
        for (const record of existing) {
          if (newer.has(record.id)) continue;
          const upgrade = upgradeScenario(record, context);
          const readable =
            upgrade.status === 'ok' && upgrade.scenario.id === record.id;
          if (imported.has(record.id) || readable) {
            writes.push(tx.store.delete(record.id));
          }
        }
      }
      // `add`, not `put`: an id that is already taken aborts the whole import.
      for (const scenario of scenarios) {
        writes.push(tx.store.add(toRecord(scenario)));
      }
      await Promise.all([...writes, done]);
      return { status: 'ok' };
    } catch (error) {
      // A request that throws does not abort the transaction by itself: undo
      // the writes already queued. Their promises then reject with AbortError.
      writes.forEach((write) => write.catch(() => undefined));
      try {
        tx.abort();
      } catch {
        // Already aborted or finished.
      }
      return writeFailure(error);
    }
  }

  return {
    exportFile,
    writeImport,
    get mode() {
      return mode;
    },
    loadAll,
    save,
    loadSettings,
    saveSettings,
    close() {
      db?.close();
      db = null;
    },
  };
}
