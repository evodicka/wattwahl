import { createSlice, original, type PayloadAction } from '@reduxjs/toolkit';
import {
  DEFAULT_DEVICE_SETTINGS,
  type DeviceSettings,
  type Scenario,
} from '../domain';
import type { InvalidRecord, ReadOnlyRecord } from '../storage';

// Scenarios and device settings in memory. A scenario is always replaced as a
// whole, never edited in place: the worker's ComputeCache and the autosave
// both tell changes apart by object identity (8.5).

export type ScenarioState = {
  byId: Record<string, Scenario>;
  /** Scenario ids in list order. */
  order: string[];
  activeId: string | null;
  /** Records of a newer app: shown, never saved (8.2). */
  readOnly: ReadOnlyRecord[];
  /** Records that could not be loaded; they stay untouched in the database. */
  invalid: InvalidRecord[];
  settings: DeviceSettings;
  /** Ids changed since their last save; the autosave writes them. */
  dirty: string[];
  /** When the autosave last wrote a scenario (ISO 8601), for the frame. */
  lastSavedAt: string | null;
};

const initialState: ScenarioState = {
  byId: {},
  order: [],
  activeId: null,
  readOnly: [],
  invalid: [],
  settings: DEFAULT_DEVICE_SETTINGS,
  dirty: [],
  lastSavedAt: null,
};

const markDirty = (state: ScenarioState, id: string) => {
  if (!state.dirty.includes(id)) state.dirty.push(id);
};

export const scenarioSlice = createSlice({
  name: 'scenario',
  initialState,
  reducers: {
    /** The stores after the app start or an import (6.2, 6.3); nothing is dirty. */
    loaded(
      state,
      action: PayloadAction<{
        scenarios: Scenario[];
        readOnly: ReadOnlyRecord[];
        invalid: InvalidRecord[];
        settings: DeviceSettings;
        /** Keep unsaved edits of scenarios that are still there (import "add"). */
        keepDirty?: boolean;
      }>,
    ) {
      const { scenarios, readOnly, invalid, settings, keepDirty } =
        action.payload;
      const base = original(state);
      const kept = keepDirty
        ? state.dirty.flatMap((id) => {
            const edited = base?.byId[id];
            return edited && scenarios.some((s) => s.id === id) ? [edited] : [];
          })
        : [];
      state.byId = Object.fromEntries(scenarios.map((s) => [s.id, s]));
      for (const scenario of kept) state.byId[scenario.id] = scenario;
      state.order = scenarios.map((s) => s.id);
      state.readOnly = readOnly;
      state.invalid = invalid;
      state.settings = settings;
      state.activeId = settings.activeScenarioId;
      state.dirty = kept.map((scenario) => scenario.id);
    },
    scenarioAdded(state, action: PayloadAction<Scenario>) {
      const scenario = action.payload;
      if (!state.byId[scenario.id]) state.order.push(scenario.id);
      state.byId[scenario.id] = scenario;
      markDirty(state, scenario.id);
    },
    /** Replaces a scenario with a changed copy. */
    scenarioUpdated(state, action: PayloadAction<Scenario>) {
      const scenario = action.payload;
      if (!state.byId[scenario.id]) return;
      state.byId[scenario.id] = scenario;
      markDirty(state, scenario.id);
    },
    /** A deleted scenario is gone from the lists; the thunk chooses the next active one. */
    scenarioRemoved(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.byId = Object.fromEntries(
        Object.entries(state.byId).filter(([other]) => other !== id),
      );
      state.order = state.order.filter((other) => other !== id);
      state.dirty = state.dirty.filter((other) => other !== id);
      if (state.activeId === id) {
        state.activeId = null;
        state.settings.activeScenarioId = null;
      }
    },
    activeScenarioSet(state, action: PayloadAction<string>) {
      if (!state.byId[action.payload]) return;
      state.activeId = action.payload;
      state.settings.activeScenarioId = action.payload;
    },
    /** The active scenario changes only through activeScenarioSet, which recomputes. */
    settingsUpdated(
      state,
      action: PayloadAction<Partial<Omit<DeviceSettings, 'activeScenarioId'>>>,
    ) {
      state.settings = { ...state.settings, ...action.payload };
    },
    /**
     * The autosave wrote this version. Changed again meanwhile, the scenario
     * stays dirty and is written by the next autosave.
     */
    scenarioSaved(
      state,
      action: PayloadAction<{ scenario: Scenario; savedAt: string }>,
    ) {
      const { scenario, savedAt } = action.payload;
      state.lastSavedAt = savedAt;
      // Compared on the base state: reading the draft would give a proxy.
      if (original(state)?.byId[scenario.id] !== scenario) return;
      state.dirty = state.dirty.filter((id) => id !== scenario.id);
    },
  },
});

export const {
  loaded,
  scenarioAdded,
  scenarioUpdated,
  scenarioRemoved,
  activeScenarioSet,
  settingsUpdated,
  scenarioSaved,
} = scenarioSlice.actions;
