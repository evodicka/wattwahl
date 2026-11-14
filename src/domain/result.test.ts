import { describe, expect, it } from 'vitest';
import { FORMULA_IDS, TraceEntrySchema } from './result';

describe('FORMULA_IDS', () => {
  it('contains no duplicates', () => {
    expect(new Set(FORMULA_IDS).size).toBe(FORMULA_IDS.length);
  });
});

describe('TraceEntrySchema', () => {
  const entry = {
    formula: 'F3.u',
    inputs: { a: 1, b: 'x', c: true },
    value: 0.5,
  };

  it('accepts number, string and boolean inputs and values', () => {
    expect(TraceEntrySchema.safeParse(entry).success).toBe(true);
    expect(
      TraceEntrySchema.safeParse({ ...entry, value: 'green', resultPath: 'p' })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown formula id', () => {
    expect(
      TraceEntrySchema.safeParse({ ...entry, formula: 'F9.x' }).success,
    ).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])('rejects %s as a value', (value) => {
    expect(TraceEntrySchema.safeParse({ ...entry, value }).success).toBe(false);
  });

  it('rejects non-finite and nested inputs', () => {
    expect(
      TraceEntrySchema.safeParse({ ...entry, inputs: { a: NaN } }).success,
    ).toBe(false);
    expect(
      TraceEntrySchema.safeParse({ ...entry, inputs: { a: { b: 1 } } }).success,
    ).toBe(false);
  });
});
