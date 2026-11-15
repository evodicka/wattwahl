import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import { DEFAULT_DEVICE_SETTINGS, type Scenario } from '../domain';
import {
  controlledWorker,
  fakeRepository,
  spawnSequence,
} from './__tests__/fakes';
import { DEBOUNCE_MS, attachLifecycle } from './listeners';
import {
  activeScenarioSet,
  loaded,
  scenarioAdded,
  scenarioUpdated,
} from './scenarioSlice';
import { selectResultIsCurrent } from './selectors';
import { createAppStore } from './store';
import { sliderPricesSet } from './uiSlice';

// S14: autosave and recompute after 300 ms of quiet (6.1, 8.2, 8.5).

const OTHER_ID = '20000000-0000-4000-8000-000000000001';

function setup() {
  const repository = fakeRepository();
  const worker = controlledWorker();
  const store = createAppStore({
    repository,
    spawnWorker: spawnSequence(worker),
  });
  const active = exampleScenario();
  const other: Scenario = { ...exampleScenario(), id: OTHER_ID, name: 'B' };
  store.dispatch(
    loaded({
      scenarios: [active, other],
      readOnly: [],
      invalid: [],
      settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: active.id },
    }),
  );
  return { store, repository, worker, active, other };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('S14: debounce of saving and computing', () => {
  it('ten quick changes within 300 ms give exactly one save and one compute', async () => {
    const { store, repository, worker, active } = setup();
    let last = active;
    for (let index = 0; index < 10; index++) {
      last = { ...last, name: `Change ${index}` };
      store.dispatch(scenarioUpdated(last));
      await vi.advanceTimersByTimeAsync(25);
    }
    expect(repository.save).not.toHaveBeenCalled();
    expect(worker.api.compute).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(last);
    expect(worker.api.compute).toHaveBeenCalledTimes(1);
    expect(worker.computes[0]?.request.scenario).toBe(last);

    await vi.advanceTimersByTimeAsync(10 * DEBOUNCE_MS);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(worker.api.compute).toHaveBeenCalledTimes(1);
    expect(store.getState().scenario.dirty).toEqual([]);
  });

  it('a change of another scenario is saved but does not recompute', async () => {
    const { store, repository, worker, other } = setup();
    store.dispatch(scenarioUpdated({ ...other, name: 'B2' }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(worker.api.compute).not.toHaveBeenCalled();
  });

  it('a slider change recomputes with the slider prices, without saving', async () => {
    const { store, repository, worker } = setup();
    const sliderPrices = {
      petrol: 1.8,
      electricity: 0.3,
      petrolEscalationPct: 2,
      electricityEscalationPct: 2,
    };
    store.dispatch(sliderPricesSet(sliderPrices));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(worker.computes[0]?.request.sliderPrices).toEqual(sliderPrices);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('a scenario changed again during its save stays dirty', async () => {
    const { store, repository, active } = setup();
    let finishSave!: () => void;
    repository.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = () => resolve({ status: 'ok' });
        }),
    );
    store.dispatch(scenarioUpdated({ ...active, name: 'first' }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    store.dispatch(scenarioUpdated({ ...active, name: 'second' }));
    finishSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().scenario.dirty).toEqual([active.id]);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'second' }),
    );
    expect(store.getState().scenario.dirty).toEqual([]);
  });

  it('a full storage shows the notice and keeps the state in memory (8.10)', async () => {
    const { store, repository, active } = setup();
    repository.save.mockResolvedValue({ status: 'quotaExceeded' });
    const changed = { ...active, name: 'kept' };
    store.dispatch(scenarioUpdated(changed));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const state = store.getState();
    expect(state.ui.notices.quotaExceeded).toBe(true);
    expect(state.scenario.byId[active.id]).toBe(changed);
    expect(state.scenario.dirty).toEqual([active.id]);
  });

  it('a closed connection asks for a reload', async () => {
    const { store, repository, active } = setup();
    repository.save.mockResolvedValue({ status: 'closed' });
    store.dispatch(scenarioAdded({ ...active, name: 'x' }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(store.getState().ui.notices.reloadRequired).toBe(true);
  });
});

describe('S14: "wird aktualisiert" from the first input (8.5)', () => {
  it('marks the result as updating at once, not only after the debounce', async () => {
    const { store, worker, active } = setup();
    store.dispatch(scenarioUpdated({ ...active, name: 'x' }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    worker.finish(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(selectResultIsCurrent(store.getState())).toBe(true);

    store.dispatch(scenarioUpdated({ ...active, name: 'y' }));
    expect(store.getState().result.status).toBe('computing');
    expect(selectResultIsCurrent(store.getState())).toBe(false);
  });

  it('results of another scenario are not current', async () => {
    const { store, worker, active, other } = setup();
    store.dispatch(scenarioUpdated({ ...active, name: 'x' }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    worker.finish(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(selectResultIsCurrent(store.getState())).toBe(true);
    store.dispatch(activeScenarioSet(other.id));
    expect(selectResultIsCurrent(store.getState())).toBe(false);
  });
});

describe('S14: saving when the page is left (8.2)', () => {
  function host(visibilityState: DocumentVisibilityState = 'visible') {
    const window = new EventTarget();
    const document = Object.assign(new EventTarget(), { visibilityState });
    return { window, document };
  }

  it('pagehide saves at once, without waiting for the 300 ms', async () => {
    const { store, repository, active } = setup();
    const target = host();
    attachLifecycle(store.dispatch, target);
    store.dispatch(scenarioUpdated({ ...active, name: 'leaving' }));
    target.window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange saves only when the page is hidden', async () => {
    const { store, repository, active } = setup();
    const target = host('visible');
    const detach = attachLifecycle(store.dispatch, target);
    store.dispatch(scenarioUpdated({ ...active, name: 'x' }));
    target.document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.save).not.toHaveBeenCalled();

    target.document.visibilityState = 'hidden';
    target.document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.save).toHaveBeenCalledTimes(1);

    detach();
    store.dispatch(scenarioUpdated({ ...active, name: 'y' }));
    target.window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});
