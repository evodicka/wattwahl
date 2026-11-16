import { expect, type Page } from '@playwright/test';
import { createCoreEndpoint } from '../src/worker/endpoint';
import { buildExport, parseImport } from '../src/storage/exportImport';
import { q1Scenario } from '../tests/fixtures/q1Scenario';
import { open } from './helpers';

// The Q1 measurement scenario (10 candidates, purchase and 4 lease tiers each,
// 3 price cases) as an import file, and the hash its results must have.

/** A fixed time: the file is the same on every run. */
const EXPORTED_AT = new Date('2026-11-16T12:00:00.000Z');

export const Q1_SCENARIO_ID = q1Scenario().id;

export function q1File(): string {
  return buildExport([q1Scenario()], EXPORTED_AT).content;
}

/**
 * The hash of the results as the core computes them in Node, from the
 * scenario as the import reads it (migrated, checked against the schema).
 * The browsers must reproduce it bit for bit (Q5).
 */
export async function expectedQ1Hash(): Promise<string> {
  const parsed = await parseImport(new Blob([q1File()]), {
    now: () => EXPORTED_AT,
  });
  if (parsed.status !== 'ok') throw new Error('the Q1 file does not import');
  const [scenario] = parsed.scenarios;
  if (!scenario) throw new Error('the Q1 file has no scenario');
  const response = await createCoreEndpoint({
    yieldToEventLoop: async () => {},
  }).compute({ generation: 1, scenario });
  if (response.status !== 'done') throw new Error('the Q1 run was superseded');
  return response.hash;
}

/**
 * Reads the Q1 file in, replacing the stored scenarios, and returns right
 * after the click on "Ersetzen". `window.__q1Start` holds the time of the click
 * for `q1Result`.
 */
export async function startQ1Import(page: Page): Promise<void> {
  await open(page, '/szenarien');
  await page
    .getByRole('radio', { name: 'Alle vorhandenen Szenarien ersetzen' })
    .check();
  await page.getByLabel('Datei auswählen').setInputFiles({
    name: 'q1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(q1File()),
  });
  const replace = page.getByRole('button', { name: 'Ersetzen', exact: true });
  await expect(replace).toBeEnabled();
  await replace.evaluate(() => {
    (window as unknown as { __q1Start: number }).__q1Start = performance.now();
  });
  await replace.click();
}

export type Q1Result = {
  /** Round trip through the worker, structured clone included (`computeMs`). */
  computeMs: number;
  /** From the click on "Ersetzen" until the result probe shows it. */
  endToEndMs: number;
  hash: string;
};

/** Waits for the result of the imported Q1 scenario, then reads the hooks of the result probe. */
export async function q1Result(
  page: Page,
  timeoutMs: number,
): Promise<Q1Result> {
  const handle = await page.waitForFunction(
    (scenarioId) => {
      const probe = document.querySelector('[data-testid="result-probe"]');
      if (probe?.getAttribute('data-scenario-id') !== scenarioId) return null;
      return {
        computeMs: Number(probe.getAttribute('data-compute-ms')),
        hash: probe.getAttribute('data-result-hash') ?? '',
        endToEndMs:
          performance.now() -
          (window as unknown as { __q1Start: number }).__q1Start,
      };
    },
    Q1_SCENARIO_ID,
    { timeout: timeoutMs, polling: 'raf' },
  );
  return (await handle.jsonValue()) as Q1Result;
}
