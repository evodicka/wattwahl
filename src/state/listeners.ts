import {
  createListenerMiddleware,
  isAnyOf,
  type TypedStartListening,
} from '@reduxjs/toolkit';
import type { CoreClient } from './coreClient';
import {
  computeFailed,
  computeScheduled,
  computeSucceeded,
  workerCrashed,
} from './resultSlice';
import {
  activeScenarioSet,
  scenarioAdded,
  scenarioUpdated,
  settingsUpdated,
} from './scenarioSlice';
import { flushSaves, persistSettings, requestCompute } from './thunks';
import type { AppDispatch, RootState, Services } from './types';
import { sliderPricesSet } from './uiSlice';

/** Saving and computing start independently after this much quiet (6.1, 8.5). */
export const DEBOUNCE_MS = 300;

export type AppStartListening = TypedStartListening<
  RootState,
  AppDispatch,
  Services
>;

export function createListeners(services: Services) {
  const middleware = createListenerMiddleware<RootState, AppDispatch, Services>(
    { extra: services },
  );
  const startListening = middleware.startListening as AppStartListening;

  // Autosave: each change restarts the wait, so a burst gives one save.
  startListening({
    matcher: isAnyOf(scenarioAdded, scenarioUpdated),
    effect: async (_action, api) => {
      api.cancelActiveListeners();
      await api.delay(DEBOUNCE_MS);
      await api.dispatch(flushSaves());
    },
  });

  // Recompute the active scenario after the same quiet time.
  startListening({
    predicate: (action, state) =>
      isAnyOf(activeScenarioSet, sliderPricesSet)(action) ||
      (scenarioUpdated.match(action) &&
        action.payload.id === state.scenario.activeId),
    effect: async (_action, api) => {
      api.cancelActiveListeners();
      api.dispatch(computeScheduled());
      await api.delay(DEBOUNCE_MS);
      await api.dispatch(requestCompute());
    },
  });

  // Device settings are small and rare: written at once.
  startListening({
    matcher: isAnyOf(settingsUpdated, activeScenarioSet),
    effect: async (_action, api) => {
      await api.dispatch(persistSettings());
    },
  });

  return { middleware: middleware.middleware, startListening };
}

/** After this many crashes in a row without a result, the app stops retrying. */
export const MAX_RESTARTS = 3;

/**
 * After the worker was restarted (8.10): mark the last result as outdated and
 * send the latest request again. A scenario that kills the worker every time
 * ends as an error, not as a loop.
 */
export function listenForRestarts(
  startListening: AppStartListening,
  store: { dispatch: AppDispatch; getState: () => RootState },
  core: CoreClient,
): () => void {
  let crashes = 0;
  startListening({
    actionCreator: computeSucceeded,
    effect: () => {
      crashes = 0;
    },
  });
  return core.onRestart(() => {
    crashes += 1;
    store.dispatch(workerCrashed());
    if (crashes <= MAX_RESTARTS) {
      void store.dispatch(requestCompute());
    } else {
      store.dispatch(
        computeFailed({
          generation: store.getState().result.generation,
          message: 'The core worker stopped again and again.',
        }),
      );
    }
  });
}

type EventHost = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** Saves at once when the page is hidden or left (8.2): the timer may never fire then. */
export function attachLifecycle(
  dispatch: AppDispatch,
  target: {
    window: EventHost;
    document: EventHost & Pick<Document, 'visibilityState'>;
  } = { window, document },
): () => void {
  // A rejection here is a bug in the repository; the page is going away, so
  // it is only logged.
  const flush = () => {
    dispatch(flushSaves()).catch((error: unknown) => console.error(error));
  };
  const onVisibility = () => {
    if (target.document.visibilityState === 'hidden') flush();
  };
  target.window.addEventListener('pagehide', flush);
  target.document.addEventListener('visibilitychange', onVisibility);
  return () => {
    target.window.removeEventListener('pagehide', flush);
    target.document.removeEventListener('visibilitychange', onVisibility);
  };
}
