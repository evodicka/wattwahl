import { formatKm, i18n } from '../../i18n';
import type { Scenario } from '../../domain';

// German names of the fields a path points to. The core reports missing fields
// as `candidates[2].netCapacityKwh`, the validation as `candidates.2.…`; both
// forms are read. Used for "Es fehlen 3 Angaben" (S18, S19) and, later, for
// import errors (S22).

const text = (
  ns: 'common' | 'kandidaten' | 'fahrprofil' | 'parameter',
  key: string,
  options: Record<string, unknown> = {},
): string => i18n.t(key as never, { ns, ...options }) as unknown as string;

const road = (key: string) => text('common', `roadTypes.${key}`);

const CANDIDATE_FIELDS: Record<string, string> = {
  name: 'form.name',
  note: 'form.note',
  condition: 'form.condition',
  purchasePrice: 'form.purchasePrice',
  firstRegistration: 'form.firstRegistration',
  mileageKm: 'form.mileage',
  netCapacityKwh: 'form.capacity',
  sohKnownPct: 'form.soh',
  depreciationPctPerYear: 'form.depreciation',
  maintenancePerKm: 'form.maintenance',
};

const LEASE_FIELDS: Record<string, string> = {
  tierKmPerYear: 'form.tier',
  monthlyRate: 'form.monthlyRate',
  termMonths: 'form.term',
  downPayment: 'form.downPayment',
  extraKmPrice: 'form.extraKmPrice',
  underKmRefund: 'form.underKmRefund',
};

function candidateLabel(rest: string[], scenario?: Scenario, index = 0) {
  const [field, a, b] = rest;
  if (field === undefined) return null;
  const direct = CANDIDATE_FIELDS[field];
  if (direct) return text('kandidaten', direct);
  if (field === 'rangeKm' && a && b) {
    return text('kandidaten', 'card.fieldRange', {
      road: road(a),
      weather: text('common', `weather.${b === 'cold' ? 'cold' : 'mild'}`),
    });
  }
  if (field === 'vehicleWarranty' || field === 'batteryWarranty') {
    return text('kandidaten', 'card.fieldWarranty', {
      group: text(
        'kandidaten',
        field === 'vehicleWarranty'
          ? 'form.vehicleWarranty'
          : 'form.batteryWarranty',
      ),
      field: text(
        'kandidaten',
        a === 'km' ? 'form.warrantyKm' : 'form.warrantyYears',
      ),
    });
  }
  if (field === 'leaseTiers' && a && b) {
    const tier = scenario?.candidates[index]?.leaseTiers[Number(a)];
    const km = tier?.tierKmPerYear;
    const fieldKey = LEASE_FIELDS[b];
    return text('kandidaten', 'card.fieldLease', {
      tier: km !== undefined ? formatKm(km) : String(Number(a) + 1),
      field: fieldKey ? text('kandidaten', fieldKey) : b,
    });
  }
  return null;
}

function scenarioLabel(parts: string[]): string | null {
  const [area, a, b, c] = parts;
  if (area === 'iceVehicle') {
    if (a === 'name') return text('fahrprofil', 'vehicle.name');
    if (a === 'consumptionLPer100Km' && b) {
      return text('fahrprofil', 'vehicle.consumption', { roadType: road(b) });
    }
    if (a === 'mileageKm') return text('fahrprofil', 'vehicle.odometer');
    if (a === 'maintenancePerKm')
      return text('fahrprofil', 'vehicle.maintenance');
    if (a === 'petrolPrice' && b) {
      const min = text('fahrprofil', 'vehicle.petrolMin');
      if (b === 'min') return min;
      const key = b === 'mid' ? 'vehicle.petrolMid' : 'vehicle.petrolMax';
      return `${min.replace(/ Minimum$/, '')} ${text('fahrprofil', key)}`;
    }
  }
  if (area === 'workplaces' && (a === 'a' || a === 'b') && b) {
    const title = text(
      'fahrprofil',
      a === 'a' ? 'workplace.titleA' : 'workplace.titleB',
    );
    const field =
      b === 'name'
        ? text('fahrprofil', 'workplace.name')
        : b === 'commute' && c
          ? text('fahrprofil', 'workplace.way', { roadType: road(c) })
          : b === 'weekdays'
            ? text('fahrprofil', 'workplace.weekdays')
            : b === 'freeDaysPerYear'
              ? text('fahrprofil', 'workplace.freeDays')
              : null;
    return field
      ? text('common', 'field.inGroup', { group: title, field })
      : null;
  }
  if (area === 'extraMileage' && b) {
    return text('common', 'field.inGroup', {
      group: text('fahrprofil', 'extra.title'),
      field: road(b === 'kmPerMonth' && c ? c : b),
    });
  }
  if (area === 'parameters') {
    if (a === 'electricityPrice' && b) {
      const key = {
        min: 'electricityMin',
        mid: 'electricityMid',
        max: 'electricityMax',
      }[b];
      return key ? text('parameter', key) : null;
    }
    if (a === 'evMaintenancePerKm') return text('parameter', 'evMaintenance');
  }
  return null;
}

/**
 * The name of the field at `path`. A path the map does not know is returned
 * as it is, so a new field never shows up blank.
 */
export function labelOfPath(path: string, scenario?: Scenario): string {
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  if (parts[0] === 'candidates' && parts[1] !== undefined) {
    const label = candidateLabel(parts.slice(2), scenario, Number(parts[1]));
    if (label) return label;
  }
  return scenarioLabel(parts) ?? path;
}
