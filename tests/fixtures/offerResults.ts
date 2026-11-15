import { computeOffer } from '../../src/core';
import {
  listOffers,
  type OfferResult,
  type PriceCase,
  type Scenario,
} from '../../src/domain';

/** Results of every offer in the three price cases, as the worker sends them (8.5). */
export function computeResults(
  scenario: Scenario,
): Record<string, Partial<Record<PriceCase, OfferResult>>> {
  const results: Record<string, Partial<Record<PriceCase, OfferResult>>> = {};
  for (const candidate of scenario.candidates) {
    for (const offer of listOffers(candidate)) {
      results[offer.offerId] = {};
      for (const priceCase of [
        'mid',
        'evFavorable',
        'evUnfavorable',
      ] as const) {
        results[offer.offerId] = {
          ...results[offer.offerId],
          [priceCase]: computeOffer(scenario, offer, priceCase),
        };
      }
    }
  }
  return results;
}
