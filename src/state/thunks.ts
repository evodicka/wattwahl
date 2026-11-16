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
  traceFailed,
  traceLoaded,
  traceRequested,
} from './resultSlice';
import {
  loaded,
  scenarioAdded,
  scenarioSaved,
  settingsUpdated,
} from './scenarioSlice';
import {
  monthOf,
  selectActiveScenario,
  selectExportReminderDue,
  selectScenarios,
} from './selectors';
import type { AppDispatch, AppThunk } from './types';
import {
  exportReminderChecked,
  importErrorCleared,
  importFailed,
  noticeShown,
} from './uiSlice';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Shows the notice for a write that did not happen; the state in memory stays. */
export function reportWrite(
  dispatch: AppDispatch,
  result: WriteResult,
): boolean {
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
  return async (dispatch, getState, { repository, now }) => {
    const { dirty, byId } = getState().scenario;
    // All writes start at once: on pagehide the page may not live to issue a
    // second one after awaiting the first.
    await Promise.all(
      dirty
        .flatMap((id) => byId[id] ?? [])
        .map(async (scenario) => {
          if (reportWrite(dispatch, await repository.save(scenario))) {
            dispatch(scenarioSaved({ scenario, savedAt: now().toISOString() }));
          }
        }),
    );
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
  return async (dispatch, getState, { core, now }) => {
    const state = getState();
    const scenario = selectActiveScenario(state);
    if (!scenario) return;
    const generation = state.result.generation + 1;
    dispatch(computeRequested(generation));
    let response: Awaited<ReturnType<typeof core.compute>>;
    const started = performance.now();
    try {
      response = await core.compute({
        generation,
        scenario,
        sliderPrices: state.ui.sliderPrices ?? undefined,
      });
    } catch (error) {
      dispatch(computeFailed({ generation, message: messageOf(error) }));
      return;
    }
    if (response.status === 'done') {
      dispatch(
        computeSucceeded({
          response,
          computedAt: now().toISOString(),
          computeMs: performance.now() - started,
        }),
      );
    }
  };
}

/**
 * App start of runtime view 6.2, steps 2 to 5, without UI. Rejects when the
 * database cannot be read at all; the caller shows that as an error (S16).
 */
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
      dispatch(noticeShown('firstStart'));
      // Not awaited: Firefox asks the user and answers only then, and the
      // start must not wait for that. A refusal shows its hint when it comes.
      void services.requestPersistence().then((result) => {
        if (result === 'denied') dispatch(noticeShown('persistenceDenied'));
      });
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
    dispatch(checkExportReminder());
    // Started, not awaited: the result arrives through the store.
    void dispatch(requestCompute());
  };
}

/**
 * Saves everything before the app reloads for an update (6.4, step 3). Answers
 * whether the reload is safe: `false` when edits could not be written, so the
 * reload would lose them. In a database of a newer app nothing is written at
 * all, and the update is exactly what the user needs, so it stays allowed.
 */
export function saveBeforeUpdate(): AppThunk<Promise<boolean>> {
  return async (dispatch, getState, { repository }) => {
    await dispatch(flushSaves());
    return (
      repository.mode === 'readOnly' || getState().scenario.dirty.length === 0
    );
  };
}

/**
 * The export reminder (spec "Export-Erinnerung", 6.2 step 5): due when the last
 * export is as old as the interval of the device settings. A scenario without
 * a candidate is nothing to save, so it never reminds. The clock is the
 * store's, so tests set it.
 */
export function checkExportReminder(): AppThunk {
  return (dispatch, getState, { now }) => {
    const state = getState();
    const hasData = selectScenarios(state).some(
      (scenario) => scenario.candidates.length > 0,
    );
    const { lastExportAt } = state.scenario.settings;
    dispatch(
      exportReminderChecked({
        due: hasData && selectExportReminderDue(state, now()),
        ageDays:
          lastExportAt === null
            ? null
            : Math.max(
                0,
                Math.floor(
                  (now().getTime() - Date.parse(lastExportAt)) / 86_400_000,
                ),
              ),
      }),
    );
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
    // Pending edits first, so "add" keeps them. "replace" drops them anyway.
    if (mode === 'add') await dispatch(flushSaves());
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
        // Edits made while the import was writing stay ("add" keeps every
        // stored scenario); they are saved right after.
        keepDirty: mode === 'add',
      }),
    );
    await dispatch(flushSaves());
    await dispatch(persistSettings());
    dispatch(checkExportReminder());
    // Started, not awaited: the result arrives through the store.
    void dispatch(requestCompute());
    return written;
  };
}

/** Builds the export file (8.3) and remembers the date for the export reminder. */
export function exportScenarios(
  ids?: readonly string[],
): AppThunk<Promise<ExportFile & { skipped: string[] }>> {
  return async (dispatch, _getState, { repository, now }) => {
    // The file is made from the database: pending edits go in first.
    await dispatch(flushSaves());
    const file = await repository.exportFile(ids);
    dispatch(settingsUpdated({ lastExportAt: now().toISOString() }));
    dispatch(checkExportReminder());
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
    const requestId = getState().result.trace?.requestId ?? 0;
    try {
      const { result, trace } = await core.explain({
        scenario,
        offerId,
        priceCase,
        sliderPrices: state.ui.sliderPrices ?? undefined,
      });
      dispatch(
        traceLoaded({
          requestId,
          offerId,
          priceCase,
          result,
          entries: trace,
          error: null,
        }),
      );
    } catch (error) {
      // A worker crash or a bad offer id: the area shows the error and can
      // open the Rechenweg again.
      dispatch(traceFailed({ requestId, message: messageOf(error) }));
    }
  };
}

export const closeTrace = traceClosed;
