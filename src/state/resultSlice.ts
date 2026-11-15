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
  trace: TraceState | null;
  error: string | null;
};

const initialState: ResultState = {
  generation: 0,
  status: 'idle',
  latest: null,
  trace: null,
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
      action: PayloadAction<Extract<ComputeResponse, { status: 'done' }>>,
    ) {
      if (action.payload.generation !== state.generation) return;
      state.latest = action.payload;
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
      state.trace = {
        ...action.payload,
        result: null,
        entries: [],
        error: null,
      };
    },
    traceLoaded(state, action: PayloadAction<TraceState>) {
      const { offerId, priceCase } = action.payload;
      // Another offer was opened meanwhile: only the open one is kept.
      if (
        state.trace?.offerId !== offerId ||
        state.trace.priceCase !== priceCase
      ) {
        return;
      }
      state.trace = action.payload;
    },
    traceFailed(
      state,
      action: PayloadAction<{
        offerId: string;
        priceCase: PriceCase;
        message: string;
      }>,
    ) {
      const { offerId, priceCase, message } = action.payload;
      if (
        state.trace?.offerId !== offerId ||
        state.trace.priceCase !== priceCase
      ) {
        return;
      }
      state.trace.error = message;
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
