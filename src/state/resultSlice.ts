import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { OfferResult, PriceCase, TraceEntry } from '../domain';
import type { ComputeResponse } from '../worker';

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

export type ResultState = {
  /** Generation of the latest request; responses of other generations are dropped. */
  generation: number;
  status: ResultStatus;
  latest: Extract<ComputeResponse, { status: 'done' }> | null;
  /** When `latest` arrived (ISO 8601): "Stand der Berechnung". */
  computedAt: string | null;
  trace: TraceState | null;
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
  traceRequests: 0,
  error: null,
};

export const resultSlice = createSlice({
  name: 'result',
  initialState,
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
} = resultSlice.actions;
