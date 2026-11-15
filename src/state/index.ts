/** Redux slices, autosave, worker client and debounce. */
export { createAppStore, useAppDispatch, useAppSelector } from './store';
export type { AppDependencies, AppStore } from './store';
export type { ImportError, ImportMode } from '../storage';
export type { AppDispatch, AppThunk, RootState } from './types';
export {
  MAX_LEASE_TIERS,
  addCandidate,
  addLeaseTier,
  deleteCandidate,
  duplicateCandidate,
  removeLeaseTier,
  setCandidateCondition,
} from './candidates';
export {
  resetSlider,
  saveSliderAsScenario,
  setSliderPrice,
  sliderStart,
} from './priceSlider';
export { isNameTaken, uniqueName } from './names';
export {
  compareScenarios,
  createScenario,
  deleteScenario,
  duplicateScenario,
  renameScenario,
} from './scenarios';
export type { DeleteResult, RenameResult } from './scenarios';
export { DEBOUNCE_MS, MAX_RESTARTS, attachLifecycle } from './listeners';
export {
  closeTrace,
  exportScenarios,
  flushSaves,
  importFile,
  openTrace,
  requestCompute,
  saveBeforeUpdate,
  startApp,
} from './thunks';
export {
  activeScenarioSet,
  scenarioAdded,
  scenarioRemoved,
  scenarioUpdated,
  settingsUpdated,
} from './scenarioSlice';
export type { ScenarioState } from './scenarioSlice';
export { comparisonCleared } from './resultSlice';
export type {
  ComparisonState,
  ResultState,
  ResultStatus,
  TraceState,
} from './resultSlice';
export {
  exportReminderDismissed,
  importErrorCleared,
  noticeDismissed,
  priceCaseSet,
  sliderPricesSet,
} from './uiSlice';
export type { Notices, UiState } from './uiSlice';
export {
  selectActiveScenario,
  selectExportReminderDue,
  selectResultIsCurrent,
  selectScenarios,
} from './selectors';
