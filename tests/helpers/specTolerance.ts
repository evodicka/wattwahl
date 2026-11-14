import { expect } from 'vitest';
import { parseDecimal } from '../../src/domain';

/**
 * Half a unit of the last given digit of a spec literal such as "31,1"
 * (architecture 8.4): the spec values are rounded by hand, so a result matches
 * if it lies within ± half a unit of the last digit.
 */
export function specTolerance(literal: string): {
  value: number;
  half: number;
} {
  const parsed = parseDecimal(literal);
  if (!parsed.ok) throw new Error(`Not a spec number: "${literal}"`);
  const decimals = (literal.split(',')[1] ?? '').length;
  return { value: parsed.value, half: 0.5 * Math.pow(10, -decimals) };
}

/** Checks `actual` against a spec literal with the tolerance of 8.4. */
export function expectSpec(actual: number, literal: string): void {
  const { value, half } = specTolerance(literal);
  // The tiny slack only absorbs binary rounding at the exact boundary.
  expect(
    Math.abs(actual - value),
    `${actual} vs spec "${literal}" (± ${half})`,
  ).toBeLessThanOrEqual(half + 1e-12);
}
