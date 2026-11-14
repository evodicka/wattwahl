import { ComputeCache, computeOffer } from '../../src/core';
import {
  listOffers,
  type Offer,
  type OfferResult,
  type Scenario,
} from '../../src/domain';

// The Q1 workload (architecture 10): every offer of every candidate in the
// three price cases, as the worker will run it after an input.

export const Q1_PRICE_CASES = ['mid', 'evFavorable', 'evUnfavorable'] as const;

export function q1Offers(scenario: Scenario): Offer[] {
  return scenario.candidates.flatMap((candidate) => listOffers(candidate));
}

/** One full recalculation. `shared` lets the offers of a candidate share their DP, as the worker does. */
export function runQ1(
  scenario: Scenario,
  shared = true,
): { ms: number; results: OfferResult[] } {
  const offers = q1Offers(scenario);
  const cache = shared ? new ComputeCache() : undefined;
  const start = performance.now();
  const results: OfferResult[] = [];
  for (const priceCase of Q1_PRICE_CASES) {
    for (const offer of offers) {
      results.push(computeOffer(scenario, offer, priceCase, { cache }));
    }
  }
  return { ms: performance.now() - start, results };
}

export const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};
