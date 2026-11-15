import type {
  ComputeRequest,
  ComputeResponse,
  CoreWorkerHandle,
  ExplainRequest,
  ExplainResponse,
} from '../worker';

// Main-thread side of the worker (8.5, 8.10). A dead worker never answers its
// pending calls, so every call races against the crash of the worker it went
// to. After a crash the client starts a new worker and tells its listeners,
// which send the latest request again.

export type CrashedResponse = { status: 'crashed' };

export type CoreClient = {
  compute(request: ComputeRequest): Promise<ComputeResponse | CrashedResponse>;
  /** Rejects if the worker dies during the call. */
  explain(request: ExplainRequest): Promise<ExplainResponse>;
  onRestart(listener: () => void): () => void;
  dispose(): void;
};

export function createCoreClient(spawn: () => CoreWorkerHandle): CoreClient {
  const listeners = new Set<() => void>();
  let disposed = false;
  let current: { handle: CoreWorkerHandle; crashed: Promise<'crashed'> };

  function start() {
    const handle = spawn();
    const crashed = new Promise<'crashed'>((resolve) => {
      handle.onCrash(() => {
        resolve('crashed');
        // Only the worker in use is replaced, and only once.
        if (disposed || current.handle !== handle) return;
        handle.terminate();
        start();
        listeners.forEach((listener) => listener());
      });
    });
    current = { handle, crashed };
  }
  start();

  return {
    async compute(request) {
      const { handle, crashed } = current;
      const response = await Promise.race([
        handle.api.compute(request),
        crashed,
      ]);
      return response === 'crashed' ? { status: 'crashed' } : response;
    },
    async explain(request) {
      const { handle, crashed } = current;
      const response = await Promise.race([
        handle.api.explain(request),
        crashed,
      ]);
      if (response === 'crashed') {
        throw new Error('The core worker stopped during the call.');
      }
      return response;
    },
    onRestart(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      listeners.clear();
      current.handle.terminate();
    },
  };
}
