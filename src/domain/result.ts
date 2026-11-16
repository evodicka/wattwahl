import { z } from 'zod';
import { PresenceStateSchema, PriceCaseSchema, WeekdaySchema } from './schema';

// Result-side schemas shared by core, worker, state and UI (architecture 5.1,
// 8.4): the trace, the slider prices, and the result of one offer.

/** Formula IDs of architecture 8.4: `F<section>.<name>`, optimizer steps `OPT.<name>`. */
export const FORMULA_IDS = [
  'F1.w',
  'F1.wStar',
  'F1.R',
  'F1.RStar',
  'F2.slope',
  'F2.soh',
  'F2.kEnd',
  'F3.u',
  'F3.phi',
  'F3.n',
  'F3.suitable',
  'F3.reserveKm',
  'F3.reservePct',
  'F3.trafficLight',
  'F4.c',
  'F4.E',
  'F4.Egrid',
  'F4.evDayCost',
  'F4.iceDayLitres',
  'F4.maintKm',
  'F5.f',
  'F5.c',
  'F5.days',
  'F6.share',
  'F7.qy',
  'F7.Fb',
  'F7.Fs',
  'F7.Fm',
  'F8.purchase',
  'F8.lease',
  'F8.extraKm',
  'F8.underKm',
  'F8.energy',
  'F8.maintenance',
  'F8.kIce',
  'F8.iceOdometer',
  'OPT.threshold',
  'OPT.optionSet',
  'OPT.remainingWarranty',
  'OPT.budget',
  'OPT.target',
  'OPT.select',
  'OPT.budgetExtraCost',
  'OPT.yearsToKmLimit',
] as const;

export const FormulaIdSchema = z.enum(FORMULA_IDS);
export type FormulaId = z.infer<typeof FormulaIdSchema>;

/**
 * One line of the Rechenweg: which formula ran, with which inputs, and what it
 * returned. `resultPath` links the entry to a field of the offer result (Q6).
 */
export const TraceEntrySchema = z.object({
  formula: FormulaIdSchema,
  inputs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  value: z.union([z.number(), z.string(), z.boolean()]),
  resultPath: z.string().optional(),
});
export type TraceEntry = z.infer<typeof TraceEntrySchema>;

/**
 * Prices of the price slider (architecture 8.5): the fifth price case `slider`.
 * Held in the UI state and never stored with a scenario. The schema sets no
 * upper bound: the slider UI is expected to clamp prices and escalations to
 * its own range.
 */
export const SliderPricesSchema = z.object({
  petrol: z.number().min(0),
  electricity: z.number().min(0),
  petrolEscalationPct: z.number().min(-100),
  electricityEscalationPct: z.number().min(-100),
});
export type SliderPrices = z.infer<typeof SliderPricesSchema>;

const WaySchema = z.enum(['a', 'b']);
export type WayKey = z.infer<typeof WaySchema>;
/** 0 is January, 11 is December. */
const MonthSchema = z.number().int().min(0).max(11);
const TrafficLightSchema = z.enum(['green', 'yellow', 'red']);

/** Why no plan works (spec "Ungeeignet"). */
export const UnsuitableReasonSchema = z.discriminatedUnion('kind', [
  z.object({
    /** A day with both workplaces staffed that neither way can serve. */
    kind: z.literal('both'),
    weekday: WeekdaySchema,
    month: MonthSchema,
    /** Reserve of each way in km at `soh`; below `minReserveKm` where the EV cannot drive. */
    reserveKm: z.object({ a: z.number(), b: z.number() }),
    /** The Kilometerreserve the ways were measured against (R, 0 if none). */
    minReserveKm: z.number(),
    soh: z.number(),
  }),
  z.object({
    /** Strict mode: this way is not drivable in this month. */
    kind: z.literal('strict'),
    way: WaySchema,
    month: MonthSchema,
    reserveKm: z.number(),
    minReserveKm: z.number(),
    soh: z.number(),
  }),
  z.object({
    /**
     * Every way is drivable at the best SoH, but driving them lowers the SoH
     * (more EV km, less capacity) below what they need.
     */
    kind: z.literal('coupling'),
    soh: z.number(),
  }),
]);
export type UnsuitableReason = z.infer<typeof UnsuitableReasonSchema>;

/** What the plan does on one day type: the EV drives A or B, or rests. */
export const PlanChoiceSchema = z.enum(['evA', 'evB', 'rest']);

export const PlanCellSchema = z.object({
  weekday: WeekdaySchema,
  month: MonthSchema,
  state: PresenceStateSchema,
  choice: PlanChoiceSchema,
});

/** Range reserve of one way in one month at the checked SoH (spec section 3). */
export const ReserveCellSchema = z.object({
  way: WaySchema,
  month: MonthSchema,
  reserveKm: z.number(),
  /** In percent: 25.9 means 25.9 %. */
  reservePct: z.number(),
  light: TrafficLightSchema,
  /** Red although the reserve is not negative: it lies below the Kilometerreserve. */
  belowMinReserve: z.boolean(),
});
export type ReserveCell = z.infer<typeof ReserveCellSchema>;

/** Remaining years and km of one warranty at the reference month (spec "Restgarantie"). */
const RemainingWarrantySchema = z.object({
  years: z.number(),
  km: z.number(),
});

const offerFields = {
  offerId: z.string(),
  candidateId: z.string(),
  kind: z.enum(['purchase', 'lease']),
  priceCase: PriceCaseSchema,
  /**
   * What the result was computed for, so a view can say so even while newer
   * input is being recomputed (spec: every view names scenario, price case and
   * comparison period). Labels, not results.
   */
  scenarioId: z.string(),
  comparisonMonths: z.number(),
};

/**
 * The result of one offer in one price case (spec step 6 of the algorithm and
 * "Ergebnistabelle"). Every number of an `ok` result has an entry with its
 * path in the Rechenweg (Q6).
 */
export const OfferResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...offerFields,
    status: z.literal('ok'),
    /** Plan per weekday, month and presence state that occurs; EV drives A, B or rests. */
    plan: z.array(PlanCellSchema),
    /** Share of the extra mileage the EV drives per month in percent; null without extra mileage. */
    extraSharePct: z.array(z.number().nullable()).length(12),
    /** K_EV and K_ICE in km per year. */
    evKmPerYear: z.number(),
    iceKmPerYear: z.number(),
    /** Planned mileage of the petrol car at the end of the comparison. */
    iceOdometerEnd: z.number(),
    /** Planned mileage of the EV at the end of the comparison (display only), linked to `F2.kEnd`. */
    evOdometerEnd: z.number(),
    /** SoH at the end of the comparison, and the SoH the reserves are checked at. */
    sohEnd: z.number(),
    sohCheck: z.number(),
    costs: z.object({
      /** Purchase (value lost) or lease, depending on `kind`. */
      acquisition: z.number(),
      electricity: z.number(),
      petrol: z.number(),
      maintenance: z.number(),
      total: z.number(),
      /** Extra cost of the warranty budget against the cheapest plan overall. */
      budgetExtraCost: z.number(),
    }),
    /** Both ways in each month: 24 cells, way a first. */
    reserves: z.array(ReserveCellSchema).length(24),
    /**
     * The cell of `reserves` with the smallest reserve in percent among the
     * ways and months the plan lets the EV drive, so it is not negative. `null`
     * if the EV never drives. The optimizer's tie rule compares plans over all
     * ways and at the SoH of their raster bucket, which is at most the SoH
     * `reserves` are checked at.
     */
    minReserve: ReserveCellSchema.omit({
      light: true,
      belowMinReserve: true,
    }).nullable(),
    warranty: z.object({
      /** Both warranties are expired: "ohne Garantie". */
      noWarranty: z.boolean(),
      /** Remaining warranty the core derived; budget and years to the limit use it. */
      remaining: z.object({
        vehicle: RemainingWarrantySchema,
        battery: RemainingWarrantySchema,
      }),
      budgetKmPerYear: z.number().nullable(),
      budgetExceeded: z.boolean(),
      /** Years until each running warranty's km limit at the planned EV km; null if expired. */
      yearsToKmLimit: z.object({
        vehicle: z.number().nullable(),
        battery: z.number().nullable(),
      }),
    }),
    warnings: z.array(z.enum(['budgetExceeded'])),
  }),
  z.object({
    ...offerFields,
    status: z.literal('incomplete'),
    /** Fields that block this offer, as schema paths such as `candidates[2].purchasePrice`. */
    issues: z.array(z.object({ path: z.string(), message: z.string() })),
  }),
  z.object({
    ...offerFields,
    status: z.literal('unsuitable'),
    reason: UnsuitableReasonSchema,
  }),
]);
export type OfferResult = z.infer<typeof OfferResultSchema>;
export type OkOfferResult = Extract<OfferResult, { status: 'ok' }>;
