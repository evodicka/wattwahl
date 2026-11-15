// Display formatting for de-DE (architecture 8.7). This is the only place that
// rounds: the core hands over unrounded values (architecture 8.4).

const LOCALE = 'de-DE';

// A no-break space keeps the unit on the number's line, as Intl does for
// currency and percent. Intl's unit style would use a normal space before "km".
const NBSP = ' ';

// signDisplay 'negative' drops the sign of a value that rounds to zero, so
// -0.4 shows as "0 €", not "-0 €".
const euro = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
  signDisplay: 'negative',
});

// Intl writes the hyphen-minus (U+002D) for de-DE. The design uses the true
// minus sign (U+2212), which also keeps "−12" from breaking after the sign.
const MINUS = '\u2212';
const withMinus = (text: string): string => text.replace('-', MINUS);

const decimalFormats = new Map<number, Intl.NumberFormat>();
const decimalFormat = (decimals: number): Intl.NumberFormat => {
  let format = decimalFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
      signDisplay: 'negative',
    });
    decimalFormats.set(decimals, format);
  }
  return format;
};

const percentFormats = new Map<number, Intl.NumberFormat>();
const percentFormat = (decimals: number): Intl.NumberFormat => {
  let format = percentFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, {
      style: 'percent',
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
      signDisplay: 'negative',
    });
    percentFormats.set(decimals, format);
  }
  return format;
};

/** Costs in full euros: 19119.75 → "19.120 €". */
export const formatEuro = (value: number): string =>
  withMinus(euro.format(value));

/** Distances and reserves in whole km: 31.1 → "31 km". */
export const formatKm = (value: number): string =>
  `${withMinus(decimalFormat(0).format(value))}${NBSP}km`;

/** Consumption per 100 km with one decimal: 23.077 → "23,1 kWh/100 km". */
export const formatConsumption = (
  valuePer100Km: number,
  unit: 'kWh' | 'l',
): string =>
  `${withMinus(decimalFormat(1).format(valuePer100Km))}${NBSP}${unit}/100 km`;

/** A value already in percent: 25.9 → "26 %". */
export const formatPercent = (valuePct: number, decimals = 0): string =>
  withMinus(percentFormat(decimals).format(valuePct / 100));

/** Any other number with decimal comma and thousands point. */
export const formatDecimal = (value: number, decimals: number): string =>
  withMinus(decimalFormat(decimals).format(value));

// Dates and times for "Stand" and "Gespeichert". The time zone is the
// device's; tests pass one so they do not depend on the machine.
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormat = (
  kind: 'date' | 'time',
  timeZone: string | undefined,
): Intl.DateTimeFormat => {
  const key = `${kind}|${timeZone ?? ''}`;
  let format = dateTimeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE, {
      ...(kind === 'date'
        ? { day: '2-digit', month: '2-digit', year: 'numeric' }
        : { hour: '2-digit', minute: '2-digit' }),
      timeZone,
    });
    dateTimeFormats.set(key, format);
  }
  return format;
};

/** A calendar date: 2026-11-14T11:04Z → "14.11.2026". */
export const formatDate = (value: Date | string, timeZone?: string): string =>
  dateTimeFormat('date', timeZone).format(new Date(value));

/** A time of day without seconds: 2026-11-14T11:04Z → "12:04" in Berlin. */
export const formatTime = (value: Date | string, timeZone?: string): string =>
  dateTimeFormat('time', timeZone).format(new Date(value));
