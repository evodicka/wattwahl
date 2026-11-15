import { describe, expect, it } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import { DEFAULT_DEVICE_SETTINGS } from '../domain';
import {
  addCandidate,
  addLeaseTier,
  deleteCandidate,
  duplicateCandidate,
  removeLeaseTier,
  setCandidateCondition,
} from './candidates';
import {
  controlledWorker,
  fakeRepository,
  spawnSequence,
} from './__tests__/fakes';
import { loaded } from './scenarioSlice';
import { selectActiveScenario } from './selectors';
import { createAppStore } from './store';

// S18: candidate list edits of the active scenario.

function setup() {
  let counter = 0;
  const store = createAppStore({
    repository: fakeRepository(),
    spawnWorker: spawnSequence(controlledWorker()),
    now: () => new Date('2026-11-14T11:04:00Z'),
    randomId: () =>
      `50000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  });
  const scenario = exampleScenario();
  store.dispatch(
    loaded({
      scenarios: [scenario],
      readOnly: [],
      invalid: [],
      settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: scenario.id },
    }),
  );
  const active = () => {
    const found = selectActiveScenario(store.getState());
    if (!found) throw new Error('no active scenario');
    return found;
  };
  return { store, active, original: scenario };
}

describe('S18: candidates of the active scenario', () => {
  it('adds an empty candidate at the end and marks the scenario dirty', () => {
    const { store, active, original } = setup();
    const id = store.dispatch(addCandidate());
    expect(active().candidates.map((c) => c.id)).toEqual([
      original.candidates[0]?.id,
      id,
    ]);
    expect(active().candidates[1]?.purchasePrice).toBeNull();
    expect(active()).not.toBe(original);
    expect(store.getState().scenario.dirty).toEqual([original.id]);
  });

  it('duplicates a candidate with new ids for it and its lease tiers', () => {
    const { store, active, original } = setup();
    const source = original.candidates[0];
    if (!source) throw new Error('no candidate');
    const id = store.dispatch(
      duplicateCandidate(source.id, 'Example EV (Kopie)'),
    );
    const copy = active().candidates.find((c) => c.id === id);
    expect(copy?.name).toBe('Example EV (Kopie)');
    expect(copy?.purchasePrice).toBe(source.purchasePrice);
    expect(copy?.leaseTiers[0]?.id).not.toBe(source.leaseTiers[0]?.id);
    expect(copy?.leaseTiers[0]?.monthlyRate).toBe(399);
    // The original is untouched.
    expect(active().candidates[0]).toBe(source);
  });

  it('deletes a candidate and ignores an unknown id', () => {
    const { store, active, original } = setup();
    const id = original.candidates[0]?.id ?? '';
    expect(store.dispatch(deleteCandidate('unknown'))).toBe(false);
    expect(store.dispatch(deleteCandidate(id))).toBe(true);
    expect(active().candidates).toEqual([]);
  });

  it('clears the fields of a used car when the condition becomes new', () => {
    const { store, active, original } = setup();
    const id = original.candidates[0]?.id ?? '';
    store.dispatch(setCandidateCondition(id, 'used'));
    expect(active().candidates[0]?.condition).toBe('used');
    store.dispatch(setCandidateCondition(id, 'new'));
    const candidate = active().candidates[0];
    expect(candidate).toMatchObject({
      condition: 'new',
      firstRegistration: null,
      mileageKm: 0,
      sohKnownPct: null,
    });
  });

  it('adds lease tiers with the first free preset, up to four', () => {
    const { store, active, original } = setup();
    const id = original.candidates[0]?.id ?? '';
    // The example has 15.000; the first free preset is 10.000.
    store.dispatch(addLeaseTier(id));
    expect(
      active().candidates[0]?.leaseTiers.map((t) => t.tierKmPerYear),
    ).toEqual([15000, 10000]);
    store.dispatch(addLeaseTier(id));
    store.dispatch(addLeaseTier(id));
    expect(
      active().candidates[0]?.leaseTiers.map((t) => t.tierKmPerYear),
    ).toEqual([15000, 10000, 20000, 25000]);
    // A fifth lease offer cannot be added.
    expect(store.dispatch(addLeaseTier(id))).toBeNull();
    expect(active().candidates[0]?.leaseTiers).toHaveLength(4);
  });

  it('removes a lease tier', () => {
    const { store, active, original } = setup();
    const candidate = original.candidates[0];
    const tier = candidate?.leaseTiers[0];
    if (!candidate || !tier) throw new Error('no tier');
    store.dispatch(removeLeaseTier(candidate.id, tier.id));
    expect(active().candidates[0]?.leaseTiers).toEqual([]);
  });

  it('a lease offer that cannot be added leaves the scenario untouched', () => {
    const { store, active, original } = setup();
    const id = original.candidates[0]?.id ?? '';
    for (let i = 0; i < 3; i += 1) store.dispatch(addLeaseTier(id));
    const before = active();
    store.dispatch({ type: 'noop' });
    expect(store.dispatch(addLeaseTier(id))).toBeNull();
    expect(active()).toBe(before);
  });
});
