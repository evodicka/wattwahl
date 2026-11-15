import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DEVICE_SETTINGS,
  type DeviceSettings,
  type Scenario,
} from '../domain';
import { requestPersistence } from './persistence';
import {
  openRepository,
  type Repository,
  type StoredScenario,
} from './repository';

// S12 against fake-indexeddb, the IndexedDB test environment. Every test uses
// its own database name, so no state leaks between tests.

const NOW = new Date('2026-11-15T10:00:00Z');
let counter = 0;
const freshName = () => `eauto-test-${++counter}`;
const opened: Repository[] = [];

async function repository(dbName: string, onVersionChange?: () => void) {
  const repo = await openRepository({
    dbName,
    now: () => NOW,
    onVersionChange,
  });
  opened.push(repo);
  return repo;
}

afterEach(() => {
  opened.splice(0).forEach((repo) => repo.close());
  vi.restoreAllMocks();
});

/** Writes raw records straight into a database of the given version, as another app would. */
async function seed(
  dbName: string,
  version: number,
  records: StoredScenario[],
): Promise<void> {
  const db = await openDB(dbName, version, {
    upgrade(database) {
      database.createObjectStore('scenarios', { keyPath: 'id' });
      database.createObjectStore('settings');
    },
  });
  for (const record of records) await db.put('scenarios', record);
  db.close();
}

async function rawRecords(dbName: string): Promise<unknown[]> {
  const db = await openDB(dbName);
  const records = await db.getAll('scenarios');
  db.close();
  return records;
}

const scenarioWithName = (name: string): Scenario => ({
  ...exampleScenario(),
  name,
});

describe('S12: save and load', () => {
  it('a saved scenario loads back equal', async () => {
    const repo = await repository(freshName());
    const scenario = exampleScenario();
    expect(await repo.save(scenario)).toEqual({ status: 'ok' });
    const loaded = await repo.loadAll();
    expect(loaded).toEqual({
      scenarios: [scenario],
      readOnly: [],
      invalid: [],
    });
  });

  it('stores the record shape of 8.2 with the current schema version', async () => {
    const dbName = freshName();
    const repo = await repository(dbName);
    await repo.save(exampleScenario());
    expect(await rawRecords(dbName)).toEqual([
      {
        id: exampleScenario().id,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        updatedAt: NOW.toISOString(),
        data: exampleScenario(),
      },
    ]);
  });

  it('a second save replaces the first', async () => {
    const repo = await repository(freshName());
    await repo.save(scenarioWithName('first'));
    await repo.save(scenarioWithName('second'));
    const { scenarios } = await repo.loadAll();
    expect(scenarios.map((s) => s.name)).toEqual(['second']);
  });
});

describe('S12: migration on load', () => {
  const v1 = JSON.parse(
    readFileSync(
      new URL('../domain/__fixtures__/scenario.v1.json', import.meta.url),
      'utf8',
    ),
  ) as { schemaVersion: number; data: { id: string } };

  it('migrates a v1 record and writes it back as the current version', async () => {
    const dbName = freshName();
    await seed(dbName, CURRENT_SCHEMA_VERSION, [
      { id: v1.data.id, schemaVersion: 1, updatedAt: 'x', data: v1.data },
    ]);
    const repo = await repository(dbName);
    const { scenarios, invalid } = await repo.loadAll();
    expect(invalid).toEqual([]);
    expect(scenarios).toHaveLength(1);
    // The migration month comes from the injected clock (11/2026).
    expect(scenarios[0]?.parameters.warrantyReferenceMonth).toEqual({
      month: 11,
      year: 2026,
    });
    const [stored] = (await rawRecords(dbName)) as StoredScenario[];
    expect(stored?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(stored?.data).toEqual(scenarios[0]);
  });

  it.each([
    [
      'an unknown version',
      { schemaVersion: 'one' as unknown as number, data: exampleScenario() },
      'unknownVersion',
    ],
    [
      'data that fails the schema',
      {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: { ...exampleScenario(), name: 42 },
      },
      'schemaMismatch',
    ],
  ])(
    'a failing migration leaves the old record unchanged: %s',
    async (_, broken, reason) => {
      const dbName = freshName();
      const record = {
        id: exampleScenario().id,
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...broken,
      };
      await seed(dbName, CURRENT_SCHEMA_VERSION, [record]);
      const repo = await repository(dbName);
      const loaded = await repo.loadAll();
      expect(loaded.scenarios).toEqual([]);
      expect(loaded.invalid).toEqual([
        expect.objectContaining({ id: record.id, reason }),
      ]);
      expect(await rawRecords(dbName)).toEqual([record]);
    },
  );
});

describe('S12: records of a newer app are never overwritten', () => {
  const newer: StoredScenario = {
    id: exampleScenario().id,
    schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    updatedAt: '2027-01-01T00:00:00.000Z',
    data: { ...exampleScenario(), futureField: true },
  };

  it('opens a database upgraded by a newer app read only', async () => {
    const dbName = freshName();
    await seed(dbName, CURRENT_SCHEMA_VERSION + 1, [newer]);
    const repo = await repository(dbName);
    expect(repo.mode).toBe('readOnly');
    expect(await repo.loadAll()).toEqual({
      scenarios: [],
      readOnly: [
        { id: newer.id, schemaVersion: newer.schemaVersion, data: newer.data },
      ],
      invalid: [],
    });
    expect(await repo.save(exampleScenario())).toEqual({ status: 'readOnly' });
    expect(await repo.saveSettings(DEFAULT_DEVICE_SETTINGS)).toEqual({
      status: 'readOnly',
    });
    expect(await rawRecords(dbName)).toEqual([newer]);
  });

  it('refuses to save over a newer record in a current database', async () => {
    const dbName = freshName();
    await seed(dbName, CURRENT_SCHEMA_VERSION, [newer]);
    const repo = await repository(dbName);
    expect(repo.mode).toBe('readWrite');
    const { readOnly } = await repo.loadAll();
    expect(readOnly.map((r) => r.id)).toEqual([newer.id]);
    expect(await repo.save(exampleScenario())).toEqual({ status: 'readOnly' });
    expect(await rawRecords(dbName)).toEqual([newer]);
  });
});

describe('S12: full storage (8.10)', () => {
  it('a QuotaExceededError gives a status and keeps the stored state', async () => {
    const dbName = freshName();
    const repo = await repository(dbName);
    await repo.save(scenarioWithName('before'));
    const before = await rawRecords(dbName);
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException(
        'The quota has been exceeded.',
        'QuotaExceededError',
      );
    });
    expect(await repo.save(scenarioWithName('after'))).toEqual({
      status: 'quotaExceeded',
    });
    expect(
      await repo.saveSettings({
        ...DEFAULT_DEVICE_SETTINGS,
        exportReminderDays: 3,
      }),
    ).toEqual({ status: 'quotaExceeded' });
    vi.restoreAllMocks();
    expect(await rawRecords(dbName)).toEqual(before);
  });

  it('other errors are not hidden', async () => {
    const repo = await repository(freshName());
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new TypeError('bug');
    });
    await expect(repo.save(exampleScenario())).rejects.toThrow('bug');
  });
});

describe('S12: several tabs (versionchange)', () => {
  it('closes for a newer tab, reports it and then refuses writes without throwing', async () => {
    const dbName = freshName();
    const onVersionChange = vi.fn();
    const repo = await repository(dbName, onVersionChange);
    // A newer app in another tab opens the next version. It only succeeds if
    // this connection closes.
    const newer = await openDB(dbName, CURRENT_SCHEMA_VERSION + 1);
    newer.close();
    expect(onVersionChange).toHaveBeenCalledOnce();
    expect(await repo.save(exampleScenario())).toEqual({ status: 'closed' });
    expect(await repo.saveSettings(DEFAULT_DEVICE_SETTINGS)).toEqual({
      status: 'closed',
    });
  });
});

describe('S12: device settings', () => {
  it('falls back to the defaults when nothing is stored', async () => {
    const repo = await repository(freshName());
    expect(await repo.loadSettings()).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it('saves and loads the settings', async () => {
    const repo = await repository(freshName());
    const settings: DeviceSettings = {
      activeScenarioId: exampleScenario().id,
      lastExportAt: '2026-11-01T08:00:00.000Z',
      exportReminderDays: 7,
      trafficLightColors: {
        green: '#00aa00',
        yellow: '#ffcc00',
        red: '#cc0000',
      },
      firstRunCompleted: true,
    };
    expect(await repo.saveSettings(settings)).toEqual({ status: 'ok' });
    expect(await repo.loadSettings()).toEqual(settings);
  });

  it('falls back to the defaults when the stored entry is invalid', async () => {
    const dbName = freshName();
    await seed(dbName, CURRENT_SCHEMA_VERSION, []);
    const db = await openDB(dbName);
    await db.put('settings', { exportReminderDays: -1 }, 'device');
    db.close();
    const repo = await repository(dbName);
    expect(await repo.loadSettings()).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it('keeps settings and scenarios in separate stores', async () => {
    const dbName = freshName();
    const repo = await repository(dbName);
    await repo.saveSettings(DEFAULT_DEVICE_SETTINGS);
    expect(await rawRecords(dbName)).toEqual([]);
  });
});

describe('S12: persistent storage (8.2)', () => {
  it.each([
    [true, 'granted'],
    [false, 'denied'],
  ] as const)('persist() resolving %s gives %s', async (answer, expected) => {
    expect(
      await requestPersistence({ persist: () => Promise.resolve(answer) }),
    ).toBe(expected);
  });

  it('a rejecting persist() is a refusal, not an error', async () => {
    expect(
      await requestPersistence({ persist: () => Promise.reject(new Error()) }),
    ).toBe('denied');
  });

  it('a browser without persist() is reported as unsupported', async () => {
    expect(await requestPersistence({})).toBe('unsupported');
  });
});
