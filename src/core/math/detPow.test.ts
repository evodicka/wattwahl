import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ROOT12_STEPS, detPow } from './detPow';

const relativeError = (actual: number, expected: number): number =>
  expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / expected;

describe('S06: detPow against Math.pow', () => {
  it('S06: depreciation base (1 - w) with exponent D/12, D = 1..600', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.99, noNaN: true }),
        fc.integer({ min: 1, max: 600 }),
        (w, months) => {
          const expected = Math.pow(1 - w, months / 12);
          expect(
            relativeError(detPow(1 - w, months / 12), expected),
          ).toBeLessThan(1e-12);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('S06: escalation base (1 + g) with integer exponents 0..50', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -0.99, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 50 }),
        (g, years) => {
          const expected = Math.pow(1 + g, years);
          expect(relativeError(detPow(1 + g, years), expected)).toBeLessThan(
            1e-12,
          );
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('S06: the twelfth root converges within the fixed step count', () => {
    // Dense sweep over the reduced range [1, 4096) plus tiny and huge bases.
    const bases = [1e-300, 1e-12, 1e-6, 0.5, 1, 1.0000001, 2, 4095.999, 4096];
    for (let a = 1; a < 4096; a *= 1.013) bases.push(a, 1 / a);
    for (const base of bases) {
      expect(
        relativeError(detPow(base, 1 / 12), Math.pow(base, 1 / 12)),
      ).toBeLessThan(1e-14);
    }
    expect(ROOT12_STEPS).toBeGreaterThan(0);
  });

  it('TC7: 40,000 EUR at 15 % over 48 months keeps the exact integer path', () => {
    const base = 0.85;
    // 0.85^4 by plain multiplication: the exact path must equal it bit for bit.
    const expected = base * base * (base * base);
    expect(Object.is(detPow(base, 48 / 12), expected)).toBe(true);
    expect(40000 * detPow(base, 4)).toBeCloseTo(20880.25, 2);
  });
});

describe('S06: detPow is deterministic', () => {
  it('S06: two calls with the same input are bit-identical', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.integer({ min: 0, max: 600 }),
        (base, months) => {
          const first = detPow(base, months / 12);
          const second = detPow(base, months / 12);
          expect(Object.is(first, second)).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe('S06: detPow edge cases', () => {
  it('S06: 0^0 is 1, 0^x is 0 for x > 0', () => {
    expect(detPow(0, 0)).toBe(1);
    expect(detPow(0, 4)).toBe(0);
    expect(detPow(0, 5 / 12)).toBe(0);
  });

  it('S06: 1^x is 1 and x^0 is 1', () => {
    expect(detPow(1, 3.5)).toBe(1);
    expect(detPow(0.37, 0)).toBe(1);
  });

  it('S06: a full year of 100 % depreciation (base 0) leaves nothing', () => {
    expect(detPow(1 - 1, 48 / 12)).toBe(0);
  });

  it('S06: an exponent that is not a whole number of twelfths throws', () => {
    expect(() => detPow(0.85, 0.1)).toThrow(RangeError);
  });

  it('S06: a negative base, a negative exponent or NaN throws', () => {
    expect(() => detPow(-1, 2)).toThrow(RangeError);
    expect(() => detPow(0.85, -1)).toThrow(RangeError);
    expect(() => detPow(Number.NaN, 1)).toThrow(RangeError);
    expect(() => detPow(0.85, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
