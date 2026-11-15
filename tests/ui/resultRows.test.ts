import { describe, expect, it } from 'vitest';
import type { OkOfferResult } from '../../src/domain';
import { resultRows, warrantyStatus } from '../../src/ui/forms/resultRows';
import { exampleScenario } from '../fixtures/exampleScenario';
import { scenarioWithFour } from '../fixtures/fourCandidates';
import { computeResults } from '../fixtures/offerResults';

// S19: rows of the result table from the offer results (spec "Ergebnistabelle").

describe('S19: rows of the result table', () => {
  const scenario = scenarioWithFour();
  const results = computeResults(scenario);
  const rows = resultRows(scenario, results, 'mid');

  it('lists every offer once: the purchase and each lease tier', () => {
    expect(
      rows.map((r) => `${r.candidateName}|${r.leaseTierKm}`).sort(),
    ).toEqual([
      'Example EV|15000',
      'Example EV|null',
      'Model B|null',
      'Model C|null',
      'Model D|null',
    ]);
  });

  it('puts suitable offers first by ascending total cost, then the others in list order', () => {
    const totals = rows.flatMap((r) => (r.total === null ? [] : [r.total]));
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(rows.slice(0, totals.length).every((r) => r.total !== null)).toBe(
      true,
    );
    expect(rows.slice(totals.length).map((r) => r.candidateName)).toEqual([
      'Model C',
      'Model D',
    ]);
    expect(rows.slice(totals.length).map((r) => r.suitability)).toEqual([
      'incomplete',
      'unsuitable',
    ]);
  });

  it('names the missing fields of an incomplete offer and not of the others', () => {
    const incomplete = rows.find((r) => r.candidateName === 'Model C');
    expect(incomplete?.missing).toEqual(['candidates[2].netCapacityKwh']);
    expect(incomplete?.profileMissing).toBe(false);
    expect(rows.find((r) => r.candidateName === 'Model B')?.missing).toEqual(
      [],
    );
  });

  const find = (list: typeof rows) =>
    list.find((r) => r.candidateName === 'Model B' && r.leaseTierKm === null);

  it('gives the span as the totals of "E-Auto günstig" and "E-Auto ungünstig", low to high', () => {
    const favorable = find(resultRows(scenario, results, 'evFavorable'))?.total;
    const unfavorable = find(
      resultRows(scenario, results, 'evUnfavorable'),
    )?.total;
    const range = find(rows)?.range;
    if (favorable == null || unfavorable == null || !range)
      throw new Error('no totals');
    expect(range).toEqual({
      min: Math.min(favorable, unfavorable),
      max: Math.max(favorable, unfavorable),
    });
    expect(range.min).toBeLessThan(range.max);
    // An incomplete offer has no span.
    expect(rows.find((r) => r.suitability === 'incomplete')?.range).toBeNull();
  });

  it('shows the total of the chosen price case', () => {
    const mid = find(rows)?.total;
    const favorable = find(resultRows(scenario, results, 'evFavorable'))?.total;
    const unfavorable = find(
      resultRows(scenario, results, 'evUnfavorable'),
    )?.total;
    expect(new Set([mid, favorable, unfavorable]).size).toBe(3);
  });

  it('leaves out an offer that has no result in the chosen price case', () => {
    expect(resultRows(scenario, results, 'slider')).toEqual([]);
  });
});

describe('S19: warranty column', () => {
  const ok = (
    base: OkOfferResult,
    patch: Partial<OkOfferResult>,
  ): OkOfferResult => ({
    ...base,
    ...patch,
  });
  const scenario = exampleScenario();
  const results = computeResults(scenario);
  const purchase = Object.values(results)
    .map((byCase) => byCase.mid)
    .find(
      (r): r is OkOfferResult => r?.status === 'ok' && r.kind === 'purchase',
    );
  if (!purchase) throw new Error('no purchase result');

  it('"ohne Garantie" when no warranty runs', () => {
    expect(
      warrantyStatus(
        ok(purchase, { warranty: { ...purchase.warranty, noWarranty: true } }),
      ),
    ).toEqual({ kind: 'noWarranty' });
  });

  it('a lease with no warranty left still says that its tier is the limit', () => {
    expect(
      warrantyStatus(
        ok(purchase, {
          kind: 'lease',
          warranty: { ...purchase.warranty, noWarranty: true },
        }),
      ),
    ).toEqual({ kind: 'leaseLimit' });
  });

  it('a lease is held to its tier, not to the budget', () => {
    expect(warrantyStatus(ok(purchase, { kind: 'lease' }))).toEqual({
      kind: 'leaseLimit',
    });
  });

  it('shows the budget cost when the budget binds, and "im Budget" when it does not', () => {
    const withBudget = {
      ...purchase.warranty,
      noWarranty: false,
      budgetExceeded: false,
      budgetKmPerYear: 20000,
    };
    expect(
      warrantyStatus(
        ok(purchase, {
          warranty: withBudget,
          costs: { ...purchase.costs, budgetExtraCost: 640 },
        }),
      ),
    ).toEqual({ kind: 'budgetActive', extraCost: 640 });
    expect(
      warrantyStatus(
        ok(purchase, {
          warranty: withBudget,
          costs: { ...purchase.costs, budgetExtraCost: 0 },
        }),
      ),
    ).toEqual({ kind: 'inBudget' });
    expect(
      warrantyStatus(
        ok(purchase, { warranty: { ...withBudget, budgetExceeded: true } }),
      ),
    ).toEqual({ kind: 'exceeded' });
  });

  it('says nothing without an active budget', () => {
    expect(
      warrantyStatus(
        ok(purchase, {
          warranty: {
            ...purchase.warranty,
            noWarranty: false,
            budgetExceeded: false,
            budgetKmPerYear: null,
          },
        }),
      ),
    ).toEqual({ kind: 'none' });
  });
});
