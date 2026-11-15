import { expect, test } from '@playwright/test';

// S14 in the browsers: the Q1 workload through the real core worker. Q5: its
// result hash equals the direct call on the main thread. The timings show
// what the worker adds (architecture 11.1). Run with `npm run bench:browser`.

type WorkerBenchResult = {
  workerMs: number[];
  directMs: number[];
  workerHash: string;
  directHash: string;
};

const RUNS = 4;
const round = (ms: number) => Math.round(ms * 10) / 10;
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

test('Q5 and overhead of the core worker', async ({ page, browserName }) => {
  await page.goto('/bench/index.html');
  await page.waitForFunction(() => 'runWorkerBench' in window);
  const result = await page.evaluate(
    (runs) =>
      (
        window as unknown as {
          runWorkerBench: (n: number) => Promise<WorkerBenchResult>;
        }
      ).runWorkerBench(runs),
    RUNS,
  );
  // The first run is cold (worker start, module load); the median is over the warm runs.
  const warmWorker = result.workerMs.slice(1);
  const warmDirect = result.directMs.slice(1);
  console.log(
    `Worker ${browserName}: worker ${warmWorker.map(round).join(' / ')} ms (median ${round(median(warmWorker))}, cold ${round(result.workerMs[0] ?? 0)}), direct ${warmDirect.map(round).join(' / ')} ms (median ${round(median(warmDirect))}), hash ${result.workerHash}`,
  );
  expect(result.workerHash).toBe(result.directHash);
});
