import {
  LEASE_TIER_PRESETS,
  createCandidateTemplate,
  createLeaseTierTemplate,
  type Candidate,
  type Scenario,
} from '../domain';
import { scenarioUpdated } from './scenarioSlice';
import { selectActiveScenario } from './selectors';
import type { AppThunk } from './types';

// Edits of the candidate list of the active scenario (S18). A scenario is
// replaced as a whole (8.5); ids of candidates and lease tiers are made only
// here, from the store's id source (8.1).

/** At most four lease tiers per candidate (spec "Leasingangebot"). */
export const MAX_LEASE_TIERS = 4;

/** Applies `change` to the active scenario; `null` leaves it as it is. */
function editCandidates(
  change: (scenario: Scenario) => Scenario | null,
): AppThunk<boolean> {
  return (dispatch, getState) => {
    const scenario = selectActiveScenario(getState());
    const next = scenario ? change(scenario) : null;
    if (!next) return false;
    dispatch(scenarioUpdated(next));
    return true;
  };
}

const replaceCandidate = (
  scenario: Scenario,
  id: string,
  change: (candidate: Candidate) => Candidate,
): Scenario | null => {
  if (!scenario.candidates.some((candidate) => candidate.id === id)) {
    return null;
  }
  return {
    ...scenario,
    candidates: scenario.candidates.map((candidate) =>
      candidate.id === id ? change(candidate) : candidate,
    ),
  };
};

/** Adds an empty candidate at the end of the list; returns its id. */
export function addCandidate(): AppThunk<string | null> {
  return (dispatch, getState, { randomId }) => {
    const candidate = createCandidateTemplate(randomId());
    const added = dispatch(
      editCandidates((scenario) => ({
        ...scenario,
        candidates: [...scenario.candidates, candidate],
      })),
    );
    return added ? candidate.id : null;
  };
}

/** Copies a candidate with its lease tiers under new ids; returns the id of the copy. */
export function duplicateCandidate(
  id: string,
  name: string,
): AppThunk<string | null> {
  return (dispatch, getState, { randomId }) => {
    const copyId = randomId();
    const added = dispatch(
      editCandidates((scenario) => {
        const original = scenario.candidates.find((c) => c.id === id);
        if (!original) return null;
        const copy: Candidate = {
          ...original,
          id: copyId,
          name,
          rangeKm: structuredClone(original.rangeKm),
          vehicleWarranty: { ...original.vehicleWarranty },
          batteryWarranty: { ...original.batteryWarranty },
          leaseTiers: original.leaseTiers.map((tier) => ({
            ...tier,
            id: randomId(),
          })),
        };
        return { ...scenario, candidates: [...scenario.candidates, copy] };
      }),
    );
    return added ? copyId : null;
  };
}

export function deleteCandidate(id: string): AppThunk<boolean> {
  return editCandidates((scenario) =>
    scenario.candidates.some((candidate) => candidate.id === id)
      ? {
          ...scenario,
          candidates: scenario.candidates.filter((c) => c.id !== id),
        }
      : null,
  );
}

/**
 * A new car has no first registration, no SoH and 0 km (spec "Kandidat"), so
 * the fields only a used car has are cleared when the condition becomes new.
 */
export function setCandidateCondition(
  id: string,
  condition: Candidate['condition'],
): AppThunk<boolean> {
  return editCandidates((scenario) =>
    replaceCandidate(scenario, id, (candidate) =>
      condition === 'new'
        ? {
            ...candidate,
            condition,
            firstRegistration: null,
            mileageKm: 0,
            sohKnownPct: null,
          }
        : { ...candidate, condition },
    ),
  );
}

/**
 * Adds a lease offer with the first preset tier (10.000, 15.000, ...) the
 * candidate does not have yet. Does nothing at four tiers.
 */
export function addLeaseTier(candidateId: string): AppThunk<string | null> {
  return (dispatch, getState, { randomId }) => {
    const tierId = randomId();
    const added = dispatch(
      editCandidates((scenario) =>
        replaceCandidate(scenario, candidateId, (candidate) => {
          const used = new Set(
            candidate.leaseTiers.map((t) => t.tierKmPerYear),
          );
          const free = LEASE_TIER_PRESETS.find((km) => !used.has(km));
          if (
            candidate.leaseTiers.length >= MAX_LEASE_TIERS ||
            free === undefined
          ) {
            return candidate;
          }
          return {
            ...candidate,
            leaseTiers: [
              ...candidate.leaseTiers,
              createLeaseTierTemplate(tierId, free),
            ],
          };
        }),
      ),
    );
    return added &&
      selectActiveScenario(getState())
        ?.candidates.find((c) => c.id === candidateId)
        ?.leaseTiers.some((t) => t.id === tierId)
      ? tierId
      : null;
  };
}

export function removeLeaseTier(
  candidateId: string,
  tierId: string,
): AppThunk<boolean> {
  return editCandidates((scenario) =>
    replaceCandidate(scenario, candidateId, (candidate) => ({
      ...candidate,
      leaseTiers: candidate.leaseTiers.filter((tier) => tier.id !== tierId),
    })),
  );
}
