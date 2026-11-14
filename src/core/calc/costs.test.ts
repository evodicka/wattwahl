import { describe, expect, it } from 'vitest';
import {
  exampleCandidateCompute,
  exampleScenarioCompute,
} from '../../../tests/fixtures/exampleScenario';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import { MAX_COMPARISON_MONTHS } from '../../domain';
import { Trace } from '../trace';
import {
  effectiveDepreciationPct,
  effectiveEvMaintenancePerKm,
  energyCost,
  iceKmPerYear,
  iceOdometerEnd,
  leaseCost,
  maintenanceCost,
  purchaseCost,
} from './costs';

const candidate = exampleCandidateCompute();
const [firstTier] = candidate.leaseTiers;
if (!firstTier) throw new Error('The example candidate has a lease tier.');
const tier = firstTier;

describe('TC7: purchase (F8)', () => {
  it('TC7: 40,000 EUR at 15 % per year over 48 months leaves 20,880.25 EUR, cost 19,119.75 EUR', () => {
    const trace = new Trace();
    const cost = purchaseCost(40000, 15, 48, trace);
    expectSpec(cost, '19.119,75');
    expectSpec(40000 - cost, '20.880,25');
    expect(trace.entries.map((e) => e.formula)).toEqual(['F8.purchase']);
  });

  it('F8.purchase: a comparison that is not whole years uses the twelfth root', () => {
    expect(purchaseCost(40000, 15, 30)).toBeCloseTo(
      40000 - 40000 * Math.pow(0.85, 2.5),
      6,
    );
  });

  it('F8.purchase: the longest allowed comparison period stays within detPow', () => {
    expect(purchaseCost(40000, 15, MAX_COMPARISON_MONTHS)).toBeCloseTo(
      40000 - 40000 * Math.pow(0.85, 100),
      4,
    );
  });

  it('F8.purchase: 100 % depreciation loses the whole price', () => {
    expect(purchaseCost(40000, 100, 48)).toBe(40000);
  });
});

describe('TC8: lease (F8)', () => {
  it('TC8: rate and down payment 16,364 EUR, extra km 720 EUR, together 17,084 EUR', () => {
    const trace = new Trace();
    const lease = leaseCost(tier, 18000, 36, trace);
    expectSpec(lease.rateAndDownPayment, '16.364');
    expect(lease.extraKmPerYear).toBe(3000);
    expectSpec(lease.kmSettlement, '720');
    expectSpec(lease.total, '17.084');
    expect(trace.entries.map((e) => e.formula)).toEqual([
      'F8.extraKm',
      'F8.underKm',
      'F8.lease',
    ]);
  });

  it('F8.lease: driving less than the tier earns the refund', () => {
    const lease = leaseCost(tier, 12000, 36);
    expect(lease.underKmPerYear).toBe(3000);
    expect(lease.extraKmPerYear).toBe(0);
    expect(lease.kmSettlement).toBeCloseTo(-3 * 3000 * 0.04, 10);
  });

  it('F8.lease: a term shorter than D continues the lease on the same terms', () => {
    const short = { ...tier, termMonths: 24 };
    const lease = leaseCost(short, 15000, 48);
    expect(lease.rateAndDownPayment).toBeCloseTo(48 * (399 + 2000 / 24), 10);
  });
});

describe('TC17: petrol car mileage (F8)', () => {
  it('TC17: 120,000 km now and 8,000 km per year over 48 months end at 152,000 km', () => {
    const trace = new Trace();
    expect(iceOdometerEnd(120000, 8000, 48, trace)).toBe(152000);
    expect(trace.entries[0]?.formula).toBe('F8.iceOdometer');
  });
});

describe('F8: energy, maintenance and kilometres', () => {
  it('F8.energy: yearly quantity · price · factor, for both carriers', () => {
    const trace = new Trace();
    expect(energyCost('electricity', 2000, 0.3, 4, trace)).toBeCloseTo(
      2400,
      10,
    );
    expect(energyCost('petrol', 1000, 1.9, 4.2, trace)).toBeCloseTo(7980, 10);
    expect(trace.entries.map((e) => e.formula)).toEqual([
      'F8.energy',
      'F8.energy',
    ]);
  });

  it('F8.kIce and F8.maintenance: K_ICE = total - K_EV, maintenance does not escalate', () => {
    const trace = new Trace();
    const kIce = iceKmPerYear(18000, 10000, trace);
    expect(kIce).toBe(8000);
    expect(
      maintenanceCost(
        { ev: 10000, ice: kIce },
        { ev: 0.02, ice: 0.04 },
        4,
        trace,
      ),
    ).toBeCloseTo(4 * (200 + 320), 10);
    expect(trace.entries.map((e) => e.formula)).toEqual([
      'F8.kIce',
      'F8.maintenance',
    ]);
  });

  it('a candidate value overrides the scenario default for depreciation and maintenance', () => {
    const { parameters } = exampleScenarioCompute();
    const own = { depreciationPctPerYear: 12, maintenancePerKm: 0.03 };
    const none = { depreciationPctPerYear: null, maintenancePerKm: null };
    expect(effectiveDepreciationPct(own, parameters)).toBe(12);
    expect(effectiveDepreciationPct(none, parameters)).toBe(
      parameters.depreciationPctPerYear,
    );
    expect(effectiveEvMaintenancePerKm(own, parameters)).toBe(0.03);
    expect(effectiveEvMaintenancePerKm(none, parameters)).toBe(
      parameters.evMaintenancePerKm,
    );
  });
});
