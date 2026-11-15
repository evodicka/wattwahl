import { describe, expect, it } from 'vitest';
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
