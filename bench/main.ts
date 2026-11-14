import { hashResult } from '../src/core';
import { runQ1 } from '../tests/bench/q1';
import { q1Scenario } from '../tests/fixtures/q1Scenario';

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
  const scenario = q1Scenario();
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
document.title = 'Q1 benchmark ready';
