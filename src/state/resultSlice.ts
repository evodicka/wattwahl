import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { OfferResult, PriceCase, TraceEntry } from '../domain';
import type { ComputeResponse, OfferResults } from '../worker';
import { scenarioRemoved } from './scenarioSlice';

// Results of the active scenario and the Rechenweg of the one open offer
// (8.5). Only a response of the latest generation is taken over; until then
// the last result stays visible.

export type ResultStatus =
  /** The results belong to the latest input. */
  | 'idle'
  /** A run is on its way: "wird aktualisiert". */
  | 'computing'
  /** The worker died; the results are outdated until the new worker answers. */
  | 'stale'
  | 'error';

export type TraceState = {
  /** Counts the requests: an answer to an earlier request of the same offer is dropped. */
  requestId: number;
  offerId: string;
  priceCase: PriceCase;
  /** `null` while the worker recomputes the offer with its Rechenweg. */
  result: OfferResult | null;
  entries: TraceEntry[];
  /** Why the Rechenweg could not be computed, e.g. the worker died. */
  error: string | null;
};

/** The scenario comparison (S22): other scenarios computed in the price case "Mittel". */
export type ComparisonState = {
  /** Counts the requests: answers to an earlier request are dropped. */
  requestId: number;
  scenarioIds: string[];
  status: 'loading' | 'done' | 'error';
  /** Results by scenario id, as they arrive. */
  results: Record<string, OfferResults>;
  /** When the last scenario arrived (ISO 8601). */
  computedAt: string | null;
  error: string | null;
};

export type ResultState = {
  /** Generation of the latest request; responses of other generations are dropped. */
  generation: number;
  status: ResultStatus;
  latest: Extract<ComputeResponse, { status: 'done' }> | null;
  /** When `latest` arrived (ISO 8601): "Stand der Berechnung". */
  computedAt: string | null;
  trace: TraceState | null;
  comparison: ComparisonState | null;
  comparisonRequests: number;
  /** Requests of a Rechenweg so far; the next one gets this number plus one. */
  traceRequests: number;
  error: string | null;
};

const initialState: ResultState = {
  generation: 0,
  status: 'idle',
  latest: null,
  computedAt: null,
  trace: null,
  comparison: null,
  comparisonRequests: 0,
  traceRequests: 0,
  error: null,
};

export const resultSlice = createSlice({
  name: 'result',
  initialState,
  extraReducers: (builder) => {
    // A deleted scenario leaves the comparison.
    builder.addCase(scenarioRemoved, (state, action) => {
      const comparison = state.comparison;
      if (!comparison) return;
      comparison.scenarioIds = comparison.scenarioIds.filter(
        (id) => id !== action.payload,
      );
      comparison.results = Object.fromEntries(
        Object.entries(comparison.results).filter(
          ([id]) => id !== action.payload,
        ),
      );
    });
  },
  reducers: {
    /** An input changed; the run starts after the debounce: "wird aktualisiert" at once. */
    computeScheduled(state) {
      if (state.status !== 'stale') state.status = 'computing';
    },
    computeRequested(state, action: PayloadAction<number>) {
      state.generation = action.payload;
      if (state.status !== 'stale') state.status = 'computing';
    },
    computeSucceeded(
      state,
      action: PayloadAction<{
        response: Extract<ComputeResponse, { status: 'done' }>;
        /** Stamped by the thunk: reducers read no clock. */
        computedAt: string;
      }>,
    ) {
      const { response, computedAt } = action.payload;
      if (response.generation !== state.generation) return;
      state.latest = response;
      state.computedAt = computedAt;
      state.status = 'idle';
      state.error = null;
    },
    computeFailed(
      state,
      action: PayloadAction<{ generation: number; message: string }>,
    ) {
      if (action.payload.generation !== state.generation) return;
      state.status = 'error';
      state.error = action.payload.message;
    },
    /** The last result stays visible, marked as outdated (8.10). */
    workerCrashed(state) {
      state.status = 'stale';
    },
    traceRequested(
      state,
      action: PayloadAction<{ offerId: string; priceCase: PriceCase }>,
    ) {
      state.traceRequests += 1;
      state.trace = {
        ...action.payload,
        requestId: state.traceRequests,
        result: null,
        entries: [],
        error: null,
      };
    },
    traceLoaded(state, action: PayloadAction<TraceState>) {
      // Another request came meanwhile (another offer, the same offer opened
      // again, a retry): only the answer to the latest one is kept.
      if (state.trace?.requestId !== action.payload.requestId) return;
      state.trace = action.payload;
    },
    traceFailed(
      state,
      action: PayloadAction<{ requestId: number; message: string }>,
    ) {
      if (state.trace?.requestId !== action.payload.requestId) return;
      state.trace.error = action.payload.message;
    },
    traceClosed(state) {
      state.trace = null;
    },
    comparisonRequested(
      state,
      action: PayloadAction<{ scenarioIds: string[] }>,
    ) {
      state.comparisonRequests += 1;
      state.comparison = {
        requestId: state.comparisonRequests,
        scenarioIds: action.payload.scenarioIds,
        status: 'loading',
        results: {},
        computedAt: null,
        error: null,
      };
    },
    comparisonScenarioDone(
      state,
      action: PayloadAction<{
        requestId: number;
        scenarioId: string;
        results: OfferResults;
      }>,
    ) {
      const { requestId, scenarioId, results } = action.payload;
      if (state.comparison?.requestId !== requestId) return;
      // A scenario deleted meanwhile has left the comparison.
      if (!state.comparison.scenarioIds.includes(scenarioId)) return;
      state.comparison.results[scenarioId] = results;
    },
    comparisonFinished(
      state,
      action: PayloadAction<{ requestId: number; computedAt: string }>,
    ) {
      if (state.comparison?.requestId !== action.payload.requestId) return;
      state.comparison.status = 'done';
      state.comparison.computedAt = action.payload.computedAt;
    },
    comparisonFailed(
      state,
      action: PayloadAction<{ requestId: number; message: string }>,
    ) {
      if (state.comparison?.requestId !== action.payload.requestId) return;
      state.comparison.status = 'error';
      state.comparison.error = action.payload.message;
    },
    comparisonCleared(state) {
      // Also ends a run that is still going.
      state.comparisonRequests += 1;
      state.comparison = null;
    },
  },
});

export const {
  computeScheduled,
  computeRequested,
  computeSucceeded,
  computeFailed,
  workerCrashed,
  traceRequested,
  traceLoaded,
  traceFailed,
  traceClosed,
  comparisonRequested,
  comparisonScenarioDone,
  comparisonFinished,
  comparisonFailed,
  comparisonCleared,
} = resultSlice.actions;
