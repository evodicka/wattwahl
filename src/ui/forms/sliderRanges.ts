import type { Scenario, SliderPrices } from '../../domain';

/** The range of one slider: the ends, the step and the scenario's own mid value. */
export type SliderRange = {
  min: number;
  max: number;
  step: number;
  mid: number;
};

export type SliderRanges = Record<keyof SliderPrices, SliderRange>;

const PRICE_STEP = 0.01;
const ESCALATION_STEP = 0.5;
const ESCALATION_RANGE = { min: 0, max: 10 } as const;

const floorTo = (value: number, step: number) =>
  Math.floor(value / step + 1e-9) * step;
const ceilTo = (value: number, step: number) =>
  Math.ceil(value / step - 1e-9) * step;
const round = (value: number) => Number(value.toFixed(4));

/** Half the minimum to one and a half times the maximum, wide enough for the value it holds. */
function priceRange(
  price: { min: number | null; mid: number; max: number | null },
  value: number,
): SliderRange {
  const low = floorTo(0.5 * (price.min ?? price.mid), PRICE_STEP);
  const high = ceilTo(1.5 * (price.max ?? price.mid), PRICE_STEP);
  return {
    min: round(Math.max(0, Math.min(low, floorTo(value, PRICE_STEP)))),
    max: round(Math.max(high, ceilTo(value, PRICE_STEP))),
    step: PRICE_STEP,
    mid: price.mid,
  };
}

/** From the scenario's own value and the fixed ends, so the track does not move while the slider is dragged. */
function escalationRange(mid: number): SliderRange {
  return {
    min: Math.min(ESCALATION_RANGE.min, floorTo(mid, ESCALATION_STEP)),
    max: Math.max(ESCALATION_RANGE.max, ceilTo(mid, ESCALATION_STEP)),
    step: ESCALATION_STEP,
    mid,
  };
}

/**
 * Ranges of the four sliders for a scenario: prices from half the minimum to
 * one and a half times the maximum in steps of 1 cent, escalations from 0 to
 * 10 % in steps of 0.5. A range always includes the value the slider holds.
 * `null` while a mid price is missing.
 */
export function sliderRanges(
  scenario: Scenario,
  values: SliderPrices,
): SliderRanges | null {
  const petrol = scenario.iceVehicle.petrolPrice;
  const electricity = scenario.parameters.electricityPrice;
  if (petrol.mid === null || electricity.mid === null) return null;
  return {
    petrol: priceRange({ ...petrol, mid: petrol.mid }, values.petrol),
    electricity: priceRange(
      { ...electricity, mid: electricity.mid },
      values.electricity,
    ),
    petrolEscalationPct: escalationRange(
      scenario.iceVehicle.petrolEscalationPct,
    ),
    electricityEscalationPct: escalationRange(
      scenario.parameters.electricityEscalationPct,
    ),
  };
}
