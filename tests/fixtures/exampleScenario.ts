import {
  CandidateComputeSchema,
  ScenarioComputeSchema,
  createCandidateTemplate,
  createLeaseTierTemplate,
  createScenarioTemplate,
  type Candidate,
  type CandidateCompute,
  type ScenarioCompute,
  type Scenario,
  type YearMonth,
} from '../../src/domain';

// Shared example data of the spec test cases ("Gemeinsame Beispieldaten" plus
// the prices of test cases 4, 5, 7, 8, 9 and 17). All values are fictional.

export const EXAMPLE_IDS = {
  scenario: '00000000-0000-4000-8000-000000000001',
  candidate: '00000000-0000-4000-8000-000000000002',
  leaseTier: '00000000-0000-4000-8000-000000000003',
} as const;

/**
 * Fixed warranty reference month of the example scenario, as if it had been
 * created in March 2026: exactly 36 months after the first registration of the
 * used Q1 candidates (03/2023).
 */
export const EXAMPLE_REFERENCE_MONTH: YearMonth = { month: 3, year: 2026 };

/** 60 kWh, new, 40,000 EUR (TC7), one lease tier 15,000 km (TC8). */
export function exampleCandidate(): Candidate {
  return {
    ...createCandidateTemplate(EXAMPLE_IDS.candidate),
    name: 'Example EV',
    purchasePrice: 40000,
    netCapacityKwh: 60,
    rangeKm: {
      city: { mild: 420, cold: 300 },
      highway: { mild: 300, cold: 220 },
      combined: { mild: 360, cold: 260 },
    },
    vehicleWarranty: { years: 3, km: 100000 },
    batteryWarranty: { years: 8, km: 160000 },
    leaseTiers: [
      {
        ...createLeaseTierTemplate(EXAMPLE_IDS.leaseTier, 15000),
        monthlyRate: 399,
        termMonths: 36,
        downPayment: 2000,
        extraKmPrice: 0.08,
        underKmRefund: 0.04,
      },
    ],
  };
}

/** The example candidate as the core sees it: required fields set. */
export function exampleCandidateCompute(): CandidateCompute {
  return CandidateComputeSchema.parse(exampleCandidate());
}

/** Driving profile of TC4, TC5, TC9 and TC17 with one candidate. */
export function exampleScenario(): Scenario {
  const scenario = createScenarioTemplate({
    id: EXAMPLE_IDS.scenario,
    name: 'Example',
    currentMonth: EXAMPLE_REFERENCE_MONTH,
  });
  scenario.iceVehicle = {
    ...scenario.iceVehicle,
    name: 'Example petrol car',
    consumptionLPer100Km: { city: 8, rural: 6, highway: 7 },
    mileageKm: 120000,
    maintenancePerKm: 0.04,
    petrolPrice: { min: 1.7, mid: 1.9, max: 2.1 },
  };
  scenario.workplaces.a = {
    ...scenario.workplaces.a,
    name: 'Workplace A',
    commute: { city: 10, rural: 15, highway: 35 },
    weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    freeDaysPerYear: 30,
  };
  scenario.workplaces.b = {
    ...scenario.workplaces.b,
    name: 'Workplace B',
    commute: { city: 5, rural: 20, highway: 25 },
    weekdays: ['tue', 'thu'],
    freeDaysPerYear: 10,
  };
  scenario.extraMileage = {
    kmPerMonth: { city: 50, rural: 100, highway: 150 },
  };
  scenario.parameters = {
    ...scenario.parameters,
    // "Gemeinsame Beispieldaten": no highway discount and no cold reserve.
    highwayDiscountPct: 0,
    coldReserveK: 0,
    evMaintenancePerKm: 0.02,
    electricityPrice: { min: 0.25, mid: 0.3, max: 0.35 },
  };
  scenario.candidates = [exampleCandidate()];
  return scenario;
}

/** The example scenario as the core sees it (without candidates, required fields set). */
export function exampleScenarioCompute(): ScenarioCompute {
  return ScenarioComputeSchema.parse(exampleScenario());
}
