import type { FormulaId, TraceEntry } from '../../domain';
import {
  formatConsumption,
  formatDecimal,
  formatEuro,
  formatInput,
  formatKm,
  formatPercent,
  formatScientific,
  i18n,
} from '../../i18n';

// How the value of a Rechenweg step is written. The core hands over unrounded
// numbers (8.4); here they are rounded for reading, in the unit of the formula.

type Kind =
  | 'ratio2'
  | 'ratio3'
  | 'ratio4'
  | 'km'
  | 'percentFraction'
  | 'percent'
  | 'kwh'
  | 'consumption'
  | 'euro'
  | 'euroDay'
  | 'litres'
  | 'years'
  | 'days'
  | 'integer'
  | 'months'
  | 'bool'
  | 'light'
  | 'slope'
  | 'warranty';

/** One entry per formula id: a new formula in the core fails the type check here. */
const KIND: Record<FormulaId, Kind> = {
  'F1.w': 'ratio2',
  'F1.wStar': 'ratio2',
  'F1.R': 'km',
  'F1.RStar': 'km',
  'F2.slope': 'slope',
  'F2.soh': 'percentFraction',
  'F2.kEnd': 'km',
  'F3.u': 'ratio2',
  'F3.phi': 'ratio3',
  'F3.n': 'integer',
  'F3.suitable': 'bool',
  'F3.reserveKm': 'km',
  'F3.reservePct': 'percent',
  'F3.trafficLight': 'light',
  'F4.c': 'consumption',
  'F4.E': 'kwh',
  'F4.Egrid': 'kwh',
  'F4.evDayCost': 'euroDay',
  'F4.iceDayLitres': 'litres',
  'F4.maintKm': 'km',
  'F5.f': 'ratio4',
  'F5.c': 'ratio2',
  'F5.days': 'days',
  'F6.share': 'km',
  'F7.qy': 'ratio3',
  'F7.Fb': 'ratio2',
  'F7.Fs': 'ratio2',
  'F7.Fm': 'ratio2',
  'F8.purchase': 'euro',
  'F8.lease': 'euro',
  'F8.extraKm': 'km',
  'F8.underKm': 'km',
  'F8.energy': 'euro',
  'F8.maintenance': 'euro',
  'F8.kIce': 'km',
  'F8.iceOdometer': 'km',
  'OPT.threshold': 'percentFraction',
  'OPT.optionSet': 'bool',
  'OPT.remainingWarranty': 'warranty',
  'OPT.budget': 'km',
  'OPT.target': 'euro',
  'OPT.select': 'km',
  'OPT.budgetExtraCost': 'euro',
  'OPT.yearsToKmLimit': 'years',
  'OPT.timeline': 'percentFraction',
  'OPT.suitableUntil': 'months',
  'OPT.switchEvent': 'km',
  'OPT.switchCost': 'euro',
};

const t = (key: string, options: Record<string, unknown> = {}): string =>
  i18n.t(key as never, options) as unknown as string;

const years = (value: number) =>
  `${formatDecimal(value, 1)} ${t('units.years')}`;

/**
 * The core writes `Number.MAX_VALUE` for "no limit" (an offer that needs no
 * reserve, an unlimited ratio). Anything this large is shown in words.
 */
const UNLIMITED_FROM = 1e15;

/** Strings the core writes as values or inputs, in words. */
const WORDS: Record<string, string> = {
  none: 'detail.trace.none',
  end: 'detail.trace.untilEnd',
  never: 'detail.trace.never',
  city: 'roadTypes.city',
  rural: 'roadTypes.rural',
  highway: 'roadTypes.highway',
  combined: 'roadTypes.combined',
  new: 'kandidaten:form.conditionNew',
  used: 'kandidaten:form.conditionUsed',
  years: 'units.years',
  km: 'units.km',
};
const word = (value: string): string => {
  const key = WORDS[value];
  if (!key) return value;
  return key.startsWith('detail.') ? t(key, { ns: 'ergebnis' }) : t(key);
};

/** The value of a step as text, in the unit of its formula. */
export function formatTraceValue(entry: TraceEntry): string {
  const { value } = entry;
  if (typeof value === 'number' && Math.abs(value) >= UNLIMITED_FROM) {
    return t('detail.trace.unlimited', { ns: 'ergebnis' });
  }
  // The extra mileage of a month is chosen as a share in percent.
  if (
    entry.formula === 'OPT.select' &&
    entry.inputs.decision === 'extraShare'
  ) {
    return typeof value === 'number' ? formatPercent(value) : String(value);
  }
  if (typeof value === 'boolean') return t(value ? 'yesNo.yes' : 'yesNo.no');
  if (typeof value === 'string') {
    return value === 'green' || value === 'yellow' || value === 'red'
      ? t(`light.${value}`)
      : word(value);
  }
  const kind = KIND[entry.formula];
  switch (kind) {
    case 'ratio2':
      return formatDecimal(value, 2);
    case 'ratio3':
      return formatDecimal(value, 3);
    case 'ratio4':
      return formatDecimal(value, 4);
    case 'km':
      return formatKm(value);
    case 'percentFraction':
      return formatPercent(value * 100, 1);
    case 'percent':
      return formatPercent(value, 1);
    case 'kwh':
      return `${formatDecimal(value, 1)} ${t('units.kwh')}`;
    case 'consumption':
      // F4.c is kWh per km.
      return formatConsumption(value * 100, 'kWh');
    case 'euro':
      return formatEuro(value);
    case 'euroDay':
      return `${formatDecimal(value, 2)} ${t('units.euro')}`;
    case 'litres':
      return `${formatDecimal(value, 1)} l`;
    case 'years':
      return years(value);
    case 'days':
      return formatDecimal(value, 2);
    case 'integer':
      return formatDecimal(value, 0);
    case 'months':
      return `${formatDecimal(value, 0)} ${t('units.months')}`;
    case 'slope':
      return formatScientific(value);
    case 'warranty':
      return entry.inputs.quantity === 'years' ? years(value) : formatKm(value);
    case 'bool':
    case 'light':
      return String(value);
  }
}

/** An input of a step as text: numbers with decimal comma, other values as they are. */
export function formatTraceInput(value: number | string | boolean): string {
  if (typeof value === 'number') {
    return Math.abs(value) >= UNLIMITED_FROM
      ? t('detail.trace.unlimited', { ns: 'ergebnis' })
      : formatInput(value);
  }
  if (typeof value === 'boolean') return t(value ? 'yesNo.yes' : 'yesNo.no');
  return word(value);
}
