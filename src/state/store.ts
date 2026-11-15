import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { requestPersistence, type Repository } from '../storage';
import type { CoreWorkerHandle } from '../worker';
import { createCoreClient } from './coreClient';
import { createListeners, listenForRestarts } from './listeners';
import { computeSucceeded, traceLoaded } from './resultSlice';
import { rootReducer, type AppDispatch, type RootState } from './types';

export type AppDependencies = {
  repository: Repository;
  /** Starts a core worker; `spawnCoreWorker` from src/worker in the app. */
  spawnWorker: () => CoreWorkerHandle;
  now?: () => Date;
  /** Ids come only from here (8.1). */
  randomId?: () => string;
  requestPersistence?: typeof requestPersistence;
};

export function createAppStore(dependencies: AppDependencies) {
  const core = createCoreClient(dependencies.spawnWorker);
  const services = {
    repository: dependencies.repository,
    core,
    now: dependencies.now ?? (() => new Date()),
    randomId: dependencies.randomId ?? (() => crypto.randomUUID()),
    requestPersistence: dependencies.requestPersistence ?? requestPersistence,
  };
  const listeners = createListeners(services);
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: { extraArgument: services },
        // Results and traces are large plain data; walking them on every
        // action in development costs more than it finds.
        immutableCheck: { ignoredPaths: ['result'] },
        serializableCheck: {
          ignoredPaths: ['result'],
          ignoredActions: [computeSucceeded.type, traceLoaded.type],
        },
      }).prepend(listeners.middleware),
  });
  listenForRestarts(listeners.startListening, store, core);
  return Object.assign(store, { services });
}

export type AppStore = ReturnType<typeof createAppStore>;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
