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
    // The answer carries the hash itself, so the app can show it (Q5 in S24).
    expect(response.hash).toBe(hashResult(direct(scenario)));
  });

  it('Q5: the same request gives the same hash twice', async () => {
    const scenario = q1Scenario();
    const api = createCoreEndpoint();
    const first = await api.compute({ generation: 1, scenario });
    const second = await api.compute({ generation: 2, scenario });
    if (first.status !== 'done' || second.status !== 'done') {
      throw new Error('expected two finished runs');
    }
    expect(first.hash).toBe(second.hash);
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

  it('C4b: compute and compare leave out lease offers of a scenario that hides them', async () => {
    const api = createCoreEndpoint();
    const scenario = { ...exampleScenario(), includeLeaseOffers: false };
    const computed = await api.compute({ generation: 1, scenario });
    if (computed.status !== 'done') throw new Error('expected a finished run');
    const compared = await api.compare({ scenario });
    const purchases = scenario.candidates.map(
      (candidate) => `${candidate.id}:purchase`,
    );
    expect(Object.keys(computed.results).sort()).toEqual(purchases.sort());
    expect(Object.keys(compared.results).sort()).toEqual(purchases.sort());
    const shown = await api.compute({
      generation: 2,
      scenario: exampleScenario(),
    });
    if (shown.status !== 'done') throw new Error('expected a finished run');
    for (const offerId of purchases) {
      expect(computed.results[offerId]).toEqual(shown.results[offerId]);
    }
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

  it('S22: compare computes another scenario in the price case "Mittel" over the channel', async () => {
    const scenario = exampleScenario();
    const answer = await overChannel().compare({ scenario });
    expect(answer.scenarioId).toBe(scenario.id);
    const offers = scenario.candidates.flatMap((c) => listOffers(c));
    expect(Object.keys(answer.results).sort()).toEqual(
      offers.map((o) => o.offerId).sort(),
    );
    for (const offer of offers) {
      expect(Object.keys(answer.results[offer.offerId] ?? {})).toEqual(['mid']);
      expect(answer.results[offer.offerId]?.mid).toEqual(
        computeOffer(scenario, offer, 'mid', {}),
      );
    }
  });

  it('S22: compare does not stop the active run and is not stopped by it', async () => {
    const api = createCoreEndpoint();
    const scenario = exampleScenario();
    await api.compute({ generation: 7, scenario });
    // An older generation is superseded, a comparison has no generation at all.
    expect(await api.compute({ generation: 6, scenario })).toEqual({
      status: 'superseded',
      generation: 6,
    });
    const answer = await api.compare({ scenario });
    expect(Object.keys(answer.results).length).toBeGreaterThan(0);
    expect(await api.compute({ generation: 8, scenario })).toMatchObject({
      status: 'done',
    });
  });

  it('S22: compare yields between offers so that a newer compute can arrive', async () => {
    let yields = 0;
    const api = createCoreEndpoint({
      yieldToEventLoop: async () => {
        yields += 1;
      },
    });
    const scenario = exampleScenario();
    await api.compare({ scenario });
    expect(yields).toBe(
      scenario.candidates.flatMap((c) => listOffers(c)).length,
    );
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
