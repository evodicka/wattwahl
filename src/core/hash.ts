// Hash of a result for the determinism checks (Q5): the same input must give
// the same hash in every engine. The text is canonical JSON, so key order
// never matters, and every float64 is written with the shortest text that
// reads back as the same number (-0 and the non-finite values explicitly), so
// equal texts mean bit-equal values. Tests compare the texts themselves; the
// hash is for compact reports across engines.

/**
 * JSON with the keys of every object in sorted order; `undefined` values are
 * left out. For plain data only: `toJSON`, `Date` and `Map` are not honoured
 * and a cycle does not end.
 */
export function canonicalJson(value: unknown): string {
  if (typeof value === 'number') {
    // JSON.stringify would write -0 as 0 and NaN and the infinities as null.
    if (Object.is(value, -0)) return '-0';
    return Number.isFinite(value) ? String(value) : `"${String(value)}"`;
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${fields.join(',')}}`;
}

const FNV_PRIME = 0x01000193;

function fnv1a(text: string, seed: number): number {
  let hash = seed;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

const hex = (value: number): string => value.toString(16).padStart(8, '0');

/** 64-bit FNV-1a hash (two 32-bit lanes with different seeds) of the canonical JSON, as 16 hex digits. */
export function hashResult(value: unknown): string {
  const text = canonicalJson(value);
  return hex(fnv1a(text, 0x811c9dc5)) + hex(fnv1a(text, 0x9747b28c));
}
