import { describe, expect, it } from 'vitest';
import {
  listOffers,
  type OfferResult,
  type OkOfferResult,
} from '../../src/domain';
import {
  candidateStatus,
  unsuitableText,
} from '../../src/ui/forms/candidateStatus';
import { labelOfPath } from '../../src/ui/forms/fieldLabels';
import { exampleCandidate, exampleScenario } from '../fixtures/exampleScenario';
import { computeResults } from '../fixtures/offerResults';

// S18: the status of a candidate card and the names of missing fields.

const ID_B = '00000000-0000-4000-8000-0000000000b2';

describe('S18: candidate status from the results (price case "Mittel")', () => {
  it('a complete candidate is suitable with its cheapest offer', () => {
    const scenario = exampleScenario();
    const [candidate] = scenario.candidates;
    if (!candidate) throw new Error('no candidate');
    const status = candidateStatus(candidate, 0, computeResults(scenario));
    expect(['suitable', 'tight']).toContain(status.kind);
    if (status.kind !== 'suitable' && status.kind !== 'tight') return;
    const costs = Object.values(computeResults(scenario)).flatMap((byCase) =>
      byCase.mid?.status === 'ok' ? [byCase.mid.costs.total] : [],
    );
    expect(status.best.costs.total).toBe(Math.min(...costs));
  });

  it('without results the card has no status yet', () => {
    const scenario = exampleScenario();
    const [candidate] = scenario.candidates;
    if (!candidate) throw new Error('no candidate');
    expect(candidateStatus(candidate, 0, undefined)).toEqual({
      kind: 'pending',
    });
  });

  it('an incomplete candidate names its missing fields, the other is computed (Z02)', () => {
    const scenario = exampleScenario();
    const incomplete = {
      ...exampleCandidate(),
      id: ID_B,
      name: 'Incomplete',
      netCapacityKwh: null,
      leaseTiers: [],
      rangeKm: {
        ...exampleCandidate().rangeKm,
        highway: { mild: 300, cold: null },
      },
    };
    scenario.candidates = [...scenario.candidates, incomplete];
    const results = computeResults(scenario);
    const [first, second] = scenario.candidates;
    if (!first || !second) throw new Error('missing candidates');

    expect(candidateStatus(first, 0, results).kind).not.toBe('incomplete');
    const status = candidateStatus(second, 1, results);
    expect(status).toMatchObject({ kind: 'incomplete', profileMissing: false });
    if (status.kind !== 'incomplete') return;
    expect(
      status.missing.map((path) => labelOfPath(path, scenario)).sort(),
    ).toEqual(['Netto-Akkukapazität', 'Reichweite Autobahn kalt'].sort());
  });

  it('a gap in the Fahrprofil makes the candidate incomplete without listing it on the card', () => {
    const scenario = exampleScenario();
    scenario.iceVehicle = { ...scenario.iceVehicle, maintenancePerKm: null };
    const [candidate] = scenario.candidates;
    if (!candidate) throw new Error('no candidate');
    const status = candidateStatus(candidate, 0, computeResults(scenario));
    expect(status).toEqual({
      kind: 'incomplete',
      missing: [],
      profileMissing: true,
    });
  });

  it('a candidate that cannot do a day is unsuitable, with the reason as text (Z03)', () => {
    const scenario = exampleScenario();
    const [candidate] = scenario.candidates;
    if (!candidate) throw new Error('no candidate');
    scenario.candidates = [
      {
        ...candidate,
        leaseTiers: [],
        rangeKm: {
          city: { mild: 40, cold: 30 },
          highway: { mild: 40, cold: 30 },
          combined: { mild: 40, cold: 30 },
        },
      },
    ];
    const status = candidateStatus(
      scenario.candidates[0] ?? candidate,
      0,
      computeResults(scenario),
    );
    expect(status.kind).toBe('unsuitable');
    if (status.kind !== 'unsuitable') return;
    expect(unsuitableText(status.reason)).toMatch(/nicht fahrbar|Streng|SoH/);
  });
});

describe('S18: aggregation over the offers of a candidate', () => {
  const setup = () => {
    const scenario = exampleScenario();
    const [candidate] = scenario.candidates;
    if (!candidate) throw new Error('no candidate');
    const [purchase, lease] = listOffers(candidate);
    if (!purchase || !lease) throw new Error('no offers');
    const results = computeResults(scenario);
    const ok = (id: string): OkOfferResult => {
      const result = results[id]?.mid;
      if (result?.status !== 'ok') throw new Error('not ok');
      return result;
    };
    return { candidate, purchase, lease, results, ok };
  };
  const incomplete = (base: OfferResult): OfferResult =>
    ({
      ...base,
      status: 'incomplete',
      issues: [
        { path: 'candidates[0].leaseTiers[0].monthlyRate', message: 'x' },
      ],
    }) as OfferResult;
  const unsuitable = (base: OfferResult): OfferResult =>
    ({
      ...base,
      status: 'unsuitable',
      reason: { kind: 'coupling', soh: 80 },
    }) as OfferResult;

  it('is "knapp" when the cell of the smallest reserve is yellow', () => {
    const { candidate, purchase, results, ok } = setup();
    const base = ok(purchase.offerId);
    const min = base.minReserve;
    if (!min) throw new Error('no minimum reserve');
    const yellow: OkOfferResult = {
      ...base,
      reserves: base.reserves.map((cell) =>
        cell.way === min.way && cell.month === min.month
          ? { ...cell, light: 'yellow' }
          : cell,
      ),
    };
    const status = candidateStatus(candidate, 0, {
      ...results,
      [purchase.offerId]: { mid: yellow },
      // The cheaper lease must not decide here.
      [setup().lease.offerId]: {},
    });
    expect(status.kind).toBe('tight');
  });

  it('a suitable purchase stays suitable when a lease tier is incomplete', () => {
    const { candidate, purchase, lease, results } = setup();
    const leaseMid = results[lease.offerId]?.mid;
    if (!leaseMid) throw new Error('no lease result');
    const status = candidateStatus(candidate, 0, {
      [purchase.offerId]: results[purchase.offerId] ?? {},
      [lease.offerId]: { mid: incomplete(leaseMid) },
    });
    expect(status.kind === 'suitable' || status.kind === 'tight').toBe(true);
  });

  it('incomplete wins over unsuitable when there is no suitable offer', () => {
    const { candidate, purchase, lease, results } = setup();
    const purchaseMid = results[purchase.offerId]?.mid;
    const leaseMid = results[lease.offerId]?.mid;
    if (!purchaseMid || !leaseMid) throw new Error('no results');
    const status = candidateStatus(candidate, 0, {
      [purchase.offerId]: { mid: unsuitable(purchaseMid) },
      [lease.offerId]: { mid: incomplete(leaseMid) },
    });
    expect(status.kind).toBe('incomplete');
  });

  it('names the reason of the purchase offer first', () => {
    const { candidate, purchase, lease, results } = setup();
    const purchaseMid = results[purchase.offerId]?.mid;
    const leaseMid = results[lease.offerId]?.mid;
    if (!purchaseMid || !leaseMid) throw new Error('no results');
    const leaseReason: OfferResult = {
      ...leaseMid,
      status: 'unsuitable',
      reason: { kind: 'strict', way: 'a', month: 0, reserveKm: -3, soh: 90 },
    } as OfferResult;
    const status = candidateStatus(candidate, 0, {
      [lease.offerId]: { mid: leaseReason },
      [purchase.offerId]: { mid: unsuitable(purchaseMid) },
    });
    expect(status).toMatchObject({
      kind: 'unsuitable',
      reason: { kind: 'coupling' },
    });
  });

  it('reads only the price case "Mittel"', () => {
    const { candidate, purchase, results } = setup();
    const base = results[purchase.offerId];
    if (!base?.mid) throw new Error('no result');
    expect(
      candidateStatus(candidate, 0, {
        [purchase.offerId]: { evFavorable: base.mid, evUnfavorable: base.mid },
      }),
    ).toEqual({ kind: 'pending' });
  });

  it('writes the reason of an unsuitable offer as an exact sentence', () => {
    expect(unsuitableText({ kind: 'coupling', soh: 0.8 })).toBe(
      'Die Wege sind fahrbar, aber mit den E-Auto-Kilometern sinkt der Akku auf 80,0\u00a0% SoH und reicht dann nicht mehr.',
    );
    expect(
      unsuitableText({
        kind: 'strict',
        way: 'b',
        month: 0,
        reserveKm: -12,
        soh: 90,
      }),
    ).toBe(
      'Streng-Modus: Weg B im Januar nicht fahrbar, Reserve \u221212\u00a0km.',
    );
  });
});

describe('S18: names of the fields a path points to', () => {
  it.each([
    ['candidates[0].netCapacityKwh', 'Netto-Akkukapazität'],
    ['candidates[2].purchasePrice', 'Kaufpreis'],
    ['candidates[2].firstRegistration', 'Erstzulassung'],
    ['candidates[1].rangeKm.highway.cold', 'Reichweite Autobahn kalt'],
    ['candidates.1.rangeKm.combined.mild', 'Reichweite Kombiniert mild'],
    ['candidates[0].vehicleWarranty.km', 'Fahrzeuggarantie Garantie-Kilometer'],
    ['iceVehicle.maintenancePerKm', 'Wartung und Reifen'],
    ['parameters.electricityPrice.mid', 'Mittel'],
    ['workplaces.a.commute.city', 'Arbeitsstätte A: Weg Stadt'],
  ])('%s is "%s"', (path, label) => {
    expect(labelOfPath(path)).toBe(label);
  });

  it('names the lease tier by its kilometres', () => {
    const scenario = exampleScenario();
    expect(
      labelOfPath('candidates[0].leaseTiers[0].monthlyRate', scenario),
    ).toBe('Leasing 15.000\u00a0km: Monatliche Rate');
  });

  it('returns an unknown path as it is', () => {
    expect(labelOfPath('somewhere.else')).toBe('somewhere.else');
  });
});
