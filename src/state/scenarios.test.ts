import { describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import { DEFAULT_DEVICE_SETTINGS } from '../domain';
import {
  controlledWorker,
  fakeRepository,
  spawnSequence,
} from './__tests__/fakes';
import {
  compareScenarios,
  createScenario,
  deleteScenario,
  duplicateScenario,
  renameScenario,
} from './scenarios';
import { loaded } from './scenarioSlice';
import { selectActiveScenario, selectScenarios } from './selectors';
import { createAppStore } from './store';
import { checkExportReminder, exportScenarios } from './thunks';

// S22: scenario list, comparison and export reminder.

const NOW = new Date('2026-11-14T11:04:00Z');

function setup(settings: Partial<typeof DEFAULT_DEVICE_SETTINGS> = {}) {
  let counter = 0;
  const worker = controlledWorker();
  const repository = fakeRepository();
  const store = createAppStore({
    repository,
    spawnWorker: spawnSequence(worker),
    now: () => NOW,
    randomId: () =>
      `70000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  });
  const scenario = exampleScenario();
  store.dispatch(
    loaded({
      scenarios: [scenario],
      readOnly: [],
      invalid: [],
      settings: {
        ...DEFAULT_DEVICE_SETTINGS,
        activeScenarioId: scenario.id,
        ...settings,
      },
    }),
  );
  return { store, scenario, worker, repository };
}

const names = (store: ReturnType<typeof setup>['store']) =>
  selectScenarios(store.getState()).map((s) => s.name);

describe('S22: create, duplicate, rename', () => {
  it('a new scenario is empty, has a unique name and becomes active', () => {
    const { store, scenario } = setup();
    const id = store.dispatch(createScenario({ name: scenario.name }));
    const state = store.getState();
    expect(id).not.toBeNull();
    expect(state.scenario.activeId).toBe(id);
    expect(selectActiveScenario(state)?.candidates).toEqual([]);
    expect(names(store)).toEqual([scenario.name, `${scenario.name} (2)`]);
  });

  it('a copy of the active scenario has new ids and the same candidates', () => {
    const { store, scenario } = setup();
    const id = store.dispatch(
      createScenario({ name: 'Kopie', copyOfActive: true }),
    );
    const copy = store.getState().scenario.byId[id ?? ''];
    expect(copy?.candidates.map((c) => c.name)).toEqual(
      scenario.candidates.map((c) => c.name),
    );
    const oldIds = new Set([
      scenario.id,
      ...scenario.candidates.map((c) => c.id),
    ]);
    expect(
      [copy?.id, ...(copy?.candidates.map((c) => c.id) ?? [])].some((x) =>
        oldIds.has(x ?? ''),
      ),
    ).toBe(false);
  });

  it('a duplicate keeps the active scenario and gets a unique name', () => {
    const { store, scenario } = setup();
    const id = store.dispatch(duplicateScenario(scenario.id, scenario.name));
    expect(store.getState().scenario.activeId).toBe(scenario.id);
    expect(names(store)).toEqual([scenario.name, `${scenario.name} (2)`]);
    expect(store.getState().scenario.byId[id ?? '']).toBeDefined();
    expect(store.dispatch(duplicateScenario('missing', 'x'))).toBeNull();
  });

  it('rename rejects an empty name and a name another scenario has, in any case', () => {
    const { store, scenario } = setup();
    const other =
      store.dispatch(duplicateScenario(scenario.id, 'Zweites')) ?? '';
    expect(store.dispatch(renameScenario(other, '   '))).toBe('empty');
    expect(
      store.dispatch(
        renameScenario(other, `  ${scenario.name.toUpperCase()} `),
      ),
    ).toBe('taken');
    expect(store.dispatch(renameScenario('missing', 'x'))).toBe('unknown');
    expect(store.dispatch(renameScenario(other, 'Drittes'))).toBe('ok');
    // Its own name, even in another case, is no clash.
    expect(store.dispatch(renameScenario(other, 'DRITTES'))).toBe('ok');
    expect(names(store)).toEqual([scenario.name, 'DRITTES']);
  });
});

describe('S22: delete', () => {
  it('deletes in the database first and moves the active scenario to another one', async () => {
    const { store, scenario, repository } = setup();
    const other =
      store.dispatch(duplicateScenario(scenario.id, 'Zweites')) ?? '';
    expect(await store.dispatch(deleteScenario(scenario.id, 'Standard'))).toBe(
      'ok',
    );
    expect(repository.delete).toHaveBeenCalledWith(scenario.id);
    expect(store.getState().scenario.activeId).toBe(other);
    expect(names(store)).toEqual(['Zweites']);
  });

  it('deleting the last scenario leaves an empty one, so the app has a scenario', async () => {
    const { store, scenario } = setup();
    expect(await store.dispatch(deleteScenario(scenario.id, 'Standard'))).toBe(
      'ok',
    );
    expect(names(store)).toEqual(['Standard']);
    expect(selectActiveScenario(store.getState())?.candidates).toEqual([]);
  });

  it('a delete the database refuses changes nothing', async () => {
    const { store, scenario, repository } = setup();
    vi.mocked(repository.delete).mockResolvedValue({ status: 'readOnly' });
    expect(await store.dispatch(deleteScenario(scenario.id, 'Standard'))).toBe(
      'readOnly',
    );
    expect(names(store)).toEqual([scenario.name]);
    expect(store.getState().scenario.activeId).toBe(scenario.id);
  });

  it('an unknown id is left alone and the database is not asked', async () => {
    const { store, repository } = setup();
    expect(await store.dispatch(deleteScenario('missing', 'Standard'))).toBe(
      'unknown',
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('a deleted scenario leaves a running comparison', async () => {
    const { store, scenario, worker } = setup();
    const other =
      store.dispatch(duplicateScenario(scenario.id, 'Zweites')) ?? '';
    const third =
      store.dispatch(duplicateScenario(scenario.id, 'Drittes')) ?? '';
    const run = store.dispatch(compareScenarios([scenario.id, other, third]));
    worker.compares[0]?.answer.resolve({
      scenarioId: scenario.id,
      results: {},
    });
    await Promise.resolve();
    await store.dispatch(deleteScenario(scenario.id, 'Standard'));
    expect(store.getState().result.comparison?.scenarioIds).toEqual([
      other,
      third,
    ]);
    expect(
      store.getState().result.comparison?.results[scenario.id],
    ).toBeUndefined();
    void run;
  });
});

describe('S22: comparison', () => {
  it('computes each scenario in turn and finishes with a time', async () => {
    const { store, scenario, worker } = setup();
    const other =
      store.dispatch(duplicateScenario(scenario.id, 'Zweites')) ?? '';
    const run = store.dispatch(compareScenarios([scenario.id, other]));
    expect(store.getState().result.comparison?.status).toBe('loading');
    await vi.waitFor(() => expect(worker.compares).toHaveLength(1));
    worker.compares[0]?.answer.resolve({
      scenarioId: scenario.id,
      results: {},
    });
    await vi.waitFor(() => expect(worker.compares).toHaveLength(2));
    worker.compares[1]?.answer.resolve({ scenarioId: other, results: {} });
    await run;
    const comparison = store.getState().result.comparison;
    expect(comparison?.status).toBe('done');
    expect(Object.keys(comparison?.results ?? {})).toEqual([
      scenario.id,
      other,
    ]);
    expect(comparison?.computedAt).toBe(NOW.toISOString());
  });

  it('fewer than two scenarios clear the comparison and ask the worker nothing', async () => {
    const { store, scenario, worker } = setup();
    await store.dispatch(compareScenarios([scenario.id]));
    expect(store.getState().result.comparison).toBeNull();
    expect(worker.compares).toHaveLength(0);
  });

  it('answers of an older request are dropped when a newer one started', async () => {
    const { store, scenario, worker } = setup();
    const other =
      store.dispatch(duplicateScenario(scenario.id, 'Zweites')) ?? '';
    const first = store.dispatch(compareScenarios([scenario.id, other]));
    await vi.waitFor(() => expect(worker.compares).toHaveLength(1));
    const second = store.dispatch(compareScenarios([other, scenario.id]));
    await vi.waitFor(() => expect(worker.compares).toHaveLength(2));
    // The old request answers late, with a marker result.
    worker.compares[0]?.answer.resolve({
      scenarioId: scenario.id,
      results: { old: {} },
    });
    await vi.waitFor(() => expect(worker.compares).toHaveLength(3));
    expect(store.getState().result.comparison?.results).toEqual({});
    worker.compares[1]?.answer.resolve({ scenarioId: other, results: {} });
    await vi.waitFor(() => expect(worker.compares).toHaveLength(4));
    worker.compares[3]?.answer.resolve({
      scenarioId: scenario.id,
      results: {},
    });
    worker.compares[2]?.answer.resolve({ scenarioId: other, results: {} });
    await Promise.all([first, second]);
    const comparison = store.getState().result.comparison;
    expect(comparison?.scenarioIds).toEqual([other, scenario.id]);
    expect(Object.keys(comparison?.results ?? {}).sort()).toEqual(
      [scenario.id, other].sort(),
    );
    expect(comparison?.results[scenario.id]).toEqual({});
  });

  it('a worker error ends in an error state', async () => {
    const { store, scenario, worker } = setup();
    const other =
      store.dispatch(duplicateScenario(scenario.id, 'Zweites')) ?? '';
    const run = store.dispatch(compareScenarios([scenario.id, other]));
    await vi.waitFor(() => expect(worker.compares).toHaveLength(1));
    worker.compares[0]?.answer.reject(new Error('boom'));
    await run;
    expect(store.getState().result.comparison).toMatchObject({
      status: 'error',
      error: 'boom',
    });
  });
});

describe('S22: export reminder', () => {
  const DAY = 86_400_000;

  it('is due when never exported, once there is a candidate', () => {
    const { store } = setup({ lastExportAt: null });
    store.dispatch(checkExportReminder());
    expect(store.getState().ui.exportReminder).toBe('due');
    expect(store.getState().ui.exportAgeDays).toBeNull();
  });

  it('is not due for scenarios without any candidate', () => {
    const { store, scenario } = setup({ lastExportAt: null });
    store.dispatch(
      loaded({
        scenarios: [{ ...scenario, candidates: [] }],
        readOnly: [],
        invalid: [],
        settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: scenario.id },
      }),
    );
    store.dispatch(checkExportReminder());
    expect(store.getState().ui.exportReminder).toBe('hidden');
  });

  it('is due at the interval, with the age in days, and not before', () => {
    const interval = DEFAULT_DEVICE_SETTINGS.exportReminderDays;
    const old = new Date(NOW.getTime() - interval * DAY).toISOString();
    const young = new Date(NOW.getTime() - (interval - 1) * DAY).toISOString();
    const due = setup({ lastExportAt: old });
    due.store.dispatch(checkExportReminder());
    expect(due.store.getState().ui.exportReminder).toBe('due');
    expect(due.store.getState().ui.exportAgeDays).toBe(interval);
    const fresh = setup({ lastExportAt: young });
    fresh.store.dispatch(checkExportReminder());
    expect(fresh.store.getState().ui.exportReminder).toBe('hidden');
  });

  it('closing it keeps it closed on a new check, and an export removes it', async () => {
    const { store } = setup({ lastExportAt: null });
    store.dispatch(checkExportReminder());
    const { exportReminderDismissed } = await import('./uiSlice');
    store.dispatch(exportReminderDismissed());
    store.dispatch(checkExportReminder());
    expect(store.getState().ui.exportReminder).toBe('dismissed');
    await store.dispatch(exportScenarios());
    expect(store.getState().scenario.settings.lastExportAt).toBe(
      NOW.toISOString(),
    );
    expect(store.getState().ui.exportReminder).toBe('hidden');
  });

  it('an export saves the pending edits first, so the file holds them', async () => {
    const { store, repository, scenario } = setup();
    const order: string[] = [];
    vi.mocked(repository.save).mockImplementation(async () => {
      order.push('save');
      return { status: 'ok' };
    });
    vi.mocked(repository.exportFile).mockImplementation(async () => {
      order.push('export');
      return { fileName: 'x.json', content: '{}', skipped: [] };
    });
    store.dispatch(duplicateScenario(scenario.id, 'Zweites'));
    await store.dispatch(exportScenarios());
    expect(order).toEqual(['save', 'export']);
  });

  it('exportScenarios hands on the names of the records it skipped', async () => {
    const { store, repository } = setup();
    vi.mocked(repository.exportFile).mockResolvedValue({
      fileName: 'x.json',
      content: '{}',
      skipped: ['abc'],
    });
    expect((await store.dispatch(exportScenarios())).skipped).toEqual(['abc']);
  });
});
