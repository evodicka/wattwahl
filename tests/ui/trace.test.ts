import { describe, expect, it } from 'vitest';
import { FORMULA_IDS, type OkOfferResult } from '../../src/domain';
import de from '../../src/i18n/de.json';
import { formatTraceValue } from '../../src/ui/forms/traceFormat';
import { traceView } from '../../src/ui/forms/traceView';
import { sliderRanges } from '../../src/ui/forms/sliderRanges';
import { exampleScenario } from '../fixtures/exampleScenario';
import { explainOffer } from '../fixtures/offerResults';

// S21: the Rechenweg as the UI shows it, and the slider ranges.

const scenario = exampleScenario();
const offerId = `${scenario.candidates[0]?.id}:purchase`;
const { result, trace } = explainOffer(scenario, offerId, 'mid');
if (result.status !== 'ok') throw new Error('not ok');
const ok: OkOfferResult = result;
const view = traceView(trace, ok);

describe('S21: Rechenweg view (Q6)', () => {
  it('lists a step for every number the result table shows', () => {
    const paths = view.numbers.map((r) => r.entry.resultPath);
    // Total, EV and petrol kilometres, planned odometer, smallest reserve and the warranty budget.
    for (const path of [
      'costs.acquisition',
      'costs.electricity',
      'costs.petrol',
      'costs.maintenance',
      'evKmPerYear',
      'iceOdometerEnd',
      'warranty.budgetKmPerYear',
    ]) {
      expect(paths, path).toContain(path);
    }
    const min = ok.minReserve;
    const cell = ok.reserves.findIndex(
      (r) => r.way === min?.way && r.month === min?.month,
    );
    expect(paths).toContain(`reserves[${cell}].reserveKm`);
    expect(paths).toContain(`reserves[${cell}].reservePct`);
  });

  it('every listed step has a formula id and the inputs it was computed from', () => {
    for (const row of view.numbers) {
      expect(FORMULA_IDS).toContain(row.entry.formula);
      expect(Object.keys(row.entry.inputs).length).toBeGreaterThan(0);
    }
  });

  it('names one path once, and lists only the smallest reserve cell of the 24', () => {
    const paths = view.numbers.map((r) => r.entry.resultPath);
    expect(new Set(paths).size).toBe(paths.length);
    expect(
      paths.filter((p) => p?.startsWith('reserves[')).length,
    ).toBeLessThanOrEqual(3);
  });

  it('groups every step of the trace by formula family in the order of the specification', () => {
    expect(view.groups.map((g) => g.family)).toEqual([
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
      'F7',
      'F8',
      'OPT',
    ]);
    expect(view.groups.reduce((n, g) => n + g.rows.length, 0)).toBe(
      trace.length,
    );
    for (const group of view.groups) {
      for (const row of group.rows)
        expect(row.entry.formula.startsWith(group.family)).toBe(true);
    }
  });

  it('marks steps that use a placeholder parameter as "Annahme"', () => {
    const first = (formula: string) =>
      view.groups
        .flatMap((g) => g.rows)
        .find((r) => r.entry.formula === formula);
    expect(first('F3.u')?.assumption).toBe(true); // safety buffer
    expect(first('F2.slope')?.assumption).toBe(true); // km to the SoH limit
    expect(first('F1.w')?.assumption).toBe(true); // temperatures
    expect(first('F7.Fm')?.assumption).toBe(false);
    expect(first('F8.energy')?.assumption).toBe(false);
  });
});

describe('S21: value formatting', () => {
  const entry = (
    formula: string,
    value: number | boolean | string,
    inputs = {},
  ) => ({ formula, inputs, value }) as never;

  it('writes each value in the unit of its formula', () => {
    expect(formatTraceValue(entry('F3.u', 0.63))).toBe('0,63');
    expect(formatTraceValue(entry('F2.soh', 0.94001))).toBe('94,0 %');
    expect(formatTraceValue(entry('F2.slope', 7.5e-7))).toBe('7,5E−7');
    expect(formatTraceValue(entry('F8.purchase', 19119.75))).toBe('19.120 €');
    expect(formatTraceValue(entry('F4.c', 0.17647))).toBe(
      '17,6\u00a0kWh/100 km',
    );
    expect(formatTraceValue(entry('F4.evDayCost', 8.8976))).toBe('8,90 €');
    expect(formatTraceValue(entry('F1.R', 340))).toBe('340 km');
  });

  it('writes booleans and lights in words', () => {
    expect(formatTraceValue(entry('F3.suitable', true))).toBe('Ja');
    expect(formatTraceValue(entry('OPT.optionSet', false))).toBe('Nein');
    expect(formatTraceValue(entry('F3.trafficLight', 'green'))).toBe('Grün');
    expect(formatTraceValue(entry('F3.trafficLight', 'red'))).toBe('Rot');
  });

  it('writes the remaining warranty in years or km, as the step says', () => {
    expect(
      formatTraceValue(
        entry('OPT.remainingWarranty', 3, { quantity: 'years' }),
      ),
    ).toBe('3,0 Jahre');
    expect(
      formatTraceValue(
        entry('OPT.remainingWarranty', 60000, { quantity: 'km' }),
      ),
    ).toBe('60.000 km');
  });

  it('writes every value of a real trace without a raw number', () => {
    for (const entryOf of trace) {
      const text = formatTraceValue(entryOf);
      expect(text, entryOf.formula).not.toMatch(/\d\.\d{4,}/);
      expect(text, entryOf.formula).not.toBe('');
    }
  });
});

describe('S21: texts of every formula', () => {
  it('has a name and a formula text for every formula id', () => {
    const keys = FORMULA_IDS.map((id) => id.replace('.', '_'));
    const trace_ = de.ergebnis.detail.trace as unknown as {
      formula: Record<string, string>;
      formulaText: Record<string, string>;
    };
    for (const key of keys) {
      expect(trace_.formula[key], `name of ${key}`).toBeTruthy();
      expect(trace_.formulaText[key], `formula of ${key}`).toBeTruthy();
    }
    expect(Object.keys(trace_.formula)).toHaveLength(FORMULA_IDS.length);
    expect(Object.keys(trace_.formulaText)).toHaveLength(FORMULA_IDS.length);
  });
});

describe('S21: slider ranges', () => {
  const values = {
    petrol: 1.9,
    electricity: 0.3,
    petrolEscalationPct: 0,
    electricityEscalationPct: 0,
  };

  it('prices run from half the minimum to one and a half times the maximum in cents', () => {
    const ranges = sliderRanges(exampleScenario(), values);
    expect(ranges?.petrol).toEqual({
      min: 0.85,
      max: 3.15,
      step: 0.01,
      mid: 1.9,
    });
    expect(ranges?.electricity).toEqual({
      min: 0.12,
      max: 0.53,
      step: 0.01,
      mid: 0.3,
    });
  });

  it('escalations run from 0 to 10 % in steps of 0.5', () => {
    const ranges = sliderRanges(exampleScenario(), values);
    expect(ranges?.petrolEscalationPct).toEqual({
      min: 0,
      max: 10,
      step: 0.5,
      mid: 0,
    });
  });

  it('a range always holds the value of its slider', () => {
    const ranges = sliderRanges(exampleScenario(), {
      ...values,
      petrol: 5,
      petrolEscalationPct: 12,
      electricityEscalationPct: -2,
    });
    expect(ranges?.petrol.max).toBeGreaterThanOrEqual(5);
    expect(ranges?.petrolEscalationPct.max).toBe(12);
    expect(ranges?.electricityEscalationPct.min).toBe(-2);
  });

  it('has no ranges while a mid price is missing', () => {
    const scenario = exampleScenario();
    scenario.iceVehicle.petrolPrice = { min: null, mid: null, max: null };
    expect(sliderRanges(scenario, values)).toBeNull();
  });
});
