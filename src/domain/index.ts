/** Zod schemas, defaults, migrations and plausibility warnings. Imported by every module. */
export {
  CURRENT_SCHEMA_VERSION,
  PRESENCE_STATES,
  PRICE_CASES,
  ROAD_TYPES,
  WEEKDAYS,
  CandidateComputeSchema,
  CandidateSchema,
  CommuteSchema,
  ExtraMileageSchema,
  IceVehicleSchema,
  LeaseTierSchema,
  ParametersSchema,
  PresenceStateSchema,
  PriceCaseSchema,
  RoadTypeSchema,
  ScenarioComputeSchema,
  ScenarioSchema,
  WeekdaySchema,
  WorkplaceSchema,
} from './schema';
export type {
  Candidate,
  CandidateCompute,
  Commute,
  IceVehicle,
  ExtraMileage,
  LeaseTier,
  Parameters,
  PresenceState,
  PriceCase,
  RoadType,
  Scenario,
  ScenarioCompute,
  Weekday,
  Workplace,
} from './schema';
export {
  LEASE_TIER_PRESETS,
  PARAMETER_DEFAULTS,
  createCandidateTemplate,
  createLeaseTierTemplate,
  createScenarioTemplate,
} from './defaults';
export type { ParameterDefault } from './defaults';
export {
  OfferSchema,
  leaseOfferId,
  listOffers,
  parseOfferId,
  purchaseOfferId,
} from './offerId';
export type { Offer } from './offerId';
export { DEFAULT_DEVICE_SETTINGS, DeviceSettingsSchema } from './settings';
export type { DeviceSettings } from './settings';
