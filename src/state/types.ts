import {
  combineReducers,
  type ThunkAction,
  type ThunkDispatch,
  type UnknownAction,
} from '@reduxjs/toolkit';
import type { PersistenceResult, Repository } from '../storage';
import type { CoreClient } from './coreClient';
import { resultSlice } from './resultSlice';
import { scenarioSlice } from './scenarioSlice';
import { uiSlice } from './uiSlice';

export const rootReducer = combineReducers({
  scenario: scenarioSlice.reducer,
  result: resultSlice.reducer,
  ui: uiSlice.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * What thunks and listeners may use besides the state. The clock and the ids
 * come only from here (8.1, ADR-17), so tests set them.
 */
export type Services = {
  repository: Repository;
  core: CoreClient;
  now: () => Date;
  randomId: () => string;
  requestPersistence: () => Promise<PersistenceResult>;
};

export type AppDispatch = ThunkDispatch<RootState, Services, UnknownAction>;
export type AppThunk<R = void> = ThunkAction<
  R,
  RootState,
  Services,
  UnknownAction
>;
