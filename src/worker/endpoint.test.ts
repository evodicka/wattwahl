import { expose, releaseProxy, wrap } from 'comlink';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import { q1Scenario } from '../../tests/fixtures/q1Scenario';
import { ComputeCache, computeOffer, hashResult } from '../core';
import { listOffers, type Scenario } from '../domain';
import {
  BASE_PRICE_CASES,
  createCoreEndpoint,
  type CoreApi,
  type OfferResults,
} from './endpoint';

// S14: the worker calls. Over Comlink and a MessageChannel the scenario and
// the results go through real structured cloning, as between the threads.

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function overChannel(): CoreApi {
  const { port1, port2 } = new NodeMessageChannel();
  expose(createCoreEndpoint(), port1 as never);
  const api = wrap<CoreApi>(port2 as never);
  cleanups.push(() => {
    api[releaseProxy]();
    port1.close();
    port2.close();
  });
  return api as unknown as CoreApi;
}

/** The same work as the worker, called directly (S10). */
function direct(scenario: Scenario): OfferResults {
  const cache = new ComputeCache();
  const results: OfferResults = {};
  for (const candidate of scenario.candidates) {
    for (const offer of listOffers(candidate)) {
      results[offer.offerId] = Object.fromEntries(
        BASE_PRICE_CASES.map((priceCase) => [
          priceCase,
          computeOffer(scenario, offer, priceCase, { cache }),
        ]),
      );
    }
  }
  return results;
}

describe('S14: worker endpoint', () => {
  it('Q5: the core behind Comlink gives the same result hash as the direct call', async () => {
    const scenario = q1Scenario();
    const response = await overChannel().compute({ generation: 1, scenario });
    expect(response.status).toBe('done');
    if (response.status !== 'done') return;
    expect(response.scenarioId).toBe(scenario.id);
    expect(Object.keys(response.results)).toHaveLength(50);
    expect(hashResult(response.results)).toBe(hashResult(direct(scenario)));
  });

  it('computes the price case "slider" only while the slider is active', async () => {
    const api = createCoreEndpoint();
    const scenario = exampleScenario();
    const without = await api.compute({ generation: 1, scenario });
    const withSlider = await api.compute({
      generation: 2,
      scenario,
      sliderPrices: {
        petrol: 1.8,
        electricity: 0.3,
        petrolEscalationPct: 2,
        electricityEscalationPct: 2,
      },
    });
    if (without.status !== 'done' || withSlider.status !== 'done') {
      throw new Error('expected both runs to finish');
    }
    const cases = (results: OfferResults) =>
      Object.values(results).map((byCase) => Object.keys(byCase).sort());
    expect(cases(without.results)).toEqual(
      cases(without.results).map(() => [...BASE_PRICE_CASES].sort()),
    );
    expect(cases(withSlider.results)).toEqual(
      cases(withSlider.results).map(() =>
        [...BASE_PRICE_CASES, 'slider'].sort(),
      ),
    );
  });

  it('a run overtaken by a newer generation ends with "superseded"', async () => {
    const api = createCoreEndpoint();
    const scenario = q1Scenario();
    const first = api.compute({ generation: 1, scenario });
    const second = api.compute({ generation: 2, scenario });
    expect(await first).toEqual({ status: 'superseded', generation: 1 });
    expect((await second).status).toBe('done');
  });

  it('a request older than one already received ends with "superseded" at once', async () => {
    const api = createCoreEndpoint();
    await api.compute({ generation: 5, scenario: exampleScenario() });
    expect(
      await api.compute({ generation: 4, scenario: exampleScenario() }),
    ).toEqual({ status: 'superseded', generation: 4 });
  });

  it('explain recomputes one offer with its Rechenweg', async () => {
    const scenario = exampleScenario();
    const [offer] = listOffers(scenario.candidates[0] as never);
    const { result, trace } = await overChannel().explain({
      scenario,
      offerId: offer?.offerId as string,
      priceCase: 'mid',
    });
    expect(result).toEqual(computeOffer(scenario, offer as never, 'mid', {}));
    expect(trace.length).toBeGreaterThan(0);
    expect(trace.some((entry) => entry.formula === 'OPT.select')).toBe(true);
  });

  it('explain rejects something that is not an offer id', async () => {
    await expect(
      createCoreEndpoint().explain({
        scenario: exampleScenario(),
        offerId: 'nonsense',
        priceCase: 'mid',
      }),
    ).rejects.toThrow(RangeError);
  });
});
