/** The five areas in navigation order; each is the path of its route (8.8). */
export const AREAS = [
  'fahrprofil',
  'kandidaten',
  'parameter',
  'ergebnis',
  'szenarien',
] as const;

export type Area = (typeof AREAS)[number];

/** Route handle: which area a route belongs to (header title, error boundary). */
export type AreaHandle = { area: Area };

export const isAreaHandle = (handle: unknown): handle is AreaHandle =>
  typeof handle === 'object' &&
  handle !== null &&
  AREAS.includes((handle as { area?: unknown }).area as Area);
