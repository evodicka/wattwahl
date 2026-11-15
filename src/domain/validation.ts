import { z } from 'zod';
import { monthsBetween, type Scenario } from './schema';

// Input parsing and plausibility warnings (spec "Validierung", architecture 8.6).
// Results carry codes, not texts: the UI maps a code to a German message.

export const DecimalResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.number() }),
  z.object({ ok: z.literal(false), error: z.enum(['empty', 'invalid']) }),
]);
export type DecimalResult = z.infer<typeof DecimalResultSchema>;

// A leading zero group is never a thousands group, so "0.500" is 0.5.
const THOUSANDS = /^[1-9]\d{0,2}(\.\d{3})+$/;
const THOUSANDS_WITH_DECIMALS = /^[1-9]\d{0,2}(\.\d{3})+,\d+$/;
const PLAIN = /^\d+([.,]\d+)?$/;

/**
 * Reads a number typed with a decimal comma or point. A dot followed by exactly
 * three digits is a thousands separator ("40.000" is 40000). Ambiguous or
 * unreadable input is an error, never `NaN`.
 */
export function parseDecimal(input: string): DecimalResult {
  const text = input.trim();
  if (text === '') return { ok: false, error: 'empty' };
  const negative = text.startsWith('-') || text.startsWith('−');
  const body = negative ? text.slice(1) : text;

  let value: number;
  if (THOUSANDS.test(body)) {
    value = Number(body.replaceAll('.', ''));
  } else if (THOUSANDS_WITH_DECIMALS.test(body)) {
    value = Number(body.replaceAll('.', '').replace(',', '.'));
  } else if (PLAIN.test(body)) {
    value = Number(body.replace(',', '.'));
  } else {
    return { ok: false, error: 'invalid' };
  }
  if (!Number.isFinite(value)) return { ok: false, error: 'invalid' };
  return { ok: true, value: negative && value !== 0 ? -value : value };
}

export const NumberFieldResultSchema = z.discriminatedUnion('ok', [
  /** `value` is `null` for an empty optional field. */
  z.object({ ok: z.literal(true), value: z.number().nullable() }),
  z.object({
    ok: z.literal(false),
    error: z.enum(['required', 'invalid', 'belowMin', 'aboveMax']),
  }),
]);
export type NumberFieldResult = z.infer<typeof NumberFieldResultSchema>;

/** Parses a form field and checks required and range (the check on leaving a field). */
export function parseNumberField(
  input: string,
  rules: {
    required: boolean;
    min?: number;
    /** If true, `min` itself is not allowed (value must be greater). */
    minExclusive?: boolean;
    max?: number;
  },
): NumberFieldResult {
  const parsed = parseDecimal(input);
  if (!parsed.ok) {
    if (parsed.error === 'empty') {
      return rules.required
        ? { ok: false, error: 'required' }
        : { ok: true, value: null };
    }
    return { ok: false, error: 'invalid' };
  }
  const { value } = parsed;
  if (rules.min !== undefined) {
    const below = rules.minExclusive ? value <= rules.min : value < rules.min;
    if (below) return { ok: false, error: 'belowMin' };
  }
  if (rules.max !== undefined && value > rules.max) {
    return { ok: false, error: 'aboveMax' };
  }
  return { ok: true, value };
}

export const WarningSchema = z.object({
  code: z.enum([
    'coldAboveMild',
    'capacityAbove200',
    'commuteAbove300',
    'firstRegistrationAfterReferenceMonth',
  ]),
  /** Dot path of the field in the scenario, for example `candidates.0.netCapacityKwh`. */
  path: z.string(),
});
export type Warning = z.infer<typeof WarningSchema>;

const MAX_PLAUSIBLE_CAPACITY_KWH = 200;
const MAX_PLAUSIBLE_COMMUTE_KM = 300;

/**
 * Plausibility warnings of the spec. They never block anything: the result has
 * no influence on the schema checks. Empty fields are skipped.
 */
export function checkWarnings(scenario: Scenario): Warning[] {
  const warnings: Warning[] = [];

  scenario.candidates.forEach((candidate, index) => {
    const base = `candidates.${index}`;
    for (const road of ['city', 'highway', 'combined'] as const) {
      const { mild, cold } = candidate.rangeKm[road];
      if (mild !== null && cold !== null && cold > mild) {
        warnings.push({
          code: 'coldAboveMild',
          path: `${base}.rangeKm.${road}`,
        });
      }
    }
    if (
      candidate.netCapacityKwh !== null &&
      candidate.netCapacityKwh > MAX_PLAUSIBLE_CAPACITY_KWH
    ) {
      warnings.push({
        code: 'capacityAbove200',
        path: `${base}.netCapacityKwh`,
      });
    }
    // The remaining warranty then counts with age 0 (spec "Validierung").
    if (
      candidate.firstRegistration !== null &&
      monthsBetween(
        candidate.firstRegistration,
        scenario.parameters.warrantyReferenceMonth,
      ) < 0
    ) {
      warnings.push({
        code: 'firstRegistrationAfterReferenceMonth',
        path: `${base}.firstRegistration`,
      });
    }
  });

  for (const key of ['a', 'b'] as const) {
    const { city, rural, highway } = scenario.workplaces[key].commute;
    const distance = (city ?? 0) + (rural ?? 0) + (highway ?? 0);
    if (distance > MAX_PLAUSIBLE_COMMUTE_KM) {
      warnings.push({
        code: 'commuteAbove300',
        path: `workplaces.${key}.commute`,
      });
    }
  }
  return warnings;
}
