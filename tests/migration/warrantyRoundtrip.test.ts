import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { remainingWarranty } from '../../src/core/optimizer/warranty';
import { CandidateComputeSchema, upgradeScenario } from '../../src/domain';

// The v1 -> v2 migration turns the stored remaining warranty into the normal
// one. Derived again by the core, it must give the old remaining warranty
// (docs/change-garantie.md). Across src/domain and src/core, so it lives here.

const MIGRATION_MONTH = { month: 11, year: 2026 };

function readV1(): {
  schemaVersion: number;
  data: {
    candidates: {
      vehicleWarranty: { years: number; km: number };
      batteryWarranty: { years: number; km: number };
    }[];
  };
} {
  const url = new URL(
    '../../src/domain/__fixtures__/scenario.v1.json',
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, 'utf8'));
}

describe('C1b: migration v1 -> v2 keeps the remaining warranty', () => {
  const record = readV1();
  const before = record.data.candidates[0];
  const result = upgradeScenario(record, { migrationMonth: MIGRATION_MONTH });
  if (result.status !== 'ok') throw new Error(`not ok: ${result.status}`);
  const { scenario } = result;
  const candidate = CandidateComputeSchema.parse(scenario.candidates[0]);
  const derive = (part: 'vehicle' | 'battery') =>
    remainingWarranty(
      part,
      part === 'vehicle'
        ? candidate.vehicleWarranty
        : candidate.batteryWarranty,
      candidate,
      scenario.parameters.warrantyReferenceMonth,
    );

  it('C1b: the battery derives 3 years / 60,000 km again, within the tolerance of 8.4', () => {
    const battery = derive('battery');
    expect(battery.years).toBeCloseTo(before?.batteryWarranty.years ?? NaN, 9);
    expect(battery.km).toBe(before?.batteryWarranty.km);
  });

  it('C1b: the expired vehicle warranty (0 years / 0 km) stays expired with exactly 0', () => {
    const vehicle = derive('vehicle');
    expect(vehicle).toEqual({ years: 0, km: 0 });
  });
});
