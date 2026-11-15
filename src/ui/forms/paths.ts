// Dot paths into a scenario ("workplaces.a.commute.city"), as in
// PARAMETER_DEFAULTS and the warnings of src/domain.

type Node = Record<string, unknown> | unknown[];

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null;

/** The value at a path, or `undefined` if the path does not exist. */
export function getAt(target: unknown, path: string): unknown {
  let node: unknown = target;
  for (const key of path.split('.')) {
    if (!isNode(node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/**
 * A copy of `target` with the value at `path` replaced. Only the objects on
 * the path are copied, the rest is shared: a scenario is replaced, never
 * changed in place (8.5).
 */
export function setAt<T>(target: T, path: string, value: unknown): T {
  const [key, ...rest] = path.split('.');
  if (key === undefined || !isNode(target)) {
    throw new Error(`Unknown path: ${path}`);
  }
  const child =
    rest.length === 0
      ? value
      : setAt((target as Record<string, unknown>)[key], rest.join('.'), value);
  if (Array.isArray(target)) {
    const copy: unknown[] = [...target];
    copy[Number(key)] = child;
    return copy as T;
  }
  return { ...target, [key]: child };
}

/** Deep equality for the plain values of a scenario (numbers, arrays, objects). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isNode(a) || !isNode(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) =>
      sameValue(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    )
  );
}
