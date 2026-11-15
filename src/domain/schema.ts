import { z } from 'zod';

/** Version of the stored scenario format (architecture 8.2). */
export const CURRENT_SCHEMA_VERSION = 2;

/** Longest comparison period in months (spec "Parameterliste"): 100 years. */
export const MAX_COMPARISON_MONTHS = 1200;

export const ROAD_TYPES = ['city', 'rural', 'highway'] as const;
export const WEEKDAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;
export const PRESENCE_STATES = ['both', 'onlyA', 'onlyB'] as const;
export const PRICE_CASES = [
  'mid',
  'evFavorable',
  'evUnfavorable',
  'slider',
] as const;

export const RoadTypeSchema = z.enum(ROAD_TYPES);
export const WeekdaySchema = z.enum(WEEKDAYS);
export const PresenceStateSchema = z.enum(PRESENCE_STATES);
export const PriceCaseSchema = z.enum(PRICE_CASES);

/** A calendar month: first registration and the warranty reference month (architecture 8.1). */
export const YearMonthSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1990).max(2100),
});
export type YearMonth = z.infer<typeof YearMonthSchema>;

/** Whole months from `from` to `to`, negative if `from` is later. */
export const monthsBetween = (from: YearMonth, to: YearMonth): number =>
  (to.year - from.year) * 12 + (to.month - from.month);

/**
 * Age a in months at the warranty reference month (spec "Restgarantie"):
 * at least 0. The migration and the core both use it, so a / 12 is the same
 * number on both sides.
 */
export const ageInMonths = (
  firstRegistration: YearMonth,
  referenceMonth: YearMonth,
): number => Math.max(0, monthsBetween(firstRegistration, referenceMonth));

export type RoadType = z.infer<typeof RoadTypeSchema>;
export type Weekday = z.infer<typeof WeekdaySchema>;
export type PresenceState = z.infer<typeof PresenceStateSchema>;
export type PriceCase = z.infer<typeof PriceCaseSchema>;

const nonNegative = z.number().min(0);
const positive = z.number().gt(0);
const percent = z.number().min(0).max(100);

/**
 * Builds the entity schemas once for both variants (architecture 8.1, 8.6).
 * Storage (`strict = false`): every required field may be `null`, so a
 * half-edited scenario is always saveable and loadable. Compute
 * (`strict = true`): required fields must be set. Percentages are stored as
 * entered (15 means 15 %); only the core converts them to fractions.
 */
function buildEntities<const Strict extends boolean>(strict: Strict) {
  const req = <T extends z.ZodType>(
    schema: T,
  ): Strict extends true ? T : z.ZodNullable<T> =>
    // Deliberate cast: the conditional return type is only honoured by callers.
    (strict ? schema : schema.nullable()) as never;
  const text = strict ? z.string().trim().min(1) : z.string();

  const priceRange = z.object({
    min: req(nonNegative),
    mid: req(nonNegative),
    max: req(nonNegative),
  });

  /** One-way distance split by road type, in km. */
  const Commute = z.object({
    city: req(nonNegative),
    rural: req(nonNegative),
    highway: req(nonNegative),
  });

  const IceVehicle = z.object({
    name: text,
    consumptionLPer100Km: z.object({
      city: req(positive),
      rural: req(positive),
      highway: req(positive),
    }),
    mileageKm: req(nonNegative),
    maintenancePerKm: req(nonNegative),
    petrolPrice: priceRange,
    petrolEscalationPct: z.number().min(-100),
  });

  const Workplace = z.object({
    name: text,
    commute: Commute,
    weekdays: strict ? z.array(WeekdaySchema).min(1) : z.array(WeekdaySchema),
    freeDaysPerYear: nonNegative,
    chargesFreeAtWork: z.boolean(),
  });

  const ExtraMileage = z.object({
    kmPerMonth: z.object({
      city: req(nonNegative),
      rural: req(nonNegative),
      highway: req(nonNegative),
    }),
  });

  const Parameters = z.object({
    comparisonMonths: positive.int().max(MAX_COMPARISON_MONTHS),
    chargeLowerPct: percent,
    chargeUpperPct: percent,
    safetyBufferPct: percent,
    sohMinPct: percent,
    kmToSohMin: positive,
    sohReference: z.enum(['end', 'start']),
    chargingEfficiencyPct: positive.max(100),
    tempColdC: z.number(),
    tempMildC: z.number(),
    monthlyTempC: z.array(z.number()).length(12),
    coldReserveK: nonNegative,
    highwayDiscountPct: percent,
    trafficLightGreenFromPct: percent,
    depreciationPctPerYear: percent,
    evMaintenancePerKm: req(nonNegative),
    electricityPrice: priceRange,
    electricityEscalationPct: z.number().min(-100),
    workWeeksPerYear: positive.max(53),
    extraMileageMode: z.enum(['optimized', 'fixed']),
    extraMileageFixedEvSharePct: percent.nullable(),
    extraMileageStepPct: positive.max(100),
    strictMode: z.boolean(),
    warrantyBudgetAsTarget: z.boolean(),
    kmGridPerYear: positive,
    /** Stichtag der Garantieberechnung (ADR-17): the core reads no clock. */
    warrantyReferenceMonth: YearMonthSchema,
    /** Set by the user, so it shows as changed; false while it is the month of creation. */
    warrantyReferenceMonthSetByUser: z.boolean(),
  });

  const LeaseTier = z.object({
    id: z.uuid(),
    tierKmPerYear: positive.int(),
    monthlyRate: req(positive),
    termMonths: req(positive.int()),
    downPayment: req(nonNegative),
    extraKmPrice: req(nonNegative),
    underKmRefund: req(nonNegative),
  });

  /** The normal warranty of the manufacturer from first registration, not the remaining one. */
  const warranty = z.object({
    years: req(nonNegative),
    km: req(nonNegative),
  });

  const rangePair = z.object({ mild: req(positive), cold: req(positive) });

  const Candidate = z.object({
    id: z.uuid(),
    name: text,
    note: z.string(),
    condition: z.enum(['new', 'used']),
    purchasePrice: req(positive),
    /** Required for a used car in the compute schema. */
    firstRegistration: YearMonthSchema.nullable(),
    mileageKm: req(nonNegative),
    netCapacityKwh: req(positive),
    rangeKm: z.object({
      city: rangePair,
      highway: rangePair,
      combined: rangePair,
    }),
    sohKnownPct: z.number().min(50).max(100).nullable(),
    vehicleWarranty: warranty,
    batteryWarranty: warranty,
    /**
     * "Garantiewerte prüfen": the v1 -> v2 migration could not turn the stored
     * remaining warranty into the normal one. A hint only, it blocks nothing.
     */
    warrantyNeedsReview: z.boolean(),
    depreciationPctPerYear: percent.nullable(),
    maintenancePerKm: nonNegative.nullable(),
    leaseTiers: z
      .array(LeaseTier)
      .max(4)
      .superRefine((tiers, ctx) => {
        const seen = new Set<number>();
        tiers.forEach((tier, index) => {
          if (seen.has(tier.tierKmPerYear)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'tierKmPerYear'],
              message: 'Only one lease offer per tier is allowed.',
            });
          }
          seen.add(tier.tierKmPerYear);
        });
      }),
  });

  const Scenario = z.object({
    id: z.uuid(),
    name: text,
    iceVehicle: IceVehicle,
    workplaces: z.object({ a: Workplace, b: Workplace }),
    extraMileage: ExtraMileage,
    parameters: Parameters,
    candidates: z.array(Candidate),
  });

  return {
    Commute,
    IceVehicle,
    Workplace,
    ExtraMileage,
    Parameters,
    LeaseTier,
    Candidate,
    Scenario,
  };
}

const storage = buildEntities(false);
const compute = buildEntities(true);

// Storage schemas: type, range and structure only (architecture 8.6).
export const CommuteSchema = storage.Commute;
export const IceVehicleSchema = storage.IceVehicle;
export const WorkplaceSchema = storage.Workplace;
export const ExtraMileageSchema = storage.ExtraMileage;
export const ParametersSchema = storage.Parameters;
export const LeaseTierSchema = storage.LeaseTier;
export const CandidateSchema = storage.Candidate;
export const ScenarioSchema = storage.Scenario;

export type Commute = z.infer<typeof CommuteSchema>;
export type IceVehicle = z.infer<typeof IceVehicleSchema>;
export type Workplace = z.infer<typeof WorkplaceSchema>;
export type ExtraMileage = z.infer<typeof ExtraMileageSchema>;
export type Parameters = z.infer<typeof ParametersSchema>;
export type LeaseTier = z.infer<typeof LeaseTierSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

const sumKm = (c: { city: number; rural: number; highway: number }) =>
  c.city + c.rural + c.highway;

/** Strict schema for one candidate: required fields set, rules across fields. */
export const CandidateComputeSchema = compute.Candidate.superRefine(
  (candidate, ctx) => {
    if (candidate.condition === 'new' && candidate.mileageKm !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['mileageKm'],
        message: 'A new car has a mileage of 0 km.',
      });
    }
    if (
      candidate.condition === 'used' &&
      candidate.firstRegistration === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['firstRegistration'],
        message: 'A used car needs its first registration.',
      });
    }
  },
);

/** Strict schema for everything but the candidates (driving profile, parameters). */
export const ScenarioComputeSchema = compute.Scenario.omit({
  candidates: true,
}).superRefine((scenario, ctx) => {
  const { iceVehicle, workplaces, parameters } = scenario;
  const checkPrices = (
    price: { min: number; mid: number; max: number },
    path: (string | number)[],
  ) => {
    if (price.min > price.mid || price.mid > price.max) {
      ctx.addIssue({
        code: 'custom',
        path,
        message: 'Prices must satisfy minimum <= mid <= maximum.',
      });
    }
  };
  checkPrices(iceVehicle.petrolPrice, ['iceVehicle', 'petrolPrice']);
  checkPrices(parameters.electricityPrice, ['parameters', 'electricityPrice']);

  (['a', 'b'] as const).forEach((key) => {
    const workplace = workplaces[key];
    if (sumKm(workplace.commute) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['workplaces', key, 'commute'],
        message: 'The one-way distance must be greater than 0 km.',
      });
    }
    const workdays = parameters.workWeeksPerYear * workplace.weekdays.length;
    if (workplace.freeDaysPerYear > workdays) {
      ctx.addIssue({
        code: 'custom',
        path: ['workplaces', key, 'freeDaysPerYear'],
        message: 'Free days exceed the working days of the year.',
      });
    }
  });

  if (parameters.tempColdC >= parameters.tempMildC) {
    ctx.addIssue({
      code: 'custom',
      path: ['parameters', 'tempColdC'],
      message: 'The cold reference temperature must be below the mild one.',
    });
  }
  if (
    parameters.extraMileageMode === 'fixed' &&
    parameters.extraMileageFixedEvSharePct === null
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['parameters', 'extraMileageFixedEvSharePct'],
      message: 'A fixed share needs a value.',
    });
  }
  if (parameters.chargeLowerPct >= parameters.chargeUpperPct) {
    ctx.addIssue({
      code: 'custom',
      path: ['parameters', 'chargeLowerPct'],
      message: 'The lower charge limit must be below the upper one.',
    });
  }
});

export type CandidateCompute = z.infer<typeof CandidateComputeSchema>;
export type ScenarioCompute = z.infer<typeof ScenarioComputeSchema>;
