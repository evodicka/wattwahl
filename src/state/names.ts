// Scenario names are unique (spec "Szenarien"). Used wherever the app makes a
// name itself: a scenario saved from the price slider, a copy, an import.

const same = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');

/** `base`, or `base (2)`, `base (3)` and so on: the first name that is not taken. */
export function uniqueName(base: string, taken: readonly string[]): string {
  const isTaken = (name: string) => taken.some((other) => same(other, name));
  if (!isTaken(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})`;
    if (!isTaken(candidate)) return candidate;
  }
}
