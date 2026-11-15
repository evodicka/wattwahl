// Scenario names are unique (spec "Szenarien"). Used wherever the app makes a
// name itself: a scenario saved from the price slider, a copy, an import.

const same = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');

/** The name is already used by one of `taken` (same text without regard to case and edge spaces). */
export const isNameTaken = (name: string, taken: readonly string[]): boolean =>
  taken.some((other) => same(other, name));

/** `base`, or `base (2)`, `base (3)` and so on: the first name that is not taken. */
export function uniqueName(base: string, taken: readonly string[]): string {
  if (!isNameTaken(base, taken)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})`;
    if (!isNameTaken(candidate, taken)) return candidate;
  }
}
