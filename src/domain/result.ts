import { z } from 'zod';

// Result-side schemas shared by core, worker, state and UI (architecture 5.1,
// 8.4). S07 adds the trace; the offer result follows with S10.

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
 * Held in the UI state and never stored with a scenario.
 */
export const SliderPricesSchema = z.object({
  petrol: z.number().min(0),
  electricity: z.number().min(0),
  petrolEscalationPct: z.number().min(-100),
  electricityEscalationPct: z.number().min(-100),
});
export type SliderPrices = z.infer<typeof SliderPricesSchema>;
