import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { exampleScenarioCompute } from '../../../tests/fixtures/exampleScenario';
import { Trace } from '../trace';
import {
  electricityFactor,
  electricityFactorWindow,
  maintenanceFactor,
  maintenanceFactorWindow,
  petrolFactor,
  petrolFactorWindow,
  type PriceSelection,
  resolvePrices,
  yearShares,
} from './prices';

const { iceVehicle, parameters } = exampleScenarioCompute();
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

describe('F7: price factors', () => {
  it('F7.qy: 30 months are two full years and half a year', () => {
    const trace = new Trace();
    expect(yearShares(30, trace)).toEqual([1, 1, 0.5]);
    expect(trace.entries.map((e) => e.formula)).toEqual([
      'F7.qy',
      'F7.qy',
      'F7.qy',
    ]);
  });

  it('F7.qy: the shares add up to D/12 for any D', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1200 }), (months) => {
        expect(sum(yearShares(months))).toBeCloseTo(months / 12, 10);
      }),
    );
  });

  it('F7.Fb: 10 % escalation over 30 months is 1 + 1.1 + 0.5 · 1.21', () => {
    const trace = new Trace();
    expect(petrolFactor(10, 30, trace)).toBeCloseTo(2.705, 12);
    expect(trace.entries.at(-1)?.formula).toBe('F7.Fb');
  });

  it('F7.Fs: electricity uses its own formula ID', () => {
    const trace = new Trace();
    electricityFactor(5, 48, trace);
    expect(trace.entries.at(-1)?.formula).toBe('F7.Fs');
  });

  it('F7: without escalation both factors equal F_m = D/12', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1200 }), (months) => {
        const fm = maintenanceFactor(months);
        expect(petrolFactor(0, months)).toBeCloseTo(fm, 10);
        expect(electricityFactor(0, months)).toBeCloseTo(fm, 10);
      }),
    );
  });

  it('F7.Fm: D/12 with its formula ID', () => {
    const trace = new Trace();
    expect(maintenanceFactor(48, trace)).toBe(4);
    expect(trace.entries[0]?.formula).toBe('F7.Fm');
  });

  it('F7: a price falling by 100 % per year only counts the first year', () => {
    expect(petrolFactor(-100, 36)).toBeCloseTo(1, 12);
  });
});

describe('price cases (spec "Optimierung")', () => {
  const priced = {
    ...iceVehicle,
    petrolPrice: { min: 1.7, mid: 1.9, max: 2.1 },
  };

  it('mid uses both mid prices', () => {
    const prices = resolvePrices(priced, parameters, { priceCase: 'mid' });
    expect([prices.petrolPrice, prices.electricityPrice]).toEqual([1.9, 0.3]);
  });

  it('"E-Auto günstig" is petrol maximum and electricity minimum', () => {
    const prices = resolvePrices(priced, parameters, {
      priceCase: 'evFavorable',
    });
    expect([prices.petrolPrice, prices.electricityPrice]).toEqual([2.1, 0.25]);
  });

  it('"E-Auto ungünstig" is petrol minimum and electricity maximum', () => {
    const prices = resolvePrices(priced, parameters, {
      priceCase: 'evUnfavorable',
    });
    expect([prices.petrolPrice, prices.electricityPrice]).toEqual([1.7, 0.35]);
  });

  it('slider takes the slider prices and escalations', () => {
    const slider = {
      petrol: 2.5,
      electricity: 0.4,
      petrolEscalationPct: 3,
      electricityEscalationPct: 2,
    };
    expect(
      resolvePrices(priced, parameters, {
        priceCase: 'slider',
        sliderPrices: slider,
      }),
    ).toEqual({
      petrolPrice: 2.5,
      electricityPrice: 0.4,
      petrolEscalationPct: 3,
      electricityEscalationPct: 2,
    });
  });

  it('slider without slider prices does not type-check', () => {
    // @ts-expect-error the slider case requires `sliderPrices`
    const selection: PriceSelection = { priceCase: 'slider' };
    expect(selection.priceCase).toBe('slider');
  });

  it('the scenario escalation rates apply to every case but the slider', () => {
    const escalating = { ...priced, petrolEscalationPct: 4 };
    const prices = resolvePrices(escalating, parameters, { priceCase: 'mid' });
    expect(prices.petrolEscalationPct).toBe(4);
    expect(prices.electricityEscalationPct).toBe(
      parameters.electricityEscalationPct,
    );
  });
});

describe('C3b: price factors for a window [t1, t2) (test case 26)', () => {
  it('TC26: F_s at 3 % over 48 months is 4,1836, split at 24 it is 2,0300 and 2,1536', () => {
    expect(electricityFactor(3, 48)).toBeCloseTo(4.1836, 4);
    expect(electricityFactorWindow(3, 0, 24)).toBeCloseTo(2.03, 4);
    expect(electricityFactorWindow(3, 24, 48)).toBeCloseTo(2.1536, 4);
  });

  it('the window [0, D) is the full-period factor, bit for bit', () => {
    for (const months of [1, 12, 30, 96, 100]) {
      expect(electricityFactorWindow(3, 0, months)).toBe(
        electricityFactor(3, months),
      );
      expect(petrolFactorWindow(2.5, 0, months)).toBe(
        petrolFactor(2.5, months),
      );
      expect(maintenanceFactorWindow(0, months)).toBe(
        maintenanceFactor(months),
      );
    }
  });

  it('a switch in the middle of a year splits that year exactly', () => {
    // [6, 18): half of year 1 at 1, half of year 2 at 1,03.
    expect(electricityFactorWindow(3, 6, 18)).toBeCloseTo(0.5 + 0.5 * 1.03, 12);
    expect(maintenanceFactorWindow(6, 18)).toBe(1);
  });

  it.each([0, 3, -2])(
    'the factors of the windows of a split add up to the full period at %s %%',
    (pct) => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 240 }),
          fc.double({ min: 0.01, max: 0.99, noNaN: true }),
          (months, at) => {
            const t = at * months;
            const whole = electricityFactor(pct, months);
            expect(
              electricityFactorWindow(pct, 0, t) +
                electricityFactorWindow(pct, t, months),
            ).toBeCloseTo(whole, 9);
            expect(
              petrolFactorWindow(pct, 0, t) +
                petrolFactorWindow(pct, t, months),
            ).toBeCloseTo(petrolFactor(pct, months), 9);
            expect(
              maintenanceFactorWindow(0, t) +
                maintenanceFactorWindow(t, months),
            ).toBeCloseTo(maintenanceFactor(months), 9);
          },
        ),
      );
    },
  );
});
