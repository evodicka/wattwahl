import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PriceCase, SliderPrices } from '../domain';
import type { ImportError } from '../storage';
import { activeScenarioSet, loaded } from './scenarioSlice';

// Transient UI state: the price slider (never saved, 8.5) and the notices the
// areas show. The texts belong to the language file; here are only the facts.

export type Notices = {
  /** A save failed with a full storage: ask for an export (8.10). */
  quotaExceeded: boolean;
  /** A newer tab took over the database: ask for a reload (8.2). */
  reloadRequired: boolean;
  /** The database belongs to a newer app: read only, ask for an update. */
  databaseReadOnly: boolean;
  /** The browser refused persistent storage: a hint, not an error (8.2). */
  persistenceDenied: boolean;
  importError: ImportError | null;
};

/** The export reminder (Z10): shown when due, hidden for the session once dismissed. */
export type ExportReminder = 'hidden' | 'due' | 'dismissed';

export type UiState = {
  exportReminder: ExportReminder;
  /** Age of the last export in days when the reminder was checked; `null`: never exported. */
  exportAgeDays: number | null;
  sliderPrices: SliderPrices | null;
  /** The price case the result views show; the status line names it. */
  priceCase: PriceCase;
  notices: Notices;
};

const initialState: UiState = {
  exportReminder: 'hidden',
  exportAgeDays: null,
  sliderPrices: null,
  priceCase: 'mid',
  notices: {
    quotaExceeded: false,
    reloadRequired: false,
    databaseReadOnly: false,
    persistenceDenied: false,
    importError: null,
  },
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  extraReducers: (builder) => {
    // The slider belongs to the scenario it started from (its prices are that
    // scenario's mids): another scenario, or a reload of the stores, drops it.
    const dropSlider = (state: UiState) => {
      state.sliderPrices = null;
      if (state.priceCase === 'slider') state.priceCase = 'mid';
    };
    builder.addCase(activeScenarioSet, dropSlider);
    builder.addCase(loaded, dropSlider);
  },
  reducers: {
    sliderPricesSet(state, action: PayloadAction<SliderPrices | null>) {
      state.sliderPrices = action.payload;
      // The "Regler" case exists only while the slider does.
      if (action.payload === null && state.priceCase === 'slider') {
        state.priceCase = 'mid';
      }
    },
    /** The check of the reminder: after a dismissal it stays dismissed until it is no longer due. */
    exportReminderChecked(
      state,
      action: PayloadAction<{ due: boolean; ageDays: number | null }>,
    ) {
      state.exportAgeDays = action.payload.ageDays;
      if (!action.payload.due) state.exportReminder = 'hidden';
      else if (state.exportReminder === 'hidden') state.exportReminder = 'due';
    },
    exportReminderDismissed(state) {
      if (state.exportReminder === 'due') state.exportReminder = 'dismissed';
    },
    priceCaseSet(state, action: PayloadAction<PriceCase>) {
      state.priceCase = action.payload;
    },
    noticeShown(
      state,
      action: PayloadAction<Exclude<keyof Notices, 'importError'>>,
    ) {
      state.notices[action.payload] = true;
    },
    noticeDismissed(
      state,
      action: PayloadAction<Exclude<keyof Notices, 'importError'>>,
    ) {
      state.notices[action.payload] = false;
    },
    importFailed(state, action: PayloadAction<ImportError>) {
      state.notices.importError = action.payload;
    },
    importErrorCleared(state) {
      state.notices.importError = null;
    },
  },
});

export const {
  sliderPricesSet,
  exportReminderChecked,
  exportReminderDismissed,
  priceCaseSet,
  noticeShown,
  noticeDismissed,
  importFailed,
  importErrorCleared,
} = uiSlice.actions;
