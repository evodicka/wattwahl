import { ComputeCache, Trace, computeOffer } from '../core';
import {
  listOffers,
  parseOfferId,
  type OfferResult,
  type PriceCase,
  type Scenario,
  type SliderPrices,
  type TraceEntry,
} from '../domain';

// The worker's calls of architecture 8.5, as plain code: core.worker.ts only
// exposes them over Comlink, so they run in Node tests as well.

/** The price cases of every run; `slider` is added while the slider is active. */
export const BASE_PRICE_CASES = [
  'mid',
  'evFavorable',
  'evUnfavorable',
] as const;

export type ComputeRequest = {
  generation: number;
  scenario: Scenario;
  sliderPrices?: SliderPrices;
};

/** One result per offer id and price case. */
export type OfferResults = Record<
  string,
  Partial<Record<PriceCase, OfferResult>>
>;

export type ComputeResponse =
  | {
      status: 'done';
      generation: number;
      scenarioId: string;
      results: OfferResults;
    }
  /** A newer request arrived; this run stopped between two offers. */
  | { status: 'superseded'; generation: number };

export type ExplainRequest = {
  scenario: Scenario;
  offerId: string;
  priceCase: PriceCase;
  sliderPrices?: SliderPrices;
};

export type ExplainResponse = { result: OfferResult; trace: TraceEntry[] };

export type CoreApi = {
  compute(request: ComputeRequest): Promise<ComputeResponse>;
  explain(request: ExplainRequest): Promise<ExplainResponse>;
};

/**
 * Hands control back to the event loop with a macrotask, so a newer request
 * can arrive between two offers (8.5). A microtask would not let it in.
 */
export function macrotask(): Promise<void> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}

export function createCoreEndpoint(
  options: { yieldToEventLoop?: () => Promise<void> } = {},
): CoreApi {
  const { yieldToEventLoop = macrotask } = options;
  // The highest generation received so far; older runs stop at the next offer.
  let latestGeneration = -Infinity;
  // Shares the checks and the DP between the offers of one candidate. Every
  // request brings a new scenario object, so it starts over per request.
  const cache = new ComputeCache();

  async function compute(request: ComputeRequest): Promise<ComputeResponse> {
    const { generation, scenario, sliderPrices } = request;
    latestGeneration = Math.max(latestGeneration, generation);
    const priceCases: PriceCase[] = sliderPrices
      ? [...BASE_PRICE_CASES, 'slider']
      : [...BASE_PRICE_CASES];
    const results: OfferResults = {};
    for (const candidate of scenario.candidates) {
      for (const offer of listOffers(candidate)) {
        await yieldToEventLoop();
        if (generation < latestGeneration) {
          return { status: 'superseded', generation };
        }
        const byCase: Partial<Record<PriceCase, OfferResult>> = {};
        for (const priceCase of priceCases) {
          byCase[priceCase] = computeOffer(scenario, offer, priceCase, {
            sliderPrices,
            cache,
          });
        }
        results[offer.offerId] = byCase;
      }
    }
    return { status: 'done', generation, scenarioId: scenario.id, results };
  }

  async function explain(request: ExplainRequest): Promise<ExplainResponse> {
    const { scenario, offerId, priceCase, sliderPrices } = request;
    const offer = parseOfferId(offerId);
    if (!offer) throw new RangeError(`"${offerId}" is not an offer id.`);
    // Without the cache, so the Rechenweg is complete (8.5).
    const trace = new Trace();
    const result = computeOffer(scenario, offer, priceCase, {
      sliderPrices,
      trace,
    });
    return { result, trace: trace.entries };
  }

  return { compute, explain };
}
