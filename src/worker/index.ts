/** Web Worker endpoint (Comlink): generation handling and cooperative abort. */
import { releaseProxy, wrap, type Remote } from 'comlink';
import type { CoreApi } from './endpoint';

export { BASE_PRICE_CASES, createCoreEndpoint, macrotask } from './endpoint';
export type {
  CompareRequest,
  CompareResponse,
  ComputeRequest,
  ComputeResponse,
  CoreApi,
  ExplainRequest,
  ExplainResponse,
  OfferResults,
} from './endpoint';

/** A running core worker, as src/state uses it. */
export type CoreWorkerHandle = {
  api: Remote<CoreApi> | CoreApi;
  /** Called once when the worker dies; pending calls never answer then. */
  onCrash(listener: () => void): void;
  terminate(): void;
};

/**
 * Starts the core in a module worker. The worker URL stays inside this module,
 * so Vite bundles the worker and src/state imports only this index.
 */
export function spawnCoreWorker(): CoreWorkerHandle {
  const worker = new Worker(new URL('./core.worker.ts', import.meta.url), {
    type: 'module',
    name: 'core',
  });
  const api = wrap<CoreApi>(worker);
  return {
    api,
    onCrash(listener) {
      worker.addEventListener('error', () => listener(), { once: true });
    },
    terminate() {
      api[releaseProxy]();
      worker.terminate();
    },
  };
}
