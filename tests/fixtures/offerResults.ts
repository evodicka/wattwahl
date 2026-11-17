import { Trace, computeOffer } from '../../src/core';
import {
  listScenarioOffers,
  parseOfferId,
  type TraceEntry,
  type OfferResult,
  type PriceCase,
  type Scenario,
  type SliderPrices,
} from '../../src/domain';

/** Results of every offer in the three price cases, as the worker sends them (8.5). */
export function computeResults(
  scenario: Scenario,
  options: { sliderPrices?: SliderPrices } = {},
): Record<string, Partial<Record<PriceCase, OfferResult>>> {
  const results: Record<string, Partial<Record<PriceCase, OfferResult>>> = {};
  for (const candidate of scenario.candidates) {
    for (const offer of listScenarioOffers(scenario, candidate)) {
      results[offer.offerId] = {};
      const cases: PriceCase[] = options.sliderPrices
        ? ['mid', 'evFavorable', 'evUnfavorable', 'slider']
        : ['mid', 'evFavorable', 'evUnfavorable'];
      for (const priceCase of cases) {
        results[offer.offerId] = {
          ...results[offer.offerId],
          [priceCase]: computeOffer(scenario, offer, priceCase, options),
        };
      }
    }
  }
  return results;
}

/** What the worker's `explain` answers: the result of one offer with the steps of its Rechenweg. */
export function explainOffer(
  scenario: Scenario,
  offerId: string,
  priceCase: PriceCase,
  options: { sliderPrices?: SliderPrices } = {},
): { result: OfferResult; trace: TraceEntry[] } {
  const offer = parseOfferId(offerId);
  if (!offer) throw new Error(`not an offer id: ${offerId}`);
  const trace = new Trace();
  const result = computeOffer(scenario, offer, priceCase, {
    trace,
    ...options,
  });
  return { result, trace: trace.entries };
}
