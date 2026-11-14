/** Zod schemas, defaults, migrations and plausibility warnings. Imported by every module. */
export {
  CURRENT_SCHEMA_VERSION,
  MAX_COMPARISON_MONTHS,
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
  ExtraMileage,
  IceVehicle,
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
export {
  DecimalResultSchema,
  NumberFieldResultSchema,
  WarningSchema,
  checkWarnings,
  parseDecimal,
  parseNumberField,
} from './validation';
export type { DecimalResult, NumberFieldResult, Warning } from './validation';
export {
  MIGRATIONS,
  MigrationResultSchema,
  UpgradeResultSchema,
  createMigrator,
  migrate,
  upgradeScenario,
} from './migrations';
export type {
  MigrationResult,
  MigrationStep,
  UpgradeResult,
} from './migrations';
export {
  FORMULA_IDS,
  FormulaIdSchema,
  OfferResultSchema,
  PlanCellSchema,
  PlanChoiceSchema,
  ReserveCellSchema,
  SliderPricesSchema,
  TraceEntrySchema,
  UnsuitableReasonSchema,
} from './result';
export type {
  FormulaId,
  OfferResult,
  OkOfferResult,
  ReserveCell,
  SliderPrices,
  TraceEntry,
  UnsuitableReason,
  WayKey,
} from './result';
export { DEFAULT_DEVICE_SETTINGS, DeviceSettingsSchema } from './settings';
export type { DeviceSettings } from './settings';
