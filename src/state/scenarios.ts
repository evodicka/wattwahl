import { createScenarioTemplate } from '../domain';
import type { WriteResult } from '../storage';
import { copyScenario } from './copyScenario';
import { isNameTaken, uniqueName } from './names';
import {
  comparisonCleared,
  comparisonFailed,
  comparisonFinished,
  comparisonRequested,
  comparisonScenarioDone,
} from './resultSlice';
import {
  activeScenarioSet,
  scenarioAdded,
  scenarioRemoved,
  scenarioUpdated,
} from './scenarioSlice';
import { monthOf, selectActiveScenario, selectScenarios } from './selectors';
import { flushSaves, persistSettings, reportWrite } from './thunks';
import type { AppThunk } from './types';

// The scenario list (S22): create, copy, rename, delete and compare. Names are
// unique (spec "Szenarien"); ids are made here, from the store's id source.

const namesOf = (names: readonly { name: string }[]) =>
  names.map((scenario) => scenario.name);

/**
 * A new scenario, empty or as a copy of the active one, under `name` (a
 * number is added if it is taken). It becomes the active scenario, because an
 * empty scenario is of no use before it is filled in. Returns its id.
 */
export function createScenario(options: {
  name: string;
  copyOfActive?: boolean;
}): AppThunk<string | null> {
  return (dispatch, getState, { randomId, now }) => {
    const state = getState();
    const name = uniqueName(options.name, namesOf(selectScenarios(state)));
    const active = selectActiveScenario(state);
    const scenario =
      options.copyOfActive && active
        ? copyScenario(active, { name, newId: randomId })
        : createScenarioTemplate({
            id: randomId(),
            name,
            currentMonth: monthOf(now()),
          });
    dispatch(scenarioAdded(scenario));
    dispatch(activeScenarioSet(scenario.id));
    return scenario.id;
  };
}

/** A copy of a scenario with new ids under `name` (made unique); the active scenario stays. */
export function duplicateScenario(
  id: string,
  name: string,
): AppThunk<string | null> {
  return (dispatch, getState, { randomId }) => {
    const state = getState();
    const original = state.scenario.byId[id];
    if (!original) return null;
    const copy = copyScenario(original, {
      name: uniqueName(name, namesOf(selectScenarios(state))),
      newId: randomId,
    });
    dispatch(scenarioAdded(copy));
    return copy.id;
  };
}

export type RenameResult = 'ok' | 'empty' | 'taken' | 'unknown';

/** Renames a scenario. The name must be filled in and not used by another scenario. */
export function renameScenario(
  id: string,
  name: string,
): AppThunk<RenameResult> {
  return (dispatch, getState) => {
    const state = getState();
    const scenario = state.scenario.byId[id];
    if (!scenario) return 'unknown';
    const trimmed = name.trim();
    if (trimmed === '') return 'empty';
    const others = selectScenarios(state).filter((other) => other.id !== id);
    if (isNameTaken(trimmed, namesOf(others))) return 'taken';
    if (trimmed !== scenario.name) {
      dispatch(scenarioUpdated({ ...scenario, name: trimmed }));
    }
    return 'ok';
  };
}

export type DeleteResult = WriteResult['status'] | 'unknown';

/**
 * Deletes a scenario from the database and the lists. When it was the active
 * one, the first remaining scenario takes over; without one, an empty scenario
 * is made (`templateName` is the text of the UI), so the app always has one.
 * A write that does not happen (read only, storage closed) leaves everything.
 */
export function deleteScenario(
  id: string,
  templateName: string,
): AppThunk<Promise<DeleteResult>> {
  return async (dispatch, getState, { repository, randomId, now }) => {
    const before = getState();
    if (!before.scenario.byId[id]) return 'unknown';
    const result = await repository.delete(id);
    if (!reportWrite(dispatch, result)) return result.status;

    const wasActive = before.scenario.activeId === id;
    dispatch(scenarioRemoved(id));
    if (wasActive) {
      const next = selectScenarios(getState())[0];
      if (next) {
        dispatch(activeScenarioSet(next.id));
      } else {
        const empty = createScenarioTemplate({
          id: randomId(),
          name: templateName,
          currentMonth: monthOf(now()),
        });
        dispatch(scenarioAdded(empty));
        dispatch(activeScenarioSet(empty.id));
        await dispatch(flushSaves());
      }
      await dispatch(persistSettings());
    }
    return 'ok';
  };
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Computes the given scenarios in the price case "Mittel" for the comparison,
 * one after the other, and keeps the results as they arrive. Fewer than two
 * clear the comparison. A newer request makes the answers of an older one drop.
 */
export function compareScenarios(
  ids: readonly string[],
): AppThunk<Promise<void>> {
  return async (dispatch, getState, { core, now }) => {
    const scenarios = ids.flatMap((id) => getState().scenario.byId[id] ?? []);
    if (scenarios.length < 2) {
      dispatch(comparisonCleared());
      return;
    }
    dispatch(comparisonRequested({ scenarioIds: scenarios.map((s) => s.id) }));
    const requestId = getState().result.comparisonRequests;
    try {
      for (const scenario of scenarios) {
        const { results } = await core.compare({ scenario });
        dispatch(
          comparisonScenarioDone({
            requestId,
            scenarioId: scenario.id,
            results,
          }),
        );
      }
      dispatch(
        comparisonFinished({ requestId, computedAt: now().toISOString() }),
      );
    } catch (error) {
      dispatch(comparisonFailed({ requestId, message: messageOf(error) }));
    }
  };
}
