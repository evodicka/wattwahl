import { vi } from 'vitest';
import { DEFAULT_DEVICE_SETTINGS, type Scenario } from '../../domain';
import type { Repository, WriteResult } from '../../storage';
import type {
  CompareRequest,
  CompareResponse,
  ComputeRequest,
  ComputeResponse,
  CoreApi,
  CoreWorkerHandle,
  ExplainRequest,
  ExplainResponse,
} from '../../worker';

// Test doubles for src/state: an in-memory repository and core workers whose
// answers the test controls.

export function fakeRepository(): Repository & {
  save: ReturnType<typeof vi.fn<(s: Scenario) => Promise<WriteResult>>>;
} {
  return {
    mode: 'readWrite',
    loadAll: vi.fn(async () => ({ scenarios: [], readOnly: [], invalid: [] })),
    save: vi.fn(async () => ({ status: 'ok' }) as const),
    loadSettings: vi.fn(async () => ({ ...DEFAULT_DEVICE_SETTINGS })),
    saveSettings: vi.fn(async () => ({ status: 'ok' }) as const),
    exportFile: vi.fn(async () => ({
      fileName: 'x.json',
      content: '{}',
      skipped: [],
    })),
    writeImport: vi.fn(async () => ({ status: 'ok' }) as const),
    delete: vi.fn(async () => ({ status: 'ok' }) as const),
    close: vi.fn(),
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A worker whose calls stay open until the test answers them. */
export function controlledWorker() {
  const computes: {
    request: ComputeRequest;
    answer: Deferred<ComputeResponse>;
  }[] = [];
  const compares: {
    request: CompareRequest;
    answer: Deferred<CompareResponse>;
  }[] = [];
  const explains: {
    request: ExplainRequest;
    answer: Deferred<ExplainResponse>;
  }[] = [];
  let crashListener: (() => void) | undefined;
  const api: CoreApi = {
    compute: vi.fn((request: ComputeRequest) => {
      const answer = deferred<ComputeResponse>();
      computes.push({ request, answer });
      return answer.promise;
    }),
    compare: vi.fn((request: CompareRequest) => {
      const answer = deferred<CompareResponse>();
      compares.push({ request, answer });
      return answer.promise;
    }),
    explain: vi.fn((request: ExplainRequest) => {
      const answer = deferred<ExplainResponse>();
      explains.push({ request, answer });
      return answer.promise;
    }),
  };
  const handle: CoreWorkerHandle = {
    api,
    onCrash(listener) {
      crashListener = listener;
    },
    terminate: vi.fn(),
  };
  return {
    handle,
    api,
    computes,
    explains,
    compares,
    /** Answers a compute call with an empty result of its generation. */
    finish(index: number) {
      const call = computes[index];
      if (!call) throw new Error(`no compute call ${index}`);
      call.answer.resolve(done(call.request));
    },
    crash() {
      crashListener?.();
    },
  };
}

export const done = (request: ComputeRequest): ComputeResponse => ({
  status: 'done',
  generation: request.generation,
  scenarioId: request.scenario.id,
  results: {},
});

/** spawnWorker that hands out the given workers in order. */
export function spawnSequence(
  ...workers: { handle: CoreWorkerHandle }[]
): () => CoreWorkerHandle {
  const queue = [...workers];
  return () => {
    const next = queue.shift();
    if (!next) throw new Error('no more fake workers');
    return next.handle;
  };
}

/** Lets pending promise callbacks run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
