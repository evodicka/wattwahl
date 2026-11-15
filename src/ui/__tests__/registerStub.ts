import { useSyncExternalStore } from 'react';

// Stands in for `virtual:pwa-register/react`, which only a build provides. A
// test calls `setNeedRefresh` and reads `updateServiceWorker` to see what the
// app asked for.

let needRefresh = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const registration = {
  updateServiceWorkerCalls: [] as boolean[],
  /** What `updateServiceWorker` does; a test may make it slow or failing. */
  updateServiceWorker: async (reload?: boolean) => {
    registration.updateServiceWorkerCalls.push(reload ?? false);
  },
};

export function setNeedRefresh(value: boolean) {
  needRefresh = value;
  notify();
}

export function resetRegisterStub() {
  needRefresh = false;
  registration.updateServiceWorkerCalls = [];
  registration.updateServiceWorker = async (reload?: boolean) => {
    registration.updateServiceWorkerCalls.push(reload ?? false);
  };
}

export function useRegisterSW() {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => needRefresh,
  );
  return {
    needRefresh: [value, setNeedRefresh] as const,
    offlineReady: [false, () => undefined] as const,
    updateServiceWorker: (reload?: boolean) =>
      registration.updateServiceWorker(reload),
  };
}
