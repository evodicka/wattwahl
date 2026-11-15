import type { Scenario, YearMonth } from '../domain';
import type { RootState } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const selectActiveScenario = (state: RootState): Scenario | null => {
  const { activeId, byId } = state.scenario;
  return activeId ? (byId[activeId] ?? null) : null;
};

export const selectScenarios = (state: RootState): Scenario[] =>
  state.scenario.order.flatMap((id) => state.scenario.byId[id] ?? []);

/**
 * The results belong to the active scenario and its latest input. Otherwise
 * the view marks them as "wird aktualisiert" or outdated (8.5, 8.10).
 */
export const selectResultIsCurrent = (state: RootState): boolean =>
  state.result.status === 'idle' &&
  state.result.latest?.scenarioId === state.scenario.activeId;

/**
 * The export reminder (8.3): due when the last export is at least the
 * interval of the settings ago, or when there never was one.
 */
export function selectExportReminderDue(state: RootState, now: Date): boolean {
  const { lastExportAt, exportReminderDays } = state.scenario.settings;
  if (lastExportAt === null) return true;
  return (
    now.getTime() - Date.parse(lastExportAt) >= exportReminderDays * DAY_MS
  );
}

export const monthOf = (date: Date): YearMonth => ({
  month: date.getMonth() + 1,
  year: date.getFullYear(),
});
