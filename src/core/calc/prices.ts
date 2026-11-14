import type { PriceCase, ScenarioCompute, SliderPrices } from '../../domain';
import { detPow } from '../math/detPow';
import type { Trace } from '../trace';
import { fraction } from './units';

// Spec "Berechnungslogik" section 7: prices over the comparison period.

export type ResolvedPrices = {
  petrolPrice: number;
  electricityPrice: number;
  petrolEscalationPct: number;
  electricityEscalationPct: number;
};

/**
 * F7.qy: share of each year in the comparison, in years: the last year may be
 * partial, so D = 30 gives [1, 1, 0.5]. The shares add up to D / 12.
 */
export function yearShares(comparisonMonths: number, trace?: Trace): number[] {
  const years = Math.ceil(comparisonMonths / 12);
  const shares: number[] = [];
  for (let year = 1; year <= years; year++) {
    const months = Math.min(12, comparisonMonths - 12 * (year - 1));
    const q = months / 12;
    shares.push(q);
    trace?.add({
      formula: 'F7.qy',
      inputs: { year, comparisonMonths },
      value: q,
    });
  }
  return shares;
}

function escalationFactor(
  formula: 'F7.Fb' | 'F7.Fs',
  escalationPct: number,
  comparisonMonths: number,
  trace?: Trace,
): number {
  const base = 1 + fraction(escalationPct);
  const factor = yearShares(comparisonMonths).reduce(
    (sum, q, index) => sum + q * detPow(base, index),
    0,
  );
  trace?.add({
    formula,
    inputs: { escalationPct, comparisonMonths },
    value: factor,
  });
  return factor;
}

/** F7.Fb: petrol price factor, Σ q_y (1 + g_b)^(y-1). */
export const petrolFactor = (
  escalationPct: number,
  comparisonMonths: number,
  trace?: Trace,
): number => escalationFactor('F7.Fb', escalationPct, comparisonMonths, trace);

/** F7.Fs: electricity price factor, Σ q_y (1 + g_s)^(y-1). */
export const electricityFactor = (
  escalationPct: number,
  comparisonMonths: number,
  trace?: Trace,
): number => escalationFactor('F7.Fs', escalationPct, comparisonMonths, trace);

/** F7.Fm: factor for amounts that do not escalate, D / 12. */
export function maintenanceFactor(
  comparisonMonths: number,
  trace?: Trace,
): number {
  const factor = comparisonMonths / 12;
  trace?.add({
    formula: 'F7.Fm',
    inputs: { comparisonMonths },
    value: factor,
  });
  return factor;
}

/** The price case to resolve; only `slider` carries the slider prices. */
export type PriceSelection =
  | { priceCase: 'slider'; sliderPrices: SliderPrices }
  | { priceCase: Exclude<PriceCase, 'slider'> };

/**
 * Prices of a price case: mid; "E-Auto günstig" is petrol maximum with
 * electricity minimum, "E-Auto ungünstig" the reverse; `slider` takes the
 * slider prices. Escalation rates are the same in every case.
 */
export function resolvePrices(
  iceVehicle: ScenarioCompute['iceVehicle'],
  parameters: ScenarioCompute['parameters'],
  selection: PriceSelection,
): ResolvedPrices {
  const { petrolPrice } = iceVehicle;
  const { electricityPrice } = parameters;
  switch (selection.priceCase) {
    case 'mid':
      return rates({
        petrol: petrolPrice.mid,
        electricity: electricityPrice.mid,
      });
    case 'evFavorable':
      return rates({
        petrol: petrolPrice.max,
        electricity: electricityPrice.min,
      });
    case 'evUnfavorable':
      return rates({
        petrol: petrolPrice.min,
        electricity: electricityPrice.max,
      });
    case 'slider': {
      const { sliderPrices } = selection;
      return {
        petrolPrice: sliderPrices.petrol,
        electricityPrice: sliderPrices.electricity,
        petrolEscalationPct: sliderPrices.petrolEscalationPct,
        electricityEscalationPct: sliderPrices.electricityEscalationPct,
      };
    }
  }

  function rates(prices: {
    petrol: number;
    electricity: number;
  }): ResolvedPrices {
    return {
      petrolPrice: prices.petrol,
      electricityPrice: prices.electricity,
      petrolEscalationPct: iceVehicle.petrolEscalationPct,
      electricityEscalationPct: parameters.electricityEscalationPct,
    };
  }
}
