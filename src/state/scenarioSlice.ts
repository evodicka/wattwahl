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
};

const initialState: ScenarioState = {
  byId: {},
  order: [],
  activeId: null,
  readOnly: [],
  invalid: [],
  settings: DEFAULT_DEVICE_SETTINGS,
  dirty: [],
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
      }>,
    ) {
      const { scenarios, readOnly, invalid, settings } = action.payload;
      state.byId = Object.fromEntries(scenarios.map((s) => [s.id, s]));
      state.order = scenarios.map((s) => s.id);
      state.readOnly = readOnly;
      state.invalid = invalid;
      state.settings = settings;
      state.activeId = settings.activeScenarioId;
      state.dirty = [];
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
    activeScenarioSet(state, action: PayloadAction<string>) {
      if (!state.byId[action.payload]) return;
      state.activeId = action.payload;
      state.settings.activeScenarioId = action.payload;
    },
    settingsUpdated(state, action: PayloadAction<Partial<DeviceSettings>>) {
      state.settings = { ...state.settings, ...action.payload };
      state.activeId = state.settings.activeScenarioId;
    },
    /**
     * The autosave wrote this version. Changed again meanwhile, the scenario
     * stays dirty and is written by the next autosave.
     */
    scenarioSaved(state, action: PayloadAction<Scenario>) {
      const scenario = action.payload;
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
  activeScenarioSet,
  settingsUpdated,
  scenarioSaved,
} = scenarioSlice.actions;
