// Deterministic power function (architecture 8.4, ADR-10). Math.pow is only
// reproducible per engine, so powers with integer or twelfth exponents are
// built from + - * / alone, which IEEE 754 rounds the same in every engine.

/** Newton steps for the twelfth root; fixed so the result never depends on a tolerance. */
export const ROOT12_STEPS = 5;

const TWELVE_POW_TOLERANCE = 1e-9;
/** 4096 = 2^12, so the twelfth root of 4096^k is exactly 2^k. */
const RANGE_STEP = 4096;

/** 2^(e/12) for e = 0..11, start values for the twelfth root. */
const TWO_POW_TWELFTHS = [
  1, 1.0594630943592953, 1.122462048309373, 1.189207115002721,
  1.2599210498948732, 1.3348398541700344, 1.4142135623730951,
  1.4983070768766815, 1.5874010519681994, 1.681792830507429, 1.7817974362806785,
  1.8877486253633868,
];

/** `base^n` for a whole `n >= 0` by square-and-multiply. */
function intPow(base: number, n: number): number {
  let result = 1;
  let factor = base;
  let rest = n;
  while (rest > 0) {
    if (rest % 2 === 1) result *= factor;
    rest = floorDiv2(rest);
    if (rest > 0) factor *= factor;
  }
  return result;
}

const floorDiv2 = (n: number): number => (n - (n % 2)) / 2;

/** Twelfth root of `a > 0` by range reduction and Newton's method. */
function root12(a: number): number {
  let reduced = a;
  let scale = 1;
  while (reduced < 1) {
    reduced *= RANGE_STEP;
    scale /= 2;
  }
  while (reduced >= RANGE_STEP) {
    reduced /= RANGE_STEP;
    scale *= 2;
  }
  // reduced is in [1, 4096) = 2^e * m with m in [1, 2). The start value
  // 2^(e/12) * chord(m) is within about 1 % of the root and below it, so five
  // Newton steps (error roughly squared and times 5.5 per step) reach full
  // double precision. The table is only a start value; Newton fixes its errors.
  let exponent = 0;
  let mantissa = reduced;
  while (mantissa >= 2) {
    mantissa /= 2;
    exponent += 1;
  }
  let x = (TWO_POW_TWELFTHS[exponent] ?? 1) * (1 + (mantissa - 1) * 0.0595);
  for (let step = 0; step < ROOT12_STEPS; step++) {
    x = (11 * x + reduced / intPow(x, 11)) / 12;
  }
  return x * scale;
}

/**
 * `base^exponent` for `base >= 0` and an exponent in whole twelfths
 * (12 · exponent is an integer), as in (1 − w)^(D/12). Whole exponents take
 * the exact integer path. Anything else throws, as it is a programming error.
 */
export function detPow(base: number, exponent: number): number {
  if (!Number.isFinite(base) || base < 0) {
    throw new RangeError(`detPow: invalid base ${base}`);
  }
  if (!Number.isFinite(exponent) || exponent < 0) {
    throw new RangeError(`detPow: invalid exponent ${exponent}`);
  }
  const twelfths = Math.floor(exponent * 12 + 0.5);
  if (Math.abs(exponent * 12 - twelfths) > TWELVE_POW_TOLERANCE) {
    throw new RangeError(`detPow: exponent ${exponent} is not in twelfths`);
  }
  if (twelfths === 0) return 1;
  if (base === 0) return 0;

  const whole = Math.floor(twelfths / 12);
  const rest = twelfths - 12 * whole;
  const wholePart = intPow(base, whole);
  return rest === 0 ? wholePart : wholePart * intPow(root12(base), rest);
}
