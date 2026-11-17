import { describe, expect, it } from 'vitest';
import { exampleScenario } from '../fixtures/exampleScenario';
import { computeResults } from '../fixtures/offerResults';
import { comparisonRows } from '../../src/ui/forms/comparisonView';
import type { Scenario } from '../../src/domain';

// S22: matching of offers between scenarios by candidate name and offer kind.

const ID_A = '00000000-0000-4000-8000-0000000000a1';
const ID_B = '00000000-0000-4000-8000-0000000000b1';
const named = (scenario: Scenario, id: string, name: string): Scenario => ({
  ...scenario,
  id,
  name,
});
const compared = (scenario: Scenario) => ({
  scenario,
  results: computeResults(scenario),
});

describe('S22: comparisonRows', () => {
  it('matches the same candidate name and kind across scenarios and gives the difference', () => {
    const a = named(exampleScenario(), ID_A, 'A');
    const b = named(
      {
        ...exampleScenario(),
        iceVehicle: {
          ...exampleScenario().iceVehicle,
          petrolPrice: { min: 2.6, mid: 3.1, max: 3.6 },
        },
      },
      ID_B,
      'B',
    );
    const rows = comparisonRows([compared(a), compared(b)]);
    const purchase = rows.find((r) => r.leaseTierKm === null);
    expect(purchase?.cells[0]).not.toBeNull();
    expect(purchase?.cells[1]).not.toBeNull();
    expect(purchase?.difference).toBeCloseTo(
      Math.abs(
        (purchase?.cells[0]?.total ?? 0) - (purchase?.cells[1]?.total ?? 0),
      ),
      6,
    );
    expect(purchase?.difference).toBeGreaterThan(0);
  });

  it('ignores case and edge spaces in names, and keeps lease tiers apart', () => {
    const base = exampleScenario();
    const a = named(base, ID_A, 'A');
    const b = named(
      {
        ...base,
        candidates: base.candidates.map((c) => ({
          ...c,
          id: `${c.id}-b`,
          name: `  ${c.name.toUpperCase()} `,
        })),
      },
      ID_B,
      'B',
    );
    const rows = comparisonRows([
      { scenario: a, results: computeResults(a) },
      { scenario: b, results: undefined },
    ]);
    // Every offer is one row, in both scenarios; b has no results yet.
    expect(rows.length).toBe(
      a.candidates
        .flatMap((c) => 1 + c.leaseTiers.length)
        .reduce((x, y) => x + y, 0),
    );
    expect(
      rows.every((r) => r.cells[1] === null && r.difference === null),
    ).toBe(true);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('an offer only one scenario has is a row with an empty cell and no difference', () => {
    const base = exampleScenario();
    const a = named(base, ID_A, 'A');
    const b = named(
      {
        ...base,
        candidates: base.candidates
          .slice(0, 1)
          .map((c) => ({ ...c, leaseTiers: [] })),
      },
      ID_B,
      'B',
    );
    const rows = comparisonRows([compared(a), compared(b)]);
    const onlyA = rows.filter((r) => r.cells[1] === null);
    if (a.candidates[0]?.leaseTiers.length) {
      expect(onlyA.length).toBeGreaterThan(0);
    }
    expect(onlyA.every((r) => r.difference === null)).toBe(true);
  });
});

describe('C4b: comparisonRows with lease offers hidden', () => {
  it('each scenario follows its own switch, so a lease row has a cell only where leases show', () => {
    const a = named(exampleScenario(), ID_A, 'A');
    const b = {
      ...named(exampleScenario(), ID_B, 'B'),
      includeLeaseOffers: false,
    };
    const rows = comparisonRows([compared(a), compared(b)]);
    const lease = rows.find((row) => row.leaseTierKm !== null);
    expect(lease?.cells[0]).not.toBeNull();
    expect(lease?.cells[1]).toBeNull();
    const purchase = rows.find((row) => row.leaseTierKm === null);
    expect(purchase?.cells.every((cell) => cell !== null)).toBe(true);
  });
});
