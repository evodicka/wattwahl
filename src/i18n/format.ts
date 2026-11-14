// Display formatting for de-DE (architecture 8.7). This is the only place that
// rounds: the core hands over unrounded values (architecture 8.4).

const LOCALE = 'de-DE';

const euro = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

// Intl's unit style puts a normal space before "km"; a no-break space keeps the
// unit on the number's line, as currency and percent do.
const whole = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const oneDecimal = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const NBSP = ' ';

/** Costs in full euros: 19119.75 → "19.120 €". */
export const formatEuro = (value: number): string => euro.format(value);

/** Distances and reserves in whole km: 31.1 → "31 km". */
export const formatKm = (value: number): string =>
  `${whole.format(value)}${NBSP}km`;

/** Consumption per 100 km with one decimal: 23.077 → "23,1 kWh/100 km". */
export const formatConsumption = (
  valuePer100Km: number,
  unit: 'kWh' | 'l',
): string => `${oneDecimal.format(valuePer100Km)}${NBSP}${unit}/100 km`;

/** A value already in percent: 25.9 → "26 %". */
export const formatPercent = (valuePct: number, decimals = 0): string =>
  new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(valuePct / 100);

/** Any other number with decimal comma and thousands point. */
export const formatDecimal = (value: number, decimals: number): string =>
  new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
