import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import { DEFAULT_DEVICE_SETTINGS, ScenarioSchema } from '../domain';
import { buildExport, openRepository, type Repository } from '../storage';
import {
  controlledWorker,
  fakeRepository,
  settle,
  spawnSequence,
} from './__tests__/fakes';
import { selectActiveScenario, selectExportReminderDue } from './selectors';
import { createAppStore } from './store';
import { loaded, scenarioUpdated } from './scenarioSlice';
import { exportScenarios, importFile, startApp } from './thunks';

// S14: app start (6.2) and import (6.3) against fake-indexeddb, without UI.

const NOW = new Date('2026-11-15T10:00:00Z');
const TEMPLATE_NAME = 'Mein Szenario';
let counter = 0;
const opened: Repository[] = [];

async function setup(options: { persist?: 'granted' | 'denied' } = {}) {
  const repository = await openRepository({
    dbName: `eauto-state-test-${++counter}`,
    now: () => NOW,
  });
  opened.push(repository);
  return { repository, ...storeOn(repository, options) };
}

function storeOn(
  repository: Repository,
  options: { persist?: 'granted' | 'denied' } = {},
) {
  const worker = controlledWorker();
  const ids = [
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
  ];
  const requestPersistence = vi.fn(async () => options.persist ?? 'granted');
  const store = createAppStore({
    repository,
    spawnWorker: spawnSequence(worker),
    now: () => NOW,
    randomId: () => ids.shift() as string,
    requestPersistence,
  });
  return { store, worker, requestPersistence };
}

afterEach(() => {
  opened.splice(0).forEach((repository) => repository.close());
});

describe('S14: app start (6.2)', () => {
  it('an empty database gets a template scenario that becomes active and is computed', async () => {
    const { repository, store, worker, requestPersistence } = await setup();
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));

    const active = selectActiveScenario(store.getState());
    expect(active).toMatchObject({
      id: '30000000-0000-4000-8000-000000000001',
      name: TEMPLATE_NAME,
      parameters: { warrantyReferenceMonth: { month: 11, year: 2026 } },
    });
    expect(requestPersistence).toHaveBeenCalledOnce();
    expect(worker.computes.map((c) => c.request.scenario)).toEqual([active]);

    expect((await repository.loadAll()).scenarios).toEqual([active]);
    expect(await repository.loadSettings()).toMatchObject({
      activeScenarioId: active?.id,
      firstRunCompleted: true,
    });
  });

  it('the next start uses the stored active scenario and asks for persistence no more', async () => {
    const { repository, store } = await setup();
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));
    const second = storeOn(repository);
    await second.store.dispatch(startApp({ templateName: 'other' }));
    expect(second.requestPersistence).not.toHaveBeenCalled();
    expect(selectActiveScenario(second.store.getState())?.name).toBe(
      TEMPLATE_NAME,
    );
    expect(second.store.getState().scenario.order).toHaveLength(1);
  });

  it('a stored scenario becomes active when the settings name none', async () => {
    const { repository, store } = await setup();
    await repository.save(exampleScenario());
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));
    expect(selectActiveScenario(store.getState())?.id).toBe(
      exampleScenario().id,
    );
    expect(store.getState().scenario.order).toEqual([exampleScenario().id]);
  });

  it('a refused persistent storage gives a hint', async () => {
    const { store } = await setup({ persist: 'denied' });
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));
    expect(store.getState().ui.notices.persistenceDenied).toBe(true);
  });

  it('a database of a newer app is shown read only, without a template', async () => {
    const repository = { ...fakeRepository(), mode: 'readOnly' as const };
    const { store } = storeOn(repository);
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));
    expect(store.getState().ui.notices.databaseReadOnly).toBe(true);
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('S14: export reminder (8.3)', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('is due after the interval of the settings and gone after an export', async () => {
    const { store } = await setup();
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));
    const state = () => store.getState();
    expect(selectExportReminderDue(state(), NOW)).toBe(true);

    await store.dispatch(exportScenarios());
    expect(state().scenario.settings.lastExportAt).toBe(NOW.toISOString());
    const days = DEFAULT_DEVICE_SETTINGS.exportReminderDays;
    expect(
      selectExportReminderDue(
        state(),
        new Date(NOW.getTime() + days * DAY - 1),
      ),
    ).toBe(false);
    expect(
      selectExportReminderDue(state(), new Date(NOW.getTime() + days * DAY)),
    ).toBe(true);
  });

  it('the export date is stored as a device setting', async () => {
    const { repository, store } = await setup();
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));
    await store.dispatch(exportScenarios());
    await settle();
    expect((await repository.loadSettings()).lastExportAt).toBe(
      NOW.toISOString(),
    );
  });
});

describe('S14: import (6.3)', () => {
  const file = (content: string) => new Blob([content]);

  it('"add" gives new ids from src/state and keeps the stored scenarios', async () => {
    const { repository, store, worker } = await setup();
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));
    const exported = buildExport(
      [{ ...exampleScenario(), name: TEMPLATE_NAME }],
      NOW,
    );
    const computesBefore = worker.computes.length;

    const result = await store.dispatch(
      importFile(file(exported.content), 'add'),
    );
    expect(result.status).toBe('ok');
    const { scenarios } = await repository.loadAll();
    expect(scenarios.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: '30000000-0000-4000-8000-000000000001', name: TEMPLATE_NAME },
      {
        id: '30000000-0000-4000-8000-000000000002',
        name: `${TEMPLATE_NAME} (Import)`,
      },
    ]);
    expect(store.getState().scenario.order).toHaveLength(2);
    // The active scenario stays and is computed again.
    expect(store.getState().scenario.activeId).toBe(
      '30000000-0000-4000-8000-000000000001',
    );
    expect(worker.computes.length).toBe(computesBefore + 1);
  });

  it('"replace" makes an imported scenario active when the old one is gone', async () => {
    const { store } = await setup();
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));
    const exported = buildExport([exampleScenario()], NOW);
    await store.dispatch(importFile(file(exported.content), 'replace'));
    expect(selectActiveScenario(store.getState())?.id).toBe(
      exampleScenario().id,
    );
    expect(store.getState().scenario.order).toEqual([exampleScenario().id]);
  });

  it('a broken file shows the error and changes nothing', async () => {
    const { repository, store } = await setup();
    await store.dispatch(startApp({ templateName: TEMPLATE_NAME }));
    const before = await repository.loadAll();
    const stateBefore = store.getState().scenario;

    const broken = JSON.parse(buildExport([exampleScenario()], NOW).content);
    broken.scenarios[0].candidates[0].purchasePrice = -1;
    await store.dispatch(importFile(file(JSON.stringify(broken)), 'replace'));

    expect(store.getState().ui.notices.importError).toMatchObject({
      code: 'invalidScenario',
      path: 'scenarios[0].candidates[0].purchasePrice',
    });
    expect(store.getState().scenario).toBe(stateBefore);
    expect(await repository.loadAll()).toEqual(before);
    expect(ScenarioSchema.safeParse(before.scenarios[0]).success).toBe(true);
  });
});

describe('S14: import while an edit is pending', () => {
  it('"add" keeps an edit made while the import was writing, and saves it', async () => {
    const repository = fakeRepository();
    const active = exampleScenario();
    const imported = {
      ...exampleScenario(),
      id: '30000000-0000-4000-8000-000000000001',
      name: 'Imported',
    };
    let finishWrite!: () => void;
    vi.mocked(repository.writeImport).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve({ status: 'ok' });
        }),
    );
    vi.mocked(repository.loadAll).mockResolvedValue({
      scenarios: [active, imported],
      readOnly: [],
      invalid: [],
    });
    const { store } = storeOn(repository);
    store.dispatch(
      loaded({
        scenarios: [active],
        readOnly: [],
        invalid: [],
        settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: active.id },
      }),
    );

    const importing = store.dispatch(
      importFile(
        new Blob([buildExport([exampleScenario()], NOW).content]),
        'add',
      ),
    );
    await vi.waitFor(() => expect(repository.writeImport).toHaveBeenCalled());
    const edited = { ...active, name: 'edited during import' };
    store.dispatch(scenarioUpdated(edited));
    finishWrite();
    await importing;

    expect(store.getState().scenario.byId[active.id]).toBe(edited);
    expect(store.getState().scenario.order).toHaveLength(2);
    expect(repository.save).toHaveBeenCalledWith(edited);
    expect(store.getState().scenario.dirty).toEqual([]);
  });
});
