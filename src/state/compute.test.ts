import { describe, expect, it } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import { DEFAULT_DEVICE_SETTINGS, type OfferResult } from '../domain';
import {
  controlledWorker,
  fakeRepository,
  settle,
  spawnSequence,
} from './__tests__/fakes';
import { MAX_RESTARTS } from './listeners';
import { loaded } from './scenarioSlice';
import { createAppStore } from './store';
import { closeTrace, openTrace, requestCompute } from './thunks';

// S14: generations, worker crash and the Rechenweg of the open offer (8.5, 8.10).

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item ${index}`);
  return item;
}

function setup(workerCount = 1) {
  const workers = Array.from({ length: workerCount }, controlledWorker);
  const store = createAppStore({
    repository: fakeRepository(),
    spawnWorker: spawnSequence(...workers),
  });
  const scenario = exampleScenario();
  store.dispatch(
    loaded({
      scenarios: [scenario],
      readOnly: [],
      invalid: [],
      settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: scenario.id },
    }),
  );
  return { store, workers, scenario };
}

describe('S14: generations', () => {
  it('a result of an outdated generation is dropped', async () => {
    const { store, workers } = setup();
    const worker = at(workers, 0);
    void store.dispatch(requestCompute());
    void store.dispatch(requestCompute());
    expect(worker.computes.map((c) => c.request.generation)).toEqual([1, 2]);
    expect(store.getState().result.status).toBe('computing');

    worker.finish(1);
    await settle();
    expect(store.getState().result.latest?.generation).toBe(2);
    expect(store.getState().result.status).toBe('idle');

    worker.finish(0);
    await settle();
    expect(store.getState().result.latest?.generation).toBe(2);
  });

  it('a superseded run leaves the state as it is', async () => {
    const { store, workers } = setup();
    const worker = at(workers, 0);
    void store.dispatch(requestCompute());
    void store.dispatch(requestCompute());
    worker.computes[0]?.answer.resolve({ status: 'superseded', generation: 1 });
    await settle();
    expect(store.getState().result).toMatchObject({
      status: 'computing',
      latest: null,
    });
  });

  it('a failing run is shown as an error', async () => {
    const { store, workers } = setup();
    void store.dispatch(requestCompute());
    at(workers, 0).computes[0]?.answer.reject(new Error('boom'));
    await settle();
    expect(store.getState().result).toMatchObject({
      status: 'error',
      error: 'boom',
    });
  });
});

describe('S14: worker crash (8.10)', () => {
  it('a new worker computes; the last result stays visible, marked as outdated', async () => {
    const { store, workers } = setup(2);
    const [first, second] = [at(workers, 0), at(workers, 1)];
    void store.dispatch(requestCompute());
    first.finish(0);
    await settle();
    const lastResult = store.getState().result.latest;
    expect(lastResult?.generation).toBe(1);

    void store.dispatch(requestCompute());
    first.crash();
    await settle();
    expect(first.handle.terminate).toHaveBeenCalled();
    expect(store.getState().result.status).toBe('stale');
    expect(store.getState().result.latest).toBe(lastResult);
    // The latest request went to the new worker.
    expect(second.computes).toHaveLength(1);

    second.finish(0);
    await settle();
    expect(store.getState().result.status).toBe('idle');
    expect(store.getState().result.latest?.generation).toBe(
      second.computes[0]?.request.generation,
    );
  });

  it(`stops retrying after ${MAX_RESTARTS} crashes in a row`, async () => {
    const { store, workers } = setup(MAX_RESTARTS + 2);
    void store.dispatch(requestCompute());
    for (let index = 0; index <= MAX_RESTARTS; index++) {
      at(workers, index).crash();
      await settle();
    }
    expect(store.getState().result.status).toBe('error');
    expect(at(workers, MAX_RESTARTS + 1).computes).toHaveLength(0);
  });
});

describe('S14: Rechenweg only for the open offer (8.5)', () => {
  const answer = (offerId: string) => ({
    result: { status: 'incomplete' } as unknown as OfferResult,
    trace: [{ formula: 'OPT.select' as const, inputs: {}, value: offerId }],
  });

  it('keeps exactly the trace of the offer opened last', async () => {
    const { store, workers, scenario } = setup();
    const worker = at(workers, 0);
    const purchase = `${at(scenario.candidates, 0).id}:purchase`;
    const lease = `${at(scenario.candidates, 0).id}:lease:${at(at(scenario.candidates, 0).leaseTiers, 0).id}`;

    void store.dispatch(openTrace(purchase, 'mid'));
    void store.dispatch(openTrace(lease, 'mid'));
    expect(worker.explains.map((e) => e.request.offerId)).toEqual([
      purchase,
      lease,
    ]);

    worker.explains[1]?.answer.resolve(answer(lease));
    worker.explains[0]?.answer.resolve(answer(purchase));
    await settle();
    const { trace } = store.getState().result;
    expect(trace?.offerId).toBe(lease);
    expect(trace?.entries.map((e) => e.value)).toEqual([lease]);

    store.dispatch(closeTrace());
    expect(store.getState().result.trace).toBeNull();
  });

  it('the compute requests carry no trace', async () => {
    const { store, workers } = setup();
    void store.dispatch(requestCompute());
    expect(Object.keys(at(at(workers, 0).computes, 0).request).sort()).toEqual([
      'generation',
      'scenario',
      'sliderPrices',
    ]);
    expect(at(workers, 0).api.explain).not.toHaveBeenCalled();
  });
});

describe('S14: review follow-ups', () => {
  it('a crash during the Rechenweg shows an error instead of loading forever', async () => {
    const { store, workers, scenario } = setup(2);
    const offerId = `${at(scenario.candidates, 0).id}:purchase`;
    const opening = store.dispatch(openTrace(offerId, 'mid'));
    at(workers, 0).crash();
    await opening;
    expect(store.getState().result.trace).toMatchObject({
      offerId,
      result: null,
      error: 'The core worker stopped during the call.',
    });
  });

  it('a Rechenweg answered after closing stays closed', async () => {
    const { store, workers, scenario } = setup();
    const offerId = `${at(scenario.candidates, 0).id}:purchase`;
    const opening = store.dispatch(openTrace(offerId, 'mid'));
    store.dispatch(closeTrace());
    at(at(workers, 0).explains, 0).answer.resolve({
      result: { status: 'incomplete' } as unknown as OfferResult,
      trace: [],
    });
    await opening;
    expect(store.getState().result.trace).toBeNull();
  });

  it('S21: an answer to an earlier request of the same offer is dropped', async () => {
    const { store, workers, scenario } = setup();
    const worker = at(workers, 0);
    const offerId = `${at(scenario.candidates, 0).id}:purchase`;
    const answer = (value: string) => ({
      result: { status: 'incomplete' } as unknown as OfferResult,
      trace: [{ formula: 'OPT.select' as const, inputs: {}, value }],
    });
    const first = store.dispatch(openTrace(offerId, 'mid'));
    store.dispatch(closeTrace());
    // The same offer and price case again, with changed prices.
    const second = store.dispatch(openTrace(offerId, 'mid'));
    expect(store.getState().result.trace?.requestId).toBe(2);

    at(worker.explains, 0).answer.resolve(answer('old'));
    await first;
    expect(store.getState().result.trace?.result).toBeNull();
    at(worker.explains, 1).answer.resolve(answer('new'));
    await second;
    expect(store.getState().result.trace?.entries.map((e) => e.value)).toEqual([
      'new',
    ]);
  });

  it('S21: a failure of an earlier request does not mark the later one as failed', async () => {
    const { store, workers, scenario } = setup();
    const worker = at(workers, 0);
    const offerId = `${at(scenario.candidates, 0).id}:purchase`;
    const first = store.dispatch(openTrace(offerId, 'mid'));
    const second = store.dispatch(openTrace(offerId, 'mid'));
    at(worker.explains, 0).answer.reject(new Error('old failure'));
    await first;
    expect(store.getState().result.trace?.error).toBeNull();
    at(worker.explains, 1).answer.resolve({
      result: { status: 'incomplete' } as unknown as OfferResult,
      trace: [],
    });
    await second;
    expect(store.getState().result.trace?.error).toBeNull();
  });

  it('a crash before the first result marks the empty result as outdated', async () => {
    const { store, workers } = setup(2);
    void store.dispatch(requestCompute());
    at(workers, 0).crash();
    await settle();
    expect(store.getState().result).toMatchObject({
      status: 'stale',
      latest: null,
    });
    at(workers, 1).finish(0);
    await settle();
    expect(store.getState().result.status).toBe('idle');
  });

  it('a result resets the crash count, so later crashes are retried again', async () => {
    const { store, workers } = setup(2 * MAX_RESTARTS + 2);
    void store.dispatch(requestCompute());
    let index = 0;
    for (let crash = 0; crash < MAX_RESTARTS; crash++) {
      at(workers, index++).crash();
      await settle();
    }
    // The retry on the current worker succeeds.
    at(workers, index).finish(at(workers, index).computes.length - 1);
    await settle();
    expect(store.getState().result.status).toBe('idle');
    for (let crash = 0; crash < MAX_RESTARTS; crash++) {
      void store.dispatch(requestCompute());
      at(workers, index++).crash();
      await settle();
    }
    expect(store.getState().result.status).toBe('stale');
    expect(at(workers, index).computes.length).toBeGreaterThan(0);
  });
});

describe('S16: time of the calculation for the status line', () => {
  it('a taken-over result carries the time from the injected clock', async () => {
    const worker = controlledWorker();
    const now = new Date('2026-11-14T11:04:00Z');
    const store = createAppStore({
      repository: fakeRepository(),
      spawnWorker: spawnSequence(worker),
      now: () => now,
    });
    const scenario = exampleScenario();
    store.dispatch(
      loaded({
        scenarios: [scenario],
        readOnly: [],
        invalid: [],
        settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: scenario.id },
      }),
    );
    expect(store.getState().result.computedAt).toBeNull();
    void store.dispatch(requestCompute());
    worker.finish(0);
    await settle();
    expect(store.getState().result.computedAt).toBe(now.toISOString());
  });
});
