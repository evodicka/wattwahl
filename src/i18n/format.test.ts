import { describe, expect, it } from 'vitest';
import {
  formatConsumption,
  formatDate,
  formatDecimal,
  formatEuro,
  formatInput,
  formatKm,
  formatMonthYear,
  formatPercent,
  formatTime,
} from './format';

// Intl puts a no-break space between number and unit.
const nbsp = ' ';
// Negative numbers use the true minus sign (U+2212), as in the mockups.
const minus = '\u2212';

describe('formatEuro (architecture 8.7: costs in full euros)', () => {
  it('TC7: the unrounded acquisition cost 19,119.75 EUR shows as 19.120 €', () => {
    expect(formatEuro(19119.75)).toBe(`19.120${nbsp}€`);
  });

  it('TC7: the unrounded residual value 20,880.25 EUR shows as 20.880 €', () => {
    expect(formatEuro(20880.25)).toBe(`20.880${nbsp}€`);
  });

  it('uses the thousands point for large amounts', () => {
    expect(formatEuro(1234567.4)).toBe(`1.234.567${nbsp}€`);
  });

  it('shows zero without decimals', () => {
    expect(formatEuro(0)).toBe(`0${nbsp}€`);
  });
});

describe('formatKm (architecture 8.7: reserve in whole km)', () => {
  it('TC1: a reserve of 31.1 km shows as 31 km', () => {
    expect(formatKm(31.1)).toBe(`31${nbsp}km`);
  });

  it('TC2: a reserve of 91.1 km shows as 91 km', () => {
    expect(formatKm(91.1)).toBe(`91${nbsp}km`);
  });

  it('TC17: the planned odometer of 152,000 km uses the thousands point', () => {
    expect(formatKm(152000)).toBe(`152.000${nbsp}km`);
  });
});

describe('formatConsumption (architecture 8.7: consumption with one decimal)', () => {
  it('TC4: 0.200 kWh/km in the city shows as 20,0 kWh/100 km', () => {
    expect(formatConsumption(0.2 * 100, 'kWh')).toBe(`20,0${nbsp}kWh/100 km`);
  });

  it('TC4: the unrounded rural consumption 60/260 kWh/km shows as 23,1 kWh/100 km', () => {
    expect(formatConsumption((60 / 260) * 100, 'kWh')).toBe(
      `23,1${nbsp}kWh/100 km`,
    );
  });

  it('TC5: the petrol car in the city shows as 8,0 l/100 km', () => {
    expect(formatConsumption(8, 'l')).toBe(`8,0${nbsp}l/100 km`);
  });
});

describe('formatPercent (input in percent, as in OfferResult)', () => {
  it('TC1: a reserve of 25.9 % shows as 26 %', () => {
    expect(formatPercent(25.9)).toBe(`26${nbsp}%`);
  });

  it('TC2: a reserve of 151.9 % shows as 152 %', () => {
    expect(formatPercent(151.9)).toBe(`152${nbsp}%`);
  });

  it('can show a decimal place where a view needs it', () => {
    expect(formatPercent(86.8, 1)).toBe(`86,8${nbsp}%`);
  });
});

describe('negative values and values that round to zero', () => {
  it('drops the sign of a value that rounds to zero', () => {
    expect(formatEuro(-0.4)).toBe(`0${nbsp}€`);
    expect(formatKm(-0.4)).toBe(`0${nbsp}km`);
    expect(formatPercent(-0.2)).toBe(`0${nbsp}%`);
    expect(formatDecimal(-0.04, 1)).toBe('0,0');
  });

  it('TC11: a negative reserve keeps its sign as a true minus (U+2212)', () => {
    expect(formatKm(-12.3)).toBe(`${minus}12${nbsp}km`);
  });

  it('a negative cost difference uses the true minus', () => {
    expect(formatEuro(-1234.5)).toBe(`${minus}1.235${nbsp}€`);
  });

  it('every format uses the true minus, never the hyphen', () => {
    expect(formatPercent(-9.4)).toBe(`${minus}9${nbsp}%`);
    expect(formatDecimal(-0.25, 2)).toBe(`${minus}0,25`);
    expect(formatConsumption(-1, 'l')).toBe(`${minus}1,0${nbsp}l/100 km`);
  });
});

describe('formatDecimal (decimal comma for other values)', () => {
  it('uses the decimal comma and the given number of decimals', () => {
    expect(formatDecimal(0.2943, 4)).toBe('0,2943');
    expect(formatDecimal(1.9, 2)).toBe('1,90');
  });

  it('uses the thousands point', () => {
    expect(formatDecimal(200000, 0)).toBe('200.000');
  });
});

describe('formatInput (S17: the value in an input field)', () => {
  it('keeps every typed decimal instead of rounding', () => {
    expect(formatInput(0.035)).toBe('0,035');
    expect(formatInput(12.5)).toBe('12,5');
  });

  it('pads to the minimum decimals and groups thousands', () => {
    expect(formatInput(1.9, 2)).toBe('1,90');
    expect(formatInput(200000)).toBe('200.000');
  });

  it('writes negative values with the true minus sign', () => {
    expect(formatInput(-10)).toBe(`${minus}10`);
  });
});

describe('formatDate and formatTime (S16: "Stand" and "Gespeichert")', () => {
  // The CI runner is in UTC, so every test names its time zone.
  const at = '2026-11-14T11:04:31Z';

  it('writes the date with two-digit day and month', () => {
    expect(formatDate(at, 'Europe/Berlin')).toBe('14.11.2026');
    expect(formatDate('2026-01-05T10:00:00Z', 'Europe/Berlin')).toBe(
      '05.01.2026',
    );
  });

  it('writes the time in hours and minutes of the given zone', () => {
    expect(formatTime(at, 'Europe/Berlin')).toBe('12:04');
    expect(formatTime(at, 'UTC')).toBe('11:04');
  });

  it('takes the day of the given zone, not of UTC', () => {
    expect(formatDate('2026-11-14T23:30:00Z', 'Europe/Berlin')).toBe(
      '15.11.2026',
    );
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(formatTime(new Date(at), 'UTC')).toBe('11:04');
  });
});

describe('formatMonthYear (S18)', () => {
  it('writes month and year as MM/YYYY', () => {
    expect(formatMonthYear({ month: 3, year: 2022 })).toBe('03/2022');
    expect(formatMonthYear({ month: 11, year: 2026 })).toBe('11/2026');
  });
});
