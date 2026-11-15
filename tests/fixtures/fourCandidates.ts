import type { Scenario } from '../../src/domain';
import { exampleCandidate, exampleScenario } from './exampleScenario';

const ID_B = '00000000-0000-4000-8000-0000000000b2';
const ID_C = '00000000-0000-4000-8000-0000000000c3';

/** The example candidate, a cheap one, an incomplete one and one that cannot do a day. */
export function scenarioWithFour(): Scenario {
  const scenario = exampleScenario();
  const base = exampleCandidate();
  scenario.candidates = [
    ...scenario.candidates,
    {
      ...base,
      id: ID_B,
      name: 'Model B',
      purchasePrice: 25000,
      leaseTiers: [],
    },
    {
      ...base,
      id: ID_C,
      name: 'Model C',
      netCapacityKwh: null,
      leaseTiers: [],
    },
    {
      ...base,
      id: '00000000-0000-4000-8000-0000000000d4',
      name: 'Model D',
      leaseTiers: [],
      rangeKm: {
        city: { mild: 40, cold: 30 },
        highway: { mild: 40, cold: 30 },
        combined: { mild: 40, cold: 30 },
      },
    },
  ];
  return scenario;
}
