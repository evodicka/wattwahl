import type { Scenario } from '../../src/domain';
import { exampleScenario } from './exampleScenario';

// Scenarios for the plan of the offer (test cases 12 and 16 of the
// specification), as the optimizer tests build them: one mechanism at a time.

/**
 * No extra mileage, no maintenance, no warranty budget, SoH fixed at the
 * start and mild weather all year; the test changes what it tests.
 */
export function isolatedScenario(
  change: (scenario: Scenario) => void,
): Scenario {
  const scenario = exampleScenario();
  scenario.extraMileage.kmPerMonth = { city: 0, rural: 0, highway: 0 };
  scenario.iceVehicle.maintenancePerKm = 0;
  scenario.parameters.evMaintenancePerKm = 0;
  scenario.parameters.warrantyBudgetAsTarget = false;
  scenario.parameters.sohReference = 'start';
  scenario.parameters.monthlyTempC = Array.from({ length: 12 }, () => 23);
  change(scenario);
  return scenario;
}

const highway = (km: number) => ({ city: 0, rural: 0, highway: km });

/** TC12: Monday with only A staffed and A not drivable in January: the EV rests then. */
export const winterRest = () =>
  isolatedScenario((s) => {
    s.workplaces.a = {
      ...s.workplaces.a,
      name: 'Büro',
      weekdays: ['mon'],
      freeDaysPerYear: 0,
      commute: highway(80),
    };
    s.workplaces.b = {
      ...s.workplaces.b,
      name: 'Werk',
      weekdays: ['tue'],
      freeDaysPerYear: 0,
      commute: { city: 5, rural: 5, highway: 10 },
    };
    s.parameters.monthlyTempC[0] = -10;
  });

/** TC16: with both staffed on Monday the plan is E→B, A alone is E→A. */
export const planPerState = () =>
  isolatedScenario((s) => {
    s.workplaces.a = {
      ...s.workplaces.a,
      name: 'Büro',
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      freeDaysPerYear: 30,
    };
    s.workplaces.b = {
      ...s.workplaces.b,
      name: 'Werk',
      weekdays: ['mon', 'thu'],
      freeDaysPerYear: 10,
      commute: highway(80),
    };
  });
