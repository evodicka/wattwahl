import { useCallback } from 'react';
import {
  CURRENT_MONTH,
  PARAMETER_DEFAULTS,
  type ParameterDefault,
  type Scenario,
  type YearMonth,
} from '../../domain';
import {
  scenarioUpdated,
  selectActiveScenario,
  useAppDispatch,
  useAppSelector,
  type AppThunk,
} from '../../state';
import type { FieldMarks } from '../components';
import { getAt, sameValue, setAt } from './paths';

/** Replaces the active scenario with a copy that has `value` at `path`. */
export const editActiveScenario =
  (path: string, value: unknown): AppThunk =>
  (dispatch, getState) => {
    const scenario = selectActiveScenario(getState());
    if (!scenario || sameValue(getAt(scenario, path), value)) return;
    dispatch(scenarioUpdated(setAt(scenario, path, value)));
  };

/**
 * Sets the warranty reference month back to the current month (spec
 * "Parameterliste"): it no longer counts as set by the user. The month comes
 * from the store's clock, like every date (ADR-17).
 */
export const resetWarrantyReferenceMonth =
  (): AppThunk =>
  (dispatch, getState, { now }) => {
    const scenario = selectActiveScenario(getState());
    if (!scenario) return;
    const today = now();
    dispatch(
      scenarioUpdated({
        ...scenario,
        parameters: {
          ...scenario.parameters,
          warrantyReferenceMonth: {
            month: today.getMonth() + 1,
            year: today.getFullYear(),
          },
          warrantyReferenceMonthSetByUser: false,
        },
      }),
    );
  };

/** The user sets the warranty reference month: from now on it counts as changed. */
export const setWarrantyReferenceMonth =
  (month: YearMonth): AppThunk =>
  (dispatch, getState) => {
    const scenario = selectActiveScenario(getState());
    if (!scenario) return;
    dispatch(
      scenarioUpdated({
        ...scenario,
        parameters: {
          ...scenario.parameters,
          warrantyReferenceMonth: month,
          warrantyReferenceMonthSetByUser: true,
        },
      }),
    );
  };

/** The active scenario and a setter for one of its paths. */
export function useScenarioEditor() {
  const scenario = useAppSelector(selectActiveScenario);
  const dispatch = useAppDispatch();
  const set = useCallback(
    (path: string, value: unknown) => dispatch(editActiveScenario(path, value)),
    [dispatch],
  );
  return { scenario, set };
}

const DEFAULTS = new Map(
  PARAMETER_DEFAULTS.map((entry) => [entry.path, entry]),
);

/** The row of the parameter list for a path, if the path has one. */
export const parameterDefault = (path: string): ParameterDefault | undefined =>
  DEFAULTS.get(path);

/**
 * Markers of a field from the parameter list: "Pflicht" for required inputs,
 * "Annahme" for placeholders, "geändert" when the value is not the default.
 * The warranty reference month counts as changed only when the user set it.
 */
export function parameterMarks(scenario: Scenario, path: string): FieldMarks {
  const entry = DEFAULTS.get(path);
  if (!entry) return {};
  return {
    required: entry.flag === 'required',
    assumption: entry.flag === 'placeholder',
    changed: isChanged(scenario, entry),
  };
}

export function isChanged(
  scenario: Scenario,
  entry: ParameterDefault,
): boolean {
  if (entry.flag === 'required') return false;
  if (entry.value === CURRENT_MONTH) {
    return scenario.parameters.warrantyReferenceMonthSetByUser;
  }
  return !sameValue(getAt(scenario, entry.path), entry.value);
}
