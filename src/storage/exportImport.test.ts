import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DEVICE_SETTINGS,
  type Scenario,
} from '../domain';
import {
  EXPORT_FORMAT,
  MAX_IMPORT_BYTES,
  buildExport,
  parseImport,
  prepareAddImport,
  type ImportMode,
} from './exportImport';
import {
  openRepository,
  type Repository,
  type StoredScenario,
} from './repository';

// S13: export file, import check and the all-or-nothing import write
// (architecture 8.3, runtime view 6.3).

const NOW = new Date('2026-11-15T10:00:00Z');
let counter = 0;
const freshName = () => `eauto-import-test-${++counter}`;
const opened: Repository[] = [];

async function repository(dbName = freshName()) {
  const repo = await openRepository({ dbName, now: () => NOW });
  opened.push(repo);
  return repo;
}

afterEach(() => {
  opened.splice(0).forEach((repo) => repo.close());
  vi.restoreAllMocks();
});

async function rawRecords(dbName: string): Promise<unknown[]> {
  const db = await openDB(dbName);
  const records = await db.getAll('scenarios');
  db.close();
  return records;
}

const ids = {
  first: '10000000-0000-4000-8000-000000000001',
  second: '10000000-0000-4000-8000-000000000002',
  third: '10000000-0000-4000-8000-000000000003',
};
const scenario = (id: string, name: string): Scenario => ({
  ...exampleScenario(),
  id,
  name,
});

const fileOf = (value: unknown): Blob =>
  new Blob([typeof value === 'string' ? value : JSON.stringify(value)]);

const envelope = (scenarios: unknown[], extra: object = {}) => ({
  format: EXPORT_FORMAT,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  exportedAt: NOW.toISOString(),
  scenarios,
  ...extra,
});

/** Runtime view 6.3 without src/state: check the file, write only if it passes. */
async function importInto(repo: Repository, file: Blob, mode: ImportMode) {
  const parsed = await parseImport(file, { now: () => NOW });
  if (parsed.status === 'ok') await repo.writeImport(parsed.scenarios, mode);
  return parsed;
}

describe('S13: export file (8.3)', () => {
  it('names the file with the local date and the schema version', () => {
    const now = new Date(2026, 0, 5, 23, 30);
    const file = buildExport([exampleScenario()], now);
    expect(file.fileName).toBe(
      `eauto-export-2026-01-05-v${CURRENT_SCHEMA_VERSION}.json`,
    );
    expect(JSON.parse(file.content)).toEqual({
      format: 'eauto-export',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      scenarios: [exampleScenario()],
    });
  });

  it('exports one or all scenarios, never the device settings', async () => {
    const repo = await repository();
    await repo.save(scenario(ids.first, 'A'));
    await repo.save(scenario(ids.second, 'B'));
    await repo.saveSettings({
      ...DEFAULT_DEVICE_SETTINGS,
      activeScenarioId: ids.first,
    });

    const all = JSON.parse((await repo.exportFile()).content);
    expect(all.scenarios.map((s: Scenario) => s.name)).toEqual(['A', 'B']);
    expect(Object.keys(all).sort()).toEqual([
      'exportedAt',
      'format',
      'scenarios',
      'schemaVersion',
    ]);

    const one = JSON.parse((await repo.exportFile([ids.second])).content);
    expect(one.scenarios.map((s: Scenario) => s.name)).toEqual(['B']);
  });
});

describe('S13: TC14 (unit part) export, empty database, import', () => {
  it('restores the same scenarios', async () => {
    const source = await repository();
    const stored = [scenario(ids.first, 'A'), scenario(ids.second, 'B')];
    for (const s of stored) await source.save(s);
    const file = await source.exportFile();

    // "Browser-Speicher leeren": a new, empty database.
    const target = await repository();
    const parsed = await importInto(target, fileOf(file.content), 'replace');
    expect(parsed.status).toBe('ok');
    expect((await target.loadAll()).scenarios).toEqual(stored);
  });

  it('migrates an older export file on import', async () => {
    const v1 = JSON.parse(
      readFileSync(
        new URL('../domain/__fixtures__/scenario.v1.json', import.meta.url),
        'utf8',
      ),
    ) as { data: unknown };
    const parsed = await parseImport(
      fileOf(envelope([v1.data], { schemaVersion: 1 })),
      { now: () => NOW },
    );
    expect(parsed.status).toBe('ok');
    if (parsed.status === 'ok') {
      expect(parsed.scenarios[0]?.parameters.warrantyReferenceMonth).toEqual({
        month: 11,
        year: 2026,
      });
    }
  });
});

describe('S13: Q7 (unit part) a broken file changes nothing', () => {
  const broken = { ...exampleScenario(), id: ids.second };
  broken.candidates = broken.candidates.map((candidate) => ({
    ...candidate,
    purchasePrice: -5,
  }));

  it.each([
    [
      'corrupt JSON',
      fileOf('{"format": "eauto-export", '),
      'invalidJson',
      undefined,
    ],
    [
      'a foreign format',
      fileOf(envelope([exampleScenario()], { format: 'other-app' })),
      'wrongFormat',
      'format',
    ],
    [
      'a file that is too large',
      fileOf('x'.repeat(MAX_IMPORT_BYTES + 1)),
      'tooLarge',
      undefined,
    ],
    [
      'a higher schema version',
      fileOf(
        envelope([exampleScenario()], {
          schemaVersion: CURRENT_SCHEMA_VERSION + 1,
        }),
      ),
      'newerVersion',
      'schemaVersion',
    ],
    [
      'an invalid field deep in a scenario',
      fileOf(envelope([scenario(ids.first, 'ok'), broken])),
      'invalidScenario',
      'scenarios[1].candidates[0].purchasePrice',
    ],
  ])('%s', async (_name, file, code, path) => {
    for (const mode of ['replace', 'add'] as const) {
      const dbName = freshName();
      const repo = await repository(dbName);
      await repo.save(scenario(ids.third, 'kept'));
      const before = await rawRecords(dbName);

      const parsed = await importInto(repo, file, mode);
      expect(parsed).toMatchObject({ status: 'error', code });
      if (parsed.status === 'error') expect(parsed.path).toBe(path);
      expect(await rawRecords(dbName)).toEqual(before);
    }
  });

  it('accepts a file of exactly the size limit', async () => {
    const content = JSON.stringify(envelope([exampleScenario()]));
    const padded = content + ' '.repeat(MAX_IMPORT_BYTES - content.length);
    expect((await parseImport(fileOf(padded))).status).toBe('ok');
  });

  it.each([
    ['no scenarios', envelope([]), 'noScenarios', undefined],
    [
      'a missing scenario list',
      { ...envelope([]), scenarios: undefined },
      'invalidFile',
      'scenarios',
    ],
    [
      'the same id twice',
      envelope([scenario(ids.first, 'a'), scenario(ids.first, 'b')]),
      'duplicateId',
      'scenarios[1].id',
    ],
  ])('rejects %s', async (_name, value, code, path) => {
    const parsed = await parseImport(fileOf(value));
    expect(parsed).toMatchObject({ status: 'error', code });
    if (parsed.status === 'error') expect(parsed.path).toBe(path);
  });
});

describe('S13: add and replace', () => {
  it('"add" gives new ids and appends "(Import)" to taken names', () => {
    const newIds = [ids.first, ids.second, ids.third];
    const prepared = prepareAddImport(
      [
        scenario(ids.first, 'Pendeln'),
        scenario(ids.second, 'Pendeln'),
        scenario(ids.third, 'Neu'),
      ],
      ['Pendeln', 'Pendeln (Import)'],
      () => newIds.shift() as string,
    );
    expect(prepared.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: ids.first, name: 'Pendeln (Import) (Import)' },
      { id: ids.second, name: 'Pendeln (Import) (Import) (Import)' },
      { id: ids.third, name: 'Neu' },
    ]);
  });

  it('"add" keeps the stored scenarios', async () => {
    const repo = await repository();
    await repo.save(scenario(ids.first, 'A'));
    const prepared = prepareAddImport(
      [scenario(ids.first, 'A')],
      ['A'],
      () => ids.second,
    );
    expect(await repo.writeImport(prepared, 'add')).toEqual({ status: 'ok' });
    const names = (await repo.loadAll()).scenarios.map((s) => s.name);
    expect(names).toEqual(['A', 'A (Import)']);
  });

  it('"add" with an id that is taken writes nothing', async () => {
    const dbName = freshName();
    const repo = await repository(dbName);
    await repo.save(scenario(ids.first, 'A'));
    const before = await rawRecords(dbName);
    await expect(
      repo.writeImport(
        [scenario(ids.second, 'B'), scenario(ids.first, 'A again')],
        'add',
      ),
    ).rejects.toMatchObject({ name: 'ConstraintError' });
    expect(await rawRecords(dbName)).toEqual(before);
  });

  it('"replace" removes the readable scenarios and keeps those of a newer app', async () => {
    const dbName = freshName();
    const repo = await repository(dbName);
    await repo.save(scenario(ids.first, 'old'));
    const newer: StoredScenario = {
      id: ids.third,
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      updatedAt: '2027-01-01T00:00:00.000Z',
      data: { future: true },
    };
    const db = await openDB(dbName);
    await db.put('scenarios', newer);
    db.close();

    expect(
      await repo.writeImport([scenario(ids.second, 'imported')], 'replace'),
    ).toEqual({ status: 'ok' });
    const loaded = await repo.loadAll();
    expect(loaded.scenarios.map((s) => s.name)).toEqual(['imported']);
    expect(loaded.readOnly.map((r) => r.id)).toEqual([ids.third]);
  });

  it('"replace" keeps records that fail to load, untouched', async () => {
    const dbName = freshName();
    const repo = await repository(dbName);
    await repo.save(scenario(ids.first, 'readable'));
    const invalid = {
      id: ids.third,
      schemaVersion: 'one',
      updatedAt: '2026-01-01T00:00:00.000Z',
      data: { broken: true },
    };
    const db = await openDB(dbName);
    await db.put('scenarios', invalid as unknown as StoredScenario);
    db.close();

    expect(
      await repo.writeImport([scenario(ids.second, 'imported')], 'replace'),
    ).toEqual({ status: 'ok' });
    const records = (await rawRecords(dbName)) as StoredScenario[];
    expect(records.map((record) => record.id)).toEqual([ids.second, ids.third]);
    expect(records[1]).toEqual(invalid);
  });

  it('"replace" with the id of a record that fails to load replaces it', async () => {
    const dbName = freshName();
    const repo = await repository(dbName);
    const db = await openDB(dbName);
    await db.put('scenarios', {
      id: ids.first,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: '2026-01-01T00:00:00.000Z',
      data: { broken: true },
    });
    db.close();
    expect(
      await repo.writeImport([scenario(ids.first, 'fixed')], 'replace'),
    ).toEqual({ status: 'ok' });
    expect((await repo.loadAll()).scenarios.map((s) => s.name)).toEqual([
      'fixed',
    ]);
  });

  it('"replace" refuses to write over a record of a newer app', async () => {
    const dbName = freshName();
    const repo = await repository(dbName);
    const db = await openDB(dbName);
    await db.put('scenarios', {
      id: ids.first,
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      updatedAt: '2027-01-01T00:00:00.000Z',
      data: {},
    });
    db.close();
    const before = await rawRecords(dbName);
    expect(
      await repo.writeImport([scenario(ids.first, 'A')], 'replace'),
    ).toEqual({ status: 'readOnly' });
    expect(await rawRecords(dbName)).toEqual(before);
  });

  it('a write that fails halfway leaves the store unchanged', async () => {
    const dbName = freshName();
    const repo = await repository(dbName);
    await repo.save(scenario(ids.first, 'A'));
    const before = await rawRecords(dbName);
    const add = IDBObjectStore.prototype.add;
    let calls = 0;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['add']>
    ) {
      if (++calls === 2) {
        throw new DOMException(
          'The quota has been exceeded.',
          'QuotaExceededError',
        );
      }
      return add.apply(this, args);
    });
    expect(
      await repo.writeImport(
        [scenario(ids.second, 'B'), scenario(ids.third, 'C')],
        'replace',
      ),
    ).toEqual({ status: 'quotaExceeded' });
    vi.restoreAllMocks();
    expect(await rawRecords(dbName)).toEqual(before);
  });
});
