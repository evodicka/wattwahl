import { beforeAll, describe, expect, it } from 'vitest';
import {
  exportWith,
  loadExportScenario,
} from '../../tests/helpers/exportScenario';
import { expectSpec } from '../../tests/helpers/specTolerance';
import {
  listOffers,
  type Offer,
  type OfferResult,
  type OkOfferResult,
  type Scenario,
} from '../domain';
import { ComputeCache, Trace, canonicalJson, computeOffer } from './index';

// Change C3b (docs/change-soh-plan.md), test cases 24 and 25 of the
// specification and the rules of the comparison, on the export of the
// published app.

const offersOf = (scenario: Scenario): Offer[] =>
  scenario.candidates.flatMap((candidate) => listOffers(candidate));
const named = (scenario: Scenario, name: string, kind = 'purchase'): Offer => {
  const candidate = scenario.candidates.find((c) => c.name === name);
  const offer = candidate
    ? listOffers(candidate).find((o) => o.kind === kind)
    : undefined;
  if (!offer) throw new Error(`no ${kind} offer of ${name}`);
  return offer;
};
const ok = (result: OfferResult): OkOfferResult => {
  if (result.status !== 'ok') throw new Error(`not ok: ${result.status}`);
  return result;
};
/** The result without `planSwitch`, as canonical text. */
const withoutSwitch = (result: OfferResult): string =>
  canonicalJson({ ...result, planSwitch: undefined });

describe('C3b: mode switch on the export', () => {
  let base: Scenario;
  beforeAll(() => {
    base = loadExportScenario();
  });
  const modes = (scenario: Scenario) => ({
    fixed: exportWith(scenario, { sohPlanMode: 'fixed', sohReference: 'end' }),
    switch: exportWith(scenario, { sohPlanMode: 'switch' }),
  });

  it('TC24: with R = 0 mode switch equals mode fixed with reference "Ende", apart from planSwitch, whatever reference is stored', () => {
    for (const stored of ['end', 'start'] as const) {
      const sc = exportWith(base, { minReserveKm: 0, sohReference: stored });
      const { fixed, switch: switched } = modes(sc);
      for (const offer of offersOf(sc)) {
        for (const priceCase of [
          'mid',
          'evFavorable',
          'evUnfavorable',
        ] as const) {
          const a = computeOffer(fixed, offer, priceCase);
          const b = computeOffer(switched, offer, priceCase);
          expect(withoutSwitch(b)).toBe(withoutSwitch(a));
          expect(ok(a).planSwitch).toBeNull();
          expect(ok(b).planSwitch).toMatchObject({
            chosen: 'fixed',
            events: [],
          });
        }
      }
    }
  });

  it('TC25: with R = 10 mode switch is never worse than mode fixed with reference "Ende" and cheaper for the Corsas', () => {
    const sc = exportWith(base, { minReserveKm: 10 });
    const { fixed, switch: switched } = modes(sc);
    let cheaper = 0;
    for (const offer of offersOf(sc)) {
      const a = ok(computeOffer(fixed, offer, 'mid'));
      const b = ok(computeOffer(switched, offer, 'mid'));
      expect(b.costs.total).toBeLessThanOrEqual(a.costs.total + 0.01);
      if (b.costs.total < a.costs.total - 0.01) cheaper++;
    }
    expect(cheaper).toBeGreaterThanOrEqual(1);
    // The values of the core, to the cent (the spec takes them from here).
    const total = (scenario: Scenario, name: string) =>
      ok(computeOffer(scenario, named(scenario, name), 'mid')).costs.total;
    expectSpec(total(switched, 'Opel Corsa 2023'), '27.007,35');
    expectSpec(total(fixed, 'Opel Corsa 2023'), '27.998,83');
    expectSpec(total(switched, 'Opel Corsa 2024'), '30.137,42');
    expectSpec(total(fixed, 'Opel Corsa 2024'), '30.496,83');
    // The new cars do not tip: both modes give the same result.
    const mg4 = named(sc, 'MG4 Urban');
    expect(withoutSwitch(computeOffer(switched, mg4, 'mid'))).toBe(
      withoutSwitch(computeOffer(fixed, mg4, 'mid')),
    );
  });

  it('the plan with switch points is chosen for the Corsa 2023 at R = 10 and its figures follow the simulation', () => {
    const sc = exportWith(base, { minReserveKm: 10, sohPlanMode: 'switch' });
    const result = ok(computeOffer(sc, named(sc, 'Opel Corsa 2023'), 'mid'));
    const planSwitch = result.planSwitch;
    if (!planSwitch) throw new Error('no planSwitch');
    expect(planSwitch.chosen).toBe('switch');
    expectSpec(planSwitch.events[0]?.month ?? NaN, '30,47');
    expect(planSwitch.events[0]?.entries).toEqual([
      { weekday: 'wed', month: 0, state: 'onlyA', from: 'evA', to: 'rest' },
      { weekday: 'thu', month: 0, state: 'onlyA', from: 'evA', to: 'rest' },
      { weekday: 'fri', month: 0, state: 'onlyA', from: 'evA', to: 'rest' },
    ]);
    expect(planSwitch.switchTargetCost).toBe(result.costs.total);
    expect(planSwitch.fixedTargetCost).not.toBeNull();
    // K_EV is the time-weighted average of the rates, below the 19.055 at the start;
    // K_EV + K_ICE stays the total of the profile.
    expectSpec(result.evKmPerYear, '17.027');
    expect(result.evKmPerYear).toBeLessThan(19055);
    const plain = ok(
      computeOffer(
        exportWith(sc, { sohPlanMode: 'fixed' }),
        named(sc, 'Opel Corsa 2023'),
        'mid',
      ),
    );
    expect(result.iceKmPerYear + result.evKmPerYear).toBeCloseTo(
      plain.iceKmPerYear + plain.evKmPerYear,
      6,
    );
    // The suitability is checked at the start, the odometer follows the phases.
    expect(result.sohCheck).toBeCloseTo(
      result.timeline.points[0]?.soh ?? NaN,
      12,
    );
    expect(result.evOdometerEnd).toBeCloseTo(
      19000 + (result.evKmPerYear * 96) / 12,
      6,
    );
    expect(result.sohEnd).toBeLessThan(result.sohCheck);
    expect(result.minReserve?.reserveKm).toBeGreaterThanOrEqual(10);
    for (const cell of result.reserves) {
      expect(cell.belowMinReserve).toBe(
        cell.reserveKm < 10 && cell.reserveKm >= 0,
      );
    }
  });

  it('a switch plan that runs out of options is not admissible: the result is the fixed plan, with the time', () => {
    const sc = exportWith(base, { minReserveKm: 54 });
    const { fixed, switch: switched } = modes(sc);
    const offer = named(sc, 'Opel Corsa 2023');
    const a = computeOffer(fixed, offer, 'mid');
    const b = computeOffer(switched, offer, 'mid');
    expect(withoutSwitch(b)).toBe(withoutSwitch(a));
    const planSwitch = ok(b).planSwitch;
    expect(planSwitch?.chosen).toBe('fixed');
    expect(planSwitch?.switchTargetCost).toBeNull();
    expectSpec(planSwitch?.infeasibleAfterMonths ?? NaN, '71,31');
  });

  it('if neither plan is admissible the offer is unsuitable and the reason names the month the last way tips', () => {
    const sc = exportWith(base, { minReserveKm: 58, sohPlanMode: 'switch' });
    const result = computeOffer(sc, named(sc, 'Opel Corsa 2023'), 'mid');
    if (result.status !== 'unsuitable') throw new Error(result.status);
    expect(result.reason).toMatchObject({ kind: 'both', afterMonths: 54 });
    // Mode fixed names no time.
    const plain = computeOffer(
      exportWith(sc, { sohPlanMode: 'fixed' }),
      named(sc, 'Opel Corsa 2023'),
      'mid',
    );
    if (plain.status !== 'unsuitable') throw new Error(plain.status);
    expect(plain.reason).not.toHaveProperty('afterMonths');
  });

  it('the strict mode checks over time: it is the strict mode with reference "Ende" and names the month the way tips', () => {
    const strict = exportWith(base, { strictMode: true, minReserveKm: 10 });
    const { fixed, switch: switched } = modes(strict);
    const offer = named(strict, 'Opel Corsa 2023');
    expect(withoutSwitch(computeOffer(switched, offer, 'mid'))).toBe(
      withoutSwitch(computeOffer(fixed, offer, 'mid')),
    );
    expect(ok(computeOffer(switched, offer, 'mid')).planSwitch).toMatchObject({
      chosen: 'fixed',
      events: [],
    });
    const tipping = exportWith(strict, { minReserveKm: 14 });
    const result = computeOffer(
      exportWith(tipping, { sohPlanMode: 'switch' }),
      offer,
      'mid',
    );
    if (result.status !== 'unsuitable') throw new Error(result.status);
    expect(result.reason).toMatchObject({
      kind: 'strict',
      way: 'a',
      month: 0,
      afterMonths: 13,
    });
  });

  it('Q5: the result is the same with and without a trace and with a cache', () => {
    for (const minReserveKm of [0, 10, 54]) {
      const sc = exportWith(base, { minReserveKm, sohPlanMode: 'switch' });
      const cache = new ComputeCache();
      for (const offer of offersOf(sc)) {
        const plain = computeOffer(sc, offer, 'mid');
        expect(canonicalJson(computeOffer(sc, offer, 'mid', { cache }))).toBe(
          canonicalJson(plain),
        );
        expect(
          canonicalJson(computeOffer(sc, offer, 'mid', { trace: new Trace() })),
        ).toBe(canonicalJson(plain));
      }
    }
  });
});
