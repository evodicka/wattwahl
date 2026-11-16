import { describe, expect, it } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import {
  CandidateComputeSchema,
  ScenarioComputeSchema,
  ScenarioSchema,
} from './schema';
import {
  checkWarnings,
  parseDecimal,
  parseNumberField,
  type DecimalResult,
} from './validation';

const ok = (value: number): DecimalResult => ({ ok: true, value });
const fail = (error: 'empty' | 'invalid'): DecimalResult => ({
  ok: false,
  error,
});

describe('TC15: input parsing', () => {
  it('TC15: "12,5" and "12.5" both parse to 12.5', () => {
    expect(parseDecimal('12,5')).toEqual(ok(12.5));
    expect(parseDecimal('12.5')).toEqual(ok(12.5));
  });

  it('TC15: a negative number is rejected with an error code', () => {
    const result = parseNumberField('-3', { required: true, min: 0 });
    expect(result).toEqual({ ok: false, error: 'belowMin' });
  });

  it('TC15: an empty required field is rejected with an error code', () => {
    expect(parseNumberField('  ', { required: true })).toEqual({
      ok: false,
      error: 'required',
    });
  });

  it('TC15: an empty optional field is accepted as empty', () => {
    expect(parseNumberField('', { required: false })).toEqual({
      ok: true,
      value: null,
    });
  });
});

describe('S04: parseDecimal', () => {
  it.each([
    ['40.000', 40000],
    ['1.500', 1500],
    ['1.234.567', 1234567],
    ['1.234,5', 1234.5],
    ['12.50', 12.5],
    ['0,30', 0.3],
    ['0.500', 0.5],
    ['1,500', 1.5],
    ['7', 7],
    ['  8,25 ', 8.25],
    ['-3,5', -3.5],
    ['−3,5', -3.5],
  ])('S04: thousands separator and decimals: "%s" is %s', (text, expected) => {
    expect(parseDecimal(text)).toEqual(ok(expected));
  });

  it.each([
    'abc',
    '1,2,3',
    '1.2.3',
    '1,234.5',
    ',5',
    '.5',
    '+5',
    '12.',
    '--1',
    '-',
    '1e3',
  ])('S04: "%s" is invalid and never NaN', (text) => {
    expect(parseDecimal(text)).toEqual(fail('invalid'));
  });

  it('S04: an empty string is empty', () => {
    expect(parseDecimal('')).toEqual(fail('empty'));
  });

  it('S04: negative zero is plain zero', () => {
    expect(parseDecimal('-0')).toEqual(ok(0));
  });
});

describe('S04: parseNumberField', () => {
  it('rejects values outside the range', () => {
    expect(
      parseNumberField('0', { required: true, min: 0, minExclusive: true }),
    ).toEqual({ ok: false, error: 'belowMin' });
    expect(parseNumberField('101', { required: true, max: 100 })).toEqual({
      ok: false,
      error: 'aboveMax',
    });
    expect(parseNumberField('100', { required: true, max: 100 })).toEqual({
      ok: true,
      value: 100,
    });
  });

  it('reports unreadable text as invalid', () => {
    expect(parseNumberField('12a', { required: true })).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('S04: unreadable text in an optional field is invalid, not empty', () => {
    expect(parseNumberField('abc', { required: false })).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('S04: whitespace only in an optional field is empty', () => {
    expect(parseNumberField('   ', { required: false })).toEqual({
      ok: true,
      value: null,
    });
  });

  it('S04: min, max and minExclusive combine', () => {
    const rules = { required: true, min: 0, minExclusive: true, max: 100 };
    expect(parseNumberField('0', rules)).toEqual({
      ok: false,
      error: 'belowMin',
    });
    expect(parseNumberField('0,1', rules)).toEqual({ ok: true, value: 0.1 });
    expect(parseNumberField('100', rules)).toEqual({ ok: true, value: 100 });
    expect(parseNumberField('100,1', rules)).toEqual({
      ok: false,
      error: 'aboveMax',
    });
  });

  it('S04: a Unicode minus is read as negative', () => {
    expect(parseNumberField('−3', { required: true, min: 0 })).toEqual({
      ok: false,
      error: 'belowMin',
    });
    expect(parseNumberField('−3', { required: true })).toEqual({
      ok: true,
      value: -3,
    });
  });
});

describe('S04: plausibility warnings', () => {
  it('has no warning for the example data', () => {
    expect(checkWarnings(exampleScenario())).toEqual([]);
  });

  it('S04: cold range above mild range warns per road type', () => {
    const scenario = exampleScenario();
    const candidate = scenario.candidates[0];
    if (!candidate) throw new Error('example candidate missing');
    candidate.rangeKm.highway = { mild: 300, cold: 320 };
    expect(checkWarnings(scenario)).toEqual([
      { code: 'coldAboveMild', path: 'candidates.0.rangeKm.highway' },
    ]);
  });

  it('S04: capacity above 200 kWh warns, exactly 200 does not', () => {
    const scenario = exampleScenario();
    const candidate = scenario.candidates[0];
    if (!candidate) throw new Error('example candidate missing');
    candidate.netCapacityKwh = 200;
    expect(checkWarnings(scenario)).toEqual([]);
    candidate.netCapacityKwh = 200.1;
    expect(checkWarnings(scenario)).toEqual([
      { code: 'capacityAbove200', path: 'candidates.0.netCapacityKwh' },
    ]);
  });

  it('S04: a one-way commute above 300 km warns for that workplace', () => {
    const scenario = exampleScenario();
    scenario.workplaces.b.commute = { city: 100, rural: 100, highway: 101 };
    expect(checkWarnings(scenario)).toEqual([
      { code: 'commuteAbove300', path: 'workplaces.b.commute' },
    ]);
  });

  it('S04: cold above mild also warns for the combined range', () => {
    const scenario = exampleScenario();
    const candidate = scenario.candidates[0];
    if (!candidate) throw new Error('example candidate missing');
    candidate.rangeKm.combined = { mild: 300, cold: 320 };
    expect(checkWarnings(scenario)).toEqual([
      { code: 'coldAboveMild', path: 'candidates.0.rangeKm.combined' },
    ]);
  });

  it('S04: cold equal to mild does not warn', () => {
    const scenario = exampleScenario();
    const candidate = scenario.candidates[0];
    if (!candidate) throw new Error('example candidate missing');
    candidate.rangeKm.city = { mild: 300, cold: 300 };
    expect(checkWarnings(scenario)).toEqual([]);
  });

  it('C2b: a Kilometerreserve above 100 km warns, 100 km itself does not', () => {
    const scenario = exampleScenario();
    scenario.parameters.minReserveKm = 100;
    expect(checkWarnings(scenario)).toEqual([]);
    scenario.parameters.minReserveKm = 100.1;
    expect(checkWarnings(scenario)).toEqual([
      { code: 'minReserveAbove100', path: 'parameters.minReserveKm' },
    ]);
  });

  it('C3b: the SoH plan has no plausibility warning, and the schema takes only fixed or switch', () => {
    const scenario = exampleScenario();
    for (const mode of ['fixed', 'switch'] as const) {
      scenario.parameters.sohPlanMode = mode;
      expect(checkWarnings(scenario)).toEqual([]);
      expect(ScenarioSchema.safeParse(scenario).success).toBe(true);
    }
    const invalid = { ...scenario.parameters, sohPlanMode: 'maybe' };
    expect(
      ScenarioSchema.safeParse({ ...scenario, parameters: invalid }).success,
    ).toBe(false);
  });

  it('S04: a commute of exactly 300 km does not warn', () => {
    const scenario = exampleScenario();
    scenario.workplaces.b.commute = { city: 100, rural: 100, highway: 100 };
    expect(checkWarnings(scenario)).toEqual([]);
  });

  it('S04: the warning path carries the index of the second candidate', () => {
    const scenario = exampleScenario();
    const first = scenario.candidates[0];
    if (!first) throw new Error('example candidate missing');
    scenario.candidates.push(structuredClone(first));
    const second = scenario.candidates[1];
    if (!second) throw new Error('second candidate missing');
    second.netCapacityKwh = 250;
    expect(checkWarnings(scenario)).toEqual([
      { code: 'capacityAbove200', path: 'candidates.1.netCapacityKwh' },
    ]);
  });

  it('skips empty fields', () => {
    const scenario = exampleScenario();
    scenario.workplaces.a.commute = { city: null, rural: null, highway: null };
    const candidate = scenario.candidates[0];
    if (!candidate) throw new Error('example candidate missing');
    candidate.rangeKm.city = { mild: null, cold: 100 };
    candidate.netCapacityKwh = null;
    expect(checkWarnings(scenario)).toEqual([]);
  });

  it('S04: warnings do not change the schema result', () => {
    const scenario = exampleScenario();
    const { candidates, ...profile } = scenario;
    const candidate = candidates[0];
    if (!candidate) throw new Error('example candidate missing');
    const before = [
      ScenarioSchema.safeParse(scenario).success,
      ScenarioComputeSchema.safeParse(profile).success,
      CandidateComputeSchema.safeParse(candidate).success,
    ];

    candidate.rangeKm.city = { mild: 300, cold: 420 };
    candidate.netCapacityKwh = 250;
    scenario.workplaces.a.commute = { city: 100, rural: 100, highway: 120 };
    expect(checkWarnings(scenario)).toHaveLength(3);

    const { candidates: _unused, ...profileAfter } = scenario;
    void _unused;
    expect([
      ScenarioSchema.safeParse(scenario).success,
      ScenarioComputeSchema.safeParse(profileAfter).success,
      CandidateComputeSchema.safeParse(candidate).success,
    ]).toEqual(before);
    expect(before).toEqual([true, true, true]);
  });

  it('C1b: a first registration after the reference month warns, the same month does not', () => {
    const scenario = exampleScenario();
    scenario.parameters.warrantyReferenceMonth = { month: 3, year: 2025 };
    const candidate = scenario.candidates[0];
    if (!candidate) throw new Error('example candidate missing');
    candidate.condition = 'used';
    candidate.mileageKm = 10000;

    candidate.firstRegistration = { month: 3, year: 2025 };
    expect(checkWarnings(scenario)).toEqual([]);

    candidate.firstRegistration = { month: 4, year: 2025 };
    expect(checkWarnings(scenario)).toEqual([
      {
        code: 'firstRegistrationAfterReferenceMonth',
        path: 'candidates.0.firstRegistration',
      },
    ]);
    // Only a hint: the candidate still computes (with age 0).
    expect(CandidateComputeSchema.safeParse(candidate).success).toBe(true);
  });
});
