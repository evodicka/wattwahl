import { createScenarioTemplate, type PriceCase } from '../domain';
import {
  parseImport,
  prepareAddImport,
  type ExportFile,
  type ImportMode,
  type ParsedImport,
  type WriteResult,
} from '../storage';
import {
  computeFailed,
  computeRequested,
  computeSucceeded,
  traceClosed,
  traceLoaded,
  traceRequested,
} from './resultSlice';
import {
  loaded,
  scenarioAdded,
  scenarioSaved,
  settingsUpdated,
} from './scenarioSlice';
import { monthOf, selectActiveScenario, selectScenarios } from './selectors';
import type { AppDispatch, AppThunk } from './types';
import { importErrorCleared, importFailed, noticeShown } from './uiSlice';

/** Shows the notice for a write that did not happen; the state in memory stays. */
function reportWrite(dispatch: AppDispatch, result: WriteResult): boolean {
  switch (result.status) {
    case 'ok':
      return true;
    case 'quotaExceeded':
      dispatch(noticeShown('quotaExceeded'));
      return false;
    case 'readOnly':
      dispatch(noticeShown('databaseReadOnly'));
      return false;
    case 'closed':
      dispatch(noticeShown('reloadRequired'));
      return false;
  }
}

/** Writes every changed scenario now: the autosave after 300 ms and on leaving the page (8.2). */
export function flushSaves(): AppThunk<Promise<void>> {
  return async (dispatch, getState, { repository }) => {
    const { dirty, byId } = getState().scenario;
    for (const id of dirty) {
      const scenario = byId[id];
      if (!scenario) continue;
      if (reportWrite(dispatch, await repository.save(scenario))) {
        dispatch(scenarioSaved(scenario));
      }
    }
  };
}

export function persistSettings(): AppThunk<Promise<void>> {
  return async (dispatch, getState, { repository }) => {
    reportWrite(
      dispatch,
      await repository.saveSettings(getState().scenario.settings),
    );
  };
}

/**
 * Sends the active scenario to the worker with the next generation (8.5).
 * Only the response of the latest generation reaches the state; a superseded
 * run and a run cut short by a crash leave it as it is.
 */
export function requestCompute(): AppThunk<Promise<void>> {
  return async (dispatch, getState, { core }) => {
    const state = getState();
    const scenario = selectActiveScenario(state);
    if (!scenario) return;
    const generation = state.result.generation + 1;
    dispatch(computeRequested(generation));
    try {
      const response = await core.compute({
        generation,
        scenario,
        sliderPrices: state.ui.sliderPrices ?? undefined,
      });
      if (response.status === 'done') dispatch(computeSucceeded(response));
    } catch (error) {
      dispatch(computeFailed({ generation, message: String(error) }));
    }
  };
}

/** App start of runtime view 6.2, steps 2 to 5, without UI. */
export function startApp(options: {
  /** Name of the empty scenario made when there is none; a text of the UI. */
  templateName: string;
}): AppThunk<Promise<void>> {
  return async (dispatch, _getState, services) => {
    const { repository, now, randomId } = services;
    if (repository.mode === 'readOnly')
      dispatch(noticeShown('databaseReadOnly'));

    let settings = await repository.loadSettings();
    if (!settings.firstRunCompleted) {
      if ((await services.requestPersistence()) === 'denied') {
        dispatch(noticeShown('persistenceDenied'));
      }
      settings = { ...settings, firstRunCompleted: true };
    }

    const stores = await repository.loadAll();
    let activeId = settings.activeScenarioId;
    if (!stores.scenarios.some((scenario) => scenario.id === activeId)) {
      activeId = stores.scenarios[0]?.id ?? null;
    }
    const template =
      activeId === null && repository.mode === 'readWrite'
        ? createScenarioTemplate({
            id: randomId(),
            name: options.templateName,
            currentMonth: monthOf(now()),
          })
        : null;
    dispatch(
      loaded({
        ...stores,
        settings: { ...settings, activeScenarioId: template?.id ?? activeId },
      }),
    );
    if (template) {
      dispatch(scenarioAdded(template));
      await dispatch(flushSaves());
    }
    await dispatch(persistSettings());
    // Started, not awaited: the result arrives through the store.
    void dispatch(requestCompute());
  };
}

/**
 * Import of runtime view 6.3: check the file, give new ids for "add", write
 * in one transaction, reload the stores and compute. A broken file shows its
 * error and changes nothing.
 */
export function importFile(
  file: Blob,
  mode: ImportMode,
): AppThunk<Promise<ParsedImport | WriteResult>> {
  return async (dispatch, getState, { repository, now, randomId }) => {
    dispatch(importErrorCleared());
    const parsed = await parseImport(file, { now });
    if (parsed.status === 'error') {
      dispatch(importFailed(parsed));
      return parsed;
    }
    // Pending edits first, so "add" keeps them.
    await dispatch(flushSaves());
    const scenarios =
      mode === 'add'
        ? prepareAddImport(
            parsed.scenarios,
            selectScenarios(getState()).map((scenario) => scenario.name),
            randomId,
          )
        : parsed.scenarios;
    const written = await repository.writeImport(scenarios, mode);
    if (!reportWrite(dispatch, written)) return written;

    const stores = await repository.loadAll();
    const { settings } = getState().scenario;
    const activeId = stores.scenarios.some(
      (scenario) => scenario.id === settings.activeScenarioId,
    )
      ? settings.activeScenarioId
      : (scenarios[0]?.id ?? null);
    dispatch(
      loaded({
        ...stores,
        settings: { ...settings, activeScenarioId: activeId },
      }),
    );
    await dispatch(persistSettings());
    // Started, not awaited: the result arrives through the store.
    void dispatch(requestCompute());
    return written;
  };
}

/** Builds the export file (8.3) and remembers the date for the export reminder. */
export function exportScenarios(
  ids?: readonly string[],
): AppThunk<Promise<ExportFile>> {
  return async (dispatch, _getState, { repository, now }) => {
    const file = await repository.exportFile(ids);
    dispatch(settingsUpdated({ lastExportAt: now().toISOString() }));
    return file;
  };
}

/** Opens the Rechenweg of one offer: the worker recomputes it with a trace (8.5). */
export function openTrace(
  offerId: string,
  priceCase: PriceCase,
): AppThunk<Promise<void>> {
  return async (dispatch, getState, { core }) => {
    const state = getState();
    const scenario = selectActiveScenario(state);
    if (!scenario) return;
    dispatch(traceRequested({ offerId, priceCase }));
    const { result, trace } = await core.explain({
      scenario,
      offerId,
      priceCase,
      sliderPrices: state.ui.sliderPrices ?? undefined,
    });
    dispatch(traceLoaded({ offerId, priceCase, result, entries: trace }));
  };
}

export const closeTrace = traceClosed;
