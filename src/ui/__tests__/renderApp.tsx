import { act, render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import {
  DEFAULT_DEVICE_SETTINGS,
  type DeviceSettings,
  type OfferResult,
  type Scenario,
} from '../../domain';
import { i18n } from '../../i18n';
import { createAppStore, startApp, type AppDependencies } from '../../state';
import { App } from '../App';
import { routes as appRoutes } from '../router';

// Test harness for the UI: a real store from src/state with an in-memory
// repository and a core worker whose answers the test gives. Types come from
// src/state only; src/ui must not import src/storage or src/worker (chapter 5).

type Repository = AppDependencies['repository'];
type WorkerHandle = ReturnType<AppDependencies['spawnWorker']>;
type ComputeRequest = { generation: number; scenario: Scenario };
type Results = Record<string, Record<string, OfferResult>>;

export const NOW = new Date('2026-11-14T11:04:00Z');

export function memoryRepository(
  scenarios: Scenario[],
  settings: Partial<DeviceSettings> = {},
): Repository {
  return {
    mode: 'readWrite',
    loadAll: vi.fn(async () => ({ scenarios, readOnly: [], invalid: [] })),
    save: vi.fn(async () => ({ status: 'ok' }) as const),
    loadSettings: vi.fn(async () => ({
      ...DEFAULT_DEVICE_SETTINGS,
      firstRunCompleted: true,
      ...settings,
    })),
    saveSettings: vi.fn(async () => ({ status: 'ok' }) as const),
    exportFile: vi.fn(async () => ({
      fileName: 'x.json',
      content: '{}',
      skipped: [],
    })),
    writeImport: vi.fn(async () => ({ status: 'ok' }) as const),
    close: vi.fn(),
  };
}

/** A core worker whose compute calls stay open until `finish` answers them. */
export function testWorker() {
  const computes: {
    request: ComputeRequest;
    resolve: (response: unknown) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const api = {
    compute: (request: ComputeRequest) =>
      new Promise((resolve, reject) =>
        computes.push({ request, resolve, reject }),
      ),
    explain: () => new Promise(() => {}),
  };
  const handle = {
    api,
    onCrash: () => {},
    terminate: () => {},
  } as unknown as WorkerHandle;
  return {
    handle,
    computes,
    /** Answers the latest compute call with these results. */
    finish(results: Results = {}) {
      const call = computes.at(-1);
      if (!call) throw new Error('no compute call');
      call.resolve({
        status: 'done',
        generation: call.request.generation,
        scenarioId: call.request.scenario.id,
        results,
      });
    },
    /** Fails the latest compute call, e.g. a bad scenario in the core. */
    fail(message = 'compute failed') {
      const call = computes.at(-1);
      if (!call) throw new Error('no compute call');
      call.reject(new Error(message));
    },
  };
}

/** One incomplete offer result: enough for the status line's labels. */
export const incompleteResult = (
  scenarioId: string,
  comparisonMonths: number,
): Results => ({
  'offer-1': {
    mid: {
      offerId: 'offer-1',
      candidateId: 'candidate-1',
      kind: 'purchase',
      priceCase: 'mid',
      scenarioId,
      comparisonMonths,
      status: 'incomplete',
      issues: [],
    },
  },
});

/**
 * Renders the whole app at a route after the app start of 6.2. Pass `routes`
 * to put a test page into the frame.
 */
export async function renderApp(
  path: string,
  options: {
    scenarios?: Scenario[];
    settings?: Partial<DeviceSettings>;
    routes?: RouteObject[];
    /** `readOnly`: the database belongs to a newer app. */
    mode?: Repository['mode'];
    /** The browser's answer to the request for persistent storage. */
    persistence?: 'granted' | 'denied';
  } = {},
) {
  const scenarios = options.scenarios ?? [];
  const worker = testWorker();
  const repository = {
    ...memoryRepository(scenarios, {
      activeScenarioId: scenarios[0]?.id ?? null,
      ...options.settings,
    }),
    mode: options.mode ?? 'readWrite',
  };
  const store = createAppStore({
    repository,
    spawnWorker: () => worker.handle,
    now: () => NOW,
    randomId: () => '40000000-0000-4000-8000-000000000001',
    requestPersistence: async () => options.persistence ?? 'granted',
  });
  const router = createMemoryRouter(options.routes ?? appRoutes, {
    initialEntries: [path],
  });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <App store={store} router={router} />
    </I18nextProvider>,
  );
  await act(() => store.dispatch(startApp({ templateName: 'Standard' })));
  return { ...view, store, router, worker, repository };
}
