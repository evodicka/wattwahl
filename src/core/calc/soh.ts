import type { CandidateCompute, Parameters } from '../../domain';
import type { Trace } from '../trace';
import { finiteRatio, fraction } from './units';

// Spec "Berechnungslogik" section 2: battery ageing (SoH). All values are
// fractions of the original capacity.

export type SohCurve = {
  soh0: number;
  /** Odometer reading at which `soh0` applies (architecture 8.4, E3). */
  k0: number;
  sohMin: number;
  /** SoH lost per km. */
  slope: number;
};

/** F2.slope: s = (1 - SoH_min) / k_SoH. Without a distance to SoH_min the car ages at once (largest finite slope). */
export function sohSlope(
  sohMinPct: number,
  kmToSohMin: number,
  trace?: Trace,
): number {
  const slope = finiteRatio(1 - fraction(sohMinPct), kmToSohMin);
  trace?.add({
    formula: 'F2.slope',
    inputs: { sohMinPct, kmToSohMin },
    value: slope,
  });
  return slope;
}

/**
 * The ageing curve of one candidate. The curve starts at the current
 * mileage: a known SoH applies there, without one the car was new at 0 km.
 */
export function sohCurve(
  parameters: Pick<Parameters, 'sohMinPct' | 'kmToSohMin'>,
  candidate: Pick<CandidateCompute, 'mileageKm' | 'sohKnownPct'>,
  trace?: Trace,
): SohCurve {
  const known = candidate.sohKnownPct;
  return {
    soh0: known === null ? 1 : fraction(known),
    k0: known === null ? 0 : candidate.mileageKm,
    sohMin: fraction(parameters.sohMinPct),
    slope: sohSlope(parameters.sohMinPct, parameters.kmToSohMin, trace),
  };
}

/** F2.soh: SoH(k) = max(min(SoH_min, SoH_0), SoH_0 - s (k - k_0)). */
export function sohAt(curve: SohCurve, km: number, trace?: Trace): number {
  const soh = Math.max(
    Math.min(curve.sohMin, curve.soh0),
    curve.soh0 - curve.slope * (km - curve.k0),
  );
  trace?.add({
    formula: 'F2.soh',
    inputs: {
      km,
      soh0: curve.soh0,
      k0: curve.k0,
      sohMin: curve.sohMin,
      slope: curve.slope,
    },
    value: soh,
  });
  return soh;
}

/** F2.kEnd: odometer reading at the end of the comparison, mileage + K_EV · D/12. */
export function sohKEnd(
  mileageKm: number,
  evKmPerYear: number,
  comparisonMonths: number,
  trace?: Trace,
): number {
  const kEnd = mileageKm + (evKmPerYear * comparisonMonths) / 12;
  trace?.add({
    formula: 'F2.kEnd',
    inputs: { mileageKm, evKmPerYear, comparisonMonths },
    value: kEnd,
  });
  return kEnd;
}
