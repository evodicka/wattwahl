import { expect, test, type Page } from '@playwright/test';

// Q1 in the browsers (S11): Chromium, Firefox and WebKit, and Chromium with
// the CPU slowed down 4 times as the approximation of a mid-range phone. Run
// with `npm run bench:browser`. CDP throttling exists only in Chromium.

type Q1BenchResult = {
  timesMs: number[];
  hash: string;
  planCount: number;
  resultCount: number;
};

const RUNS = 4;
const round = (ms: number) => Math.round(ms * 10) / 10;
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

async function measure(page: Page): Promise<Q1BenchResult> {
  await page.goto('/bench/index.html');
  // The dev server may reload the page once after it has bundled the packages.
  await page.waitForFunction(() => 'runQ1Bench' in window);
  return page.evaluate(
    (runs) =>
      (
        window as unknown as { runQ1Bench: (n: number) => Q1BenchResult }
      ).runQ1Bench(runs),
    RUNS,
  );
}

function report(label: string, result: Q1BenchResult): void {
  const warm = result.timesMs.slice(1);
  console.log(
    `Q1 ${label}: cold ${round(result.timesMs[0] ?? 0)} ms, warm ${warm
      .map(round)
      .join(
        ' / ',
      )} ms, median of the warm runs ${round(median(warm))} ms, plans ${result.planCount}/${result.resultCount}, hash ${result.hash}`,
  );
}

test('Q1 without throttling', async ({ page, browserName }) => {
  const result = await measure(page);
  report(browserName, result);
  expect(result.planCount).toBe(result.resultCount);
});

test('Q1 with the CPU slowed down 4 times (phone approximation)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CPU throttling needs CDP (Chromium)');
  await page.goto('/bench/index.html');
  await page.waitForFunction(() => 'runQ1Bench' in window);
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const result = await page.evaluate(
    (runs) =>
      (
        window as unknown as { runQ1Bench: (n: number) => Q1BenchResult }
      ).runQ1Bench(runs),
    RUNS,
  );
  report('chromium, CPU 4x slower', result);
  expect(result.planCount).toBe(result.resultCount);
});
