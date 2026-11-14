import {
  createCandidateTemplate,
  createLeaseTierTemplate,
  type Candidate,
  type Scenario,
} from '../../src/domain';
import { exampleScenario } from './exampleScenario';

// The measurement scenario of Q1 (architecture 10): 10 candidates, each with a
// purchase and 4 lease tiers, in 3 price cases (50 offers, 150 results). The
// profile is the example one: A Monday to Friday, B Tuesday and Thursday, both
// 50 to 60 km a day, extra mileage every month. The candidates differ in
// capacity, range, price, age and warranty so that the option sets and plans
// differ. Everything is arithmetic on the index: no randomness, same data
// every run. All values are fictional.

const id = (kind: number, index: number): string =>
  `00000000-0000-4000-8000-${String(kind * 1000 + index).padStart(12, '0')}`;

/** Candidate `index` of 0 to 9: 58 to 103 kWh, 3 new cars then used ones from the 8th. */
export function q1Candidate(index: number): Candidate {
  const capacity = 58 + 5 * index;
  const used = index >= 7;
  const range = (kmPerKwh: number, coldShare: number) => ({
    mild: Math.round(capacity * kmPerKwh),
    cold: Math.round(capacity * kmPerKwh * coldShare),
  });
  const candidate: Candidate = {
    ...createCandidateTemplate(id(1, index)),
    name: `Candidate ${index + 1}`,
    condition: used ? 'used' : 'new',
    purchasePrice: 32000 + 3500 * index,
    firstRegistration: used ? { month: 3, year: 2023 } : null,
    mileageKm: used ? 15000 * (index - 6) : 0,
    netCapacityKwh: capacity,
    rangeKm: {
      city: range(7.2, 0.72),
      highway: range(4.6, 0.73),
      combined: range(5.8, 0.72),
    },
    sohKnownPct: index === 8 ? 93 : null,
    vehicleWarranty: used
      ? { years: 1 + (index % 2), km: 40000 }
      : { years: 3 + (index % 3), km: 100000 },
    batteryWarranty: used ? { years: 5, km: 100000 } : { years: 8, km: 160000 },
    leaseTiers: [10000, 15000, 20000, 25000].map((tierKm, tier) => ({
      ...createLeaseTierTemplate(id(2, index * 10 + tier), tierKm),
      monthlyRate: 280 + 12 * index + 25 * tier,
      termMonths: 36,
      downPayment: 1500 + 100 * index,
      extraKmPrice: 0.08,
      underKmRefund: 0.04,
    })),
  };
  return candidate;
}

export function q1Scenario(): Scenario {
  const scenario = exampleScenario();
  scenario.name = 'Q1 measurement scenario';
  scenario.candidates = Array.from({ length: 10 }, (_, index) =>
    q1Candidate(index),
  );
  return scenario;
}
