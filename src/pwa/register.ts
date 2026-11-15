import { useRegisterSW } from 'virtual:pwa-register/react';

/** How often a running app asks for a new version (the browser also asks on every start). */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

export type UpdatePrompt = {
  /** A new version is downloaded and waits for the go-ahead (6.4, step 2). */
  updateAvailable: boolean;
  /** Activates the new version and reloads the page. Call it after saving. */
  update(): Promise<void>;
  /** Hides the hint until the next new version or start. */
  dismiss(): void;
};

// One check timer for the whole page, however often the hook is mounted.
let checkTimer: number | undefined;

/**
 * Registers the service worker and tells when a new version is ready
 * (architecture 6.4, 8.12). The worker only precaches and does not take over
 * by itself: the new version starts when `update()` is called.
 */
export function useUpdatePrompt(): UpdatePrompt {
  const {
    needRefresh: [updateAvailable, setUpdateAvailable],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration || checkTimer !== undefined) return;
      // A phone app stays open for days: look for a new version now and then.
      // Offline there is nothing to find, and a failed check is no error.
      checkTimer = window.setInterval(() => {
        if (!navigator.onLine || registration.installing) return;
        registration.update().catch(() => undefined);
      }, UPDATE_CHECK_MS);
    },
  });
  return {
    updateAvailable,
    update: () => updateServiceWorker(true),
    dismiss: () => setUpdateAvailable(false),
  };
}
