import { useSyncExternalStore } from 'react';
import { BREAKPOINTS } from './breakpoints';

const QUERY = `(min-width: ${BREAKPOINTS.desktop}px)`;

const subscribe = (notify: () => void): (() => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', notify);
  return () => list.removeEventListener('change', notify);
};

const snapshot = (): boolean =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : true;

/** True from 900 px: the layout of the sidebar (8.8). Without matchMedia, as on a desktop. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
