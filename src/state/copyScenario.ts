import type { Candidate, Scenario } from '../domain';

/**
 * A copy of a scenario under a new name. The copy gets new ids for itself, its
 * candidates and their lease tiers (ids come only from the store, 8.1); every
 * other value, the Stichtag included, is copied unchanged.
 */
export function copyScenario(
  scenario: Scenario,
  made: { name: string; newId: () => string },
): Scenario {
  const candidates = scenario.candidates.map((candidate): Candidate => ({
    ...candidate,
    id: made.newId(),
    leaseTiers: candidate.leaseTiers.map((tier) => ({
      ...tier,
      id: made.newId(),
    })),
  }));
  return { ...scenario, id: made.newId(), name: made.name, candidates };
}
