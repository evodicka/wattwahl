import { z } from 'zod';
import { type Candidate, type LeaseTier, type Scenario } from './schema';

const UNITS = [
  'months',
  'percent',
  'km',
  'choice',
  'celsius',
  'kelvin',
  'eurPerKm',
  'eurPerL',
  'eurPerKwh',
  'percentPerYear',
  'weeks',
  'daysPerYear',
  'switch',
  'kmPerYear',
  'days',
] as const;

export const ParameterDefaultSchema = z.object({
  /** Label of the row in the spec table "Parameterliste mit Standardwerten". */
  specRow: z.string(),
  /** Dot path into a scenario, or into the device settings (`settings.`). */
  path: z.string(),
  /** `null` for required inputs, which have no default on purpose. */
  value: z.union([
    z.number(),
    z.boolean(),
    z.string(),
    z.array(z.number()),
    z.null(),
  ]),
  unit: z.enum(UNITS),
  /** placeholder: an assumption to check. required: no default. fixed: set by the spec. */
  flag: z.enum(['placeholder', 'required', 'fixed']),
});
export type ParameterDefault = z.infer<typeof ParameterDefaultSchema>;

const MONTHLY_TEMPERATURES = [1, 2, 5, 9, 14, 17, 19, 19, 15, 10, 5, 2];

type Row = Omit<ParameterDefault, 'specRow'>;
const rows = (specRow: string, ...entries: Row[]): ParameterDefault[] =>
  entries.map((entry) => ({ specRow, ...entry }));

/** One entry per value of the spec table "Parameterliste mit Standardwerten". */
export const PARAMETER_DEFAULTS: readonly ParameterDefault[] = [
  ...rows('Vergleichsdauer D', {
    path: 'parameters.comparisonMonths',
    value: 48,
    unit: 'months',
    flag: 'fixed',
  }),
  ...rows('Untere Ladegrenze', {
    path: 'parameters.chargeLowerPct',
    value: 10,
    unit: 'percent',
    flag: 'fixed',
  }),
  ...rows('Obere Ladegrenze', {
    path: 'parameters.chargeUpperPct',
    value: 80,
    unit: 'percent',
    flag: 'fixed',
  }),
  ...rows('Sicherheitspuffer', {
    path: 'parameters.safetyBufferPct',
    value: 10,
    unit: 'percent',
    flag: 'placeholder',
  }),
  ...rows('SoH-Untergrenze', {
    path: 'parameters.sohMinPct',
    value: 85,
    unit: 'percent',
    flag: 'fixed',
  }),
  ...rows('Kilometer bis zur SoH-Untergrenze', {
    path: 'parameters.kmToSohMin',
    value: 200000,
    unit: 'km',
    flag: 'placeholder',
  }),
  ...rows('SoH-Bezug der Eignungsprüfung', {
    path: 'parameters.sohReference',
    value: 'end',
    unit: 'choice',
    flag: 'fixed',
  }),
  ...rows('Ladewirkungsgrad', {
    path: 'parameters.chargingEfficiencyPct',
    value: 90,
    unit: 'percent',
    flag: 'placeholder',
  }),
  ...rows('Bezugstemperatur kalt', {
    path: 'parameters.tempColdC',
    value: -10,
    unit: 'celsius',
    flag: 'placeholder',
  }),
  ...rows('Bezugstemperatur mild', {
    path: 'parameters.tempMildC',
    value: 23,
    unit: 'celsius',
    flag: 'placeholder',
  }),
  ...rows('Monatstemperaturen', {
    path: 'parameters.monthlyTempC',
    value: MONTHLY_TEMPERATURES,
    unit: 'celsius',
    flag: 'placeholder',
  }),
  ...rows('Kältereserve ΔT', {
    path: 'parameters.coldReserveK',
    value: 5,
    unit: 'kelvin',
    flag: 'placeholder',
  }),
  ...rows('Autobahn-Abschlag', {
    path: 'parameters.highwayDiscountPct',
    value: 12,
    unit: 'percent',
    flag: 'placeholder',
  }),
  ...rows('Ampel grün ab Reserve', {
    path: 'parameters.trafficLightGreenFromPct',
    value: 15,
    unit: 'percent',
    flag: 'fixed',
  }),
  ...rows('Wertverlust', {
    path: 'parameters.depreciationPctPerYear',
    value: 15,
    unit: 'percentPerYear',
    flag: 'placeholder',
  }),
  ...rows('Wartung und Reifen E-Auto', {
    path: 'parameters.evMaintenancePerKm',
    value: null,
    unit: 'eurPerKm',
    flag: 'required',
  }),
  ...rows('Wartung und Reifen Verbrenner', {
    path: 'iceVehicle.maintenancePerKm',
    value: null,
    unit: 'eurPerKm',
    flag: 'required',
  }),
  ...rows(
    'Benzinpreis Minimum, Mittel, Maximum',
    ...(['min', 'mid', 'max'] as const).map((key): Row => ({
      path: `iceVehicle.petrolPrice.${key}`,
      value: null,
      unit: 'eurPerL',
      flag: 'required',
    })),
  ),
  ...rows(
    'Heimstrompreis Minimum, Mittel, Maximum',
    ...(['min', 'mid', 'max'] as const).map((key): Row => ({
      path: `parameters.electricityPrice.${key}`,
      value: null,
      unit: 'eurPerKwh',
      flag: 'required',
    })),
  ),
  ...rows(
    'Preissteigerung Benzin und Strom',
    {
      path: 'iceVehicle.petrolEscalationPct',
      value: 0,
      unit: 'percentPerYear',
      flag: 'fixed',
    },
    {
      path: 'parameters.electricityEscalationPct',
      value: 0,
      unit: 'percentPerYear',
      flag: 'fixed',
    },
  ),
  ...rows('Arbeitswochen pro Jahr', {
    path: 'parameters.workWeeksPerYear',
    value: 52,
    unit: 'weeks',
    flag: 'fixed',
  }),
  ...rows(
    'Freie Tage je Arbeitsstätte',
    ...(['a', 'b'] as const).map((key): Row => ({
      path: `workplaces.${key}.freeDaysPerYear`,
      value: 30,
      unit: 'daysPerYear',
      flag: 'placeholder',
    })),
  ),
  ...rows('Zuordnung der Zusatzstrecke', {
    path: 'parameters.extraMileageMode',
    value: 'optimized',
    unit: 'choice',
    flag: 'fixed',
  }),
  ...rows('Anteilsschritt Zusatzstrecke', {
    path: 'parameters.extraMileageStepPct',
    value: 10,
    unit: 'percent',
    flag: 'fixed',
  }),
  ...rows('Streng-Modus', {
    path: 'parameters.strictMode',
    value: false,
    unit: 'switch',
    flag: 'fixed',
  }),
  ...rows('Garantie-Budget als Ziel', {
    path: 'parameters.warrantyBudgetAsTarget',
    value: true,
    unit: 'switch',
    flag: 'fixed',
  }),
  ...rows('Kilometerraster der Optimierung', {
    path: 'parameters.kmGridPerYear',
    value: 250,
    unit: 'kmPerYear',
    flag: 'fixed',
  }),
  ...rows('Export-Erinnerung', {
    path: 'settings.exportReminderDays',
    value: 14,
    unit: 'days',
    flag: 'fixed',
  }),
];

/** Lease tiers a new offer is pre-filled with (spec "Leasingangebot"). */
export const LEASE_TIER_PRESETS = [10000, 15000, 20000, 25000] as const;

function setPath(target: object, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop() as string;
  let node = target as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in node)) throw new Error(`Unknown default path: ${path}`);
    node = node[key] as Record<string, unknown>;
  }
  if (!(last in node)) throw new Error(`Unknown default path: ${path}`);
  node[last] = Array.isArray(value) ? [...value] : value;
}

/** Empty scenario: required fields are `null`, every other field has its default. */
export function createScenarioTemplate(input: {
  id: string;
  name: string;
}): Scenario {
  const emptyCommute = { city: null, rural: null, highway: null };
  const emptyWorkplace = {
    name: '',
    commute: { ...emptyCommute },
    weekdays: [],
    freeDaysPerYear: 0,
    chargesFreeAtWork: false,
  };
  const emptyPrice = { min: null, mid: null, max: null };
  const scenario: Scenario = {
    id: input.id,
    name: input.name,
    iceVehicle: {
      name: '',
      consumptionLPer100Km: { ...emptyCommute },
      mileageKm: null,
      maintenancePerKm: null,
      petrolPrice: { ...emptyPrice },
      petrolEscalationPct: 0,
    },
    workplaces: {
      a: { ...emptyWorkplace, commute: { ...emptyCommute } },
      b: { ...emptyWorkplace, commute: { ...emptyCommute } },
    },
    extraMileage: { kmPerMonth: { ...emptyCommute } },
    parameters: {
      comparisonMonths: 0,
      chargeLowerPct: 0,
      chargeUpperPct: 0,
      safetyBufferPct: 0,
      sohMinPct: 0,
      kmToSohMin: 1,
      sohReference: 'end',
      chargingEfficiencyPct: 1,
      tempColdC: 0,
      tempMildC: 0,
      monthlyTempC: [],
      coldReserveK: 0,
      highwayDiscountPct: 0,
      trafficLightGreenFromPct: 0,
      depreciationPctPerYear: 0,
      evMaintenancePerKm: null,
      electricityPrice: { ...emptyPrice },
      electricityEscalationPct: 0,
      workWeeksPerYear: 1,
      extraMileageMode: 'optimized',
      extraMileageFixedEvSharePct: null,
      extraMileageStepPct: 1,
      strictMode: false,
      warrantyBudgetAsTarget: true,
      kmGridPerYear: 1,
    },
    candidates: [],
  };
  for (const entry of PARAMETER_DEFAULTS) {
    if (entry.flag !== 'required' && !entry.path.startsWith('settings.')) {
      setPath(scenario, entry.path, entry.value);
    }
  }
  return scenario;
}

/** Empty candidate for the "new candidate" form. Starts as a new car without lease offers. */
export function createCandidateTemplate(id: string): Candidate {
  return {
    id,
    name: '',
    note: '',
    condition: 'new',
    purchasePrice: null,
    firstRegistration: null,
    mileageKm: 0,
    netCapacityKwh: null,
    rangeKm: {
      city: { mild: null, cold: null },
      highway: { mild: null, cold: null },
      combined: { mild: null, cold: null },
    },
    sohKnownPct: null,
    vehicleWarranty: { years: null, km: null },
    batteryWarranty: { years: null, km: null },
    depreciationPctPerYear: null,
    maintenancePerKm: null,
    leaseTiers: [],
  };
}

export function createLeaseTierTemplate(
  id: string,
  tierKmPerYear: number,
): LeaseTier {
  return {
    id,
    tierKmPerYear,
    monthlyRate: null,
    termMonths: null,
    downPayment: null,
    extraKmPrice: null,
    underKmRefund: null,
  };
}
