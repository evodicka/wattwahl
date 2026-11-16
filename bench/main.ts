import { ComputeCache, computeOffer, hashResult } from '../src/core';
import { listOffers, type Scenario } from '../src/domain';
import {
  BASE_PRICE_CASES,
  spawnCoreWorker,
  type OfferResults,
} from '../src/worker';
import { runQ1 } from '../tests/bench/q1';
import { Q1_SWITCH_PARAMETERS, q1Scenario } from '../tests/fixtures/q1Scenario';

// `?plan=switch` measures mode `switch` (C3b), otherwise mode `fixed`.
const scenarioOfPage = () =>
  q1Scenario(
    new URLSearchParams(location.search).get('plan') === 'switch'
      ? Q1_SWITCH_PARAMETERS
      : {},
  );

// Test-only entry of the browser benchmark (S11). It runs the Q1 workload in
// the page on the main thread, which is the same work the worker will do, and
// hands the timings and the result hash to Playwright.

export type Q1BenchResult = {
  /** Milliseconds per run; the first run is cold. */
  timesMs: number[];
  /** Hash of the last run's results, equal in every engine (Q5). */
  hash: string;
  /** How many of the 150 results are computed plans. */
  planCount: number;
  resultCount: number;
};

function runBench(runs: number): Q1BenchResult {
  const scenario = scenarioOfPage();
  const timesMs: number[] = [];
  let last: ReturnType<typeof runQ1> | undefined;
  for (let run = 0; run < runs; run++) {
    last = runQ1(scenario);
    timesMs.push(last.ms);
  }
  const results = last?.results ?? [];
  return {
    timesMs,
    hash: hashResult(results),
    planCount: results.filter((result) => result.status === 'ok').length,
    resultCount: results.length,
  };
}

Object.assign(window, { runQ1Bench: runBench });

// S14: the same workload through the real core worker (Comlink, structured
// cloning), against the direct call on the main thread.

export type WorkerBenchResult = {
  workerMs: number[];
  directMs: number[];
  workerHash: string;
  directHash: string;
};

function directResults(scenario: Scenario): OfferResults {
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

async function runWorkerBench(runs: number): Promise<WorkerBenchResult> {
  const scenario = scenarioOfPage();
  const worker = spawnCoreWorker();
  const workerMs: number[] = [];
  const directMs: number[] = [];
  let workerResults: OfferResults = {};
  let direct: OfferResults = {};
  try {
    for (let run = 0; run < runs; run++) {
      let start = performance.now();
      const response = await worker.api.compute({ generation: run, scenario });
      workerMs.push(performance.now() - start);
      if (response.status !== 'done') throw new Error('worker run superseded');
      workerResults = response.results;
      start = performance.now();
      direct = directResults(scenario);
      directMs.push(performance.now() - start);
    }
  } finally {
    worker.terminate();
  }
  return {
    workerMs,
    directMs,
    workerHash: hashResult(workerResults),
    directHash: hashResult(direct),
  };
}

Object.assign(window, { runWorkerBench });

document.title = 'Q1 benchmark ready';
