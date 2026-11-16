import AxeBuilder from '@axe-core/playwright';
import {
  chromium,
  expect,
  firefox,
  test,
  webkit,
  type Page,
} from '@playwright/test';
import { cutOffFields, open, seedScenario, waitSaved } from './helpers';
import { expectedQ1Hash, q1Result, startQ1Import } from './q1';

// S24: the quality scenarios and acceptance criteria that need the finished
// app (architecture 10, specification "Abnahmekriterien"). Ids are in the
// titles, so the coverage table can be built from them.
//
// Q1 limits (specification, non-functional requirements): a full recalculation
// of 10 candidates with purchase and 4 lease tiers in 3 price cases in at most
// 2 s on the desktop and 5 s on a mid-range phone. The desktop limit is
// measured on a developer machine and asserted only with `Q1_STRICT=1`; a CI
// runner is several times slower than the machine the limits were set for.
// Without it the test asserts that the result arrives at all (CAP_MS) and logs
// the time.
//
// There is no phone variant here. Chromium's CPU throttling (CDP
// `Emulation.setCPUThrottlingRate`) reaches the page but not its dedicated
// worker: the recalculation took 944 ms with the CPU 4 times slower and 946 ms
// without, so a throttled test would pass without testing anything. The phone
// limit rests on the S11 measurement (main thread, 4 times slower: 3.4 s,
// architecture 11.1) and on the real device in S26.

const STRICT = process.env.Q1_STRICT === '1';
const DESKTOP_LIMIT_MS = 2_000;
const THROTTLE = 4;
const CAP_MS = 60_000;

/**
 * `computeMs` is the round trip through the worker, structured clone in both
 * directions included. That is the "Vollständige Neuberechnung" of the
 * specification. The end-to-end time (file read, migration, check, database,
 * result on screen) is reported but not asserted.
 */
function report(
  label: string,
  result: { computeMs: number; endToEndMs: number },
) {
  console.log(
    `Q1 ${label}: recalculation ${Math.round(result.computeMs)} ms, ` +
      `import to result ${Math.round(result.endToEndMs)} ms`,
  );
}

test.describe('S24: Q1, Q5 (the 10-candidate scenario in the app)', () => {
  test.setTimeout(CAP_MS + 30_000);

  test('Q1: the full recalculation is within the desktop limit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await startQ1Import(page);
    const result = await q1Result(page, CAP_MS);
    report('desktop', result);
    expect(result.computeMs).toBeLessThan(CAP_MS);
    if (STRICT) expect(result.computeMs).toBeLessThanOrEqual(DESKTOP_LIMIT_MS);
  });

  test('Q5: the results of the app have the hash the core gives in Node', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await startQ1Import(page);
    const result = await q1Result(page, CAP_MS);
    const expected = await expectedQ1Hash();
    // Every engine equals Node, so the three engines equal each other.
    console.log(`Q5 ${browserName}: ${result.hash}`);
    expect(result.hash).toBe(expected);
  });
});

test.describe('S24: Q2 (typing during a recalculation)', () => {
  test.setTimeout(CAP_MS + 30_000);

  // 100 ms is the limit under which an answer to an input feels instant (the
  // RAIL budget for a response). The run is in the worker, so the limit holds
  // on a CI runner too; a key must not wait for the recalculation.
  const KEY_LATENCY_LIMIT_MS = 100;

  /** Types a price into the field and returns the delay of every key until the next frame. */
  async function typeAndMeasure(page: Page) {
    const field = page.locator('[id="f-parameters.electricityPrice.mid"]');
    await field.focus();
    await field.selectText();
    await page.evaluate(() => {
      const w = window as unknown as {
        __keys: { latency: number; updating: boolean }[];
      };
      w.__keys = [];
      let down = 0;
      document.addEventListener(
        'keydown',
        (event) => {
          down = event.timeStamp;
        },
        true,
      );
      document.addEventListener(
        'input',
        () => {
          const updating =
            document
              .querySelector('[data-testid="result-probe"]')
              ?.getAttribute('data-updating') === 'true';
          requestAnimationFrame(() => {
            w.__keys.push({ latency: performance.now() - down, updating });
          });
        },
        true,
      );
    });
    await page.keyboard.type('0,331', { delay: 60 });
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __keys: unknown[] }).__keys.length,
        ),
      )
      .toBe(5);
    return page.evaluate(
      () =>
        (
          window as unknown as {
            __keys: { latency: number; updating: boolean }[];
          }
        ).__keys,
    );
  }

  for (const throttle of [1, THROTTLE]) {
    test(`Q2: a key in the form answers within ${KEY_LATENCY_LIMIT_MS} ms while the Q1 scenario is computed${throttle > 1 ? ` (CPU ${throttle} times slower)` : ''}`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        throttle > 1 && browserName !== 'chromium',
        'CPU throttling needs CDP (Chromium)',
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      if (throttle > 1) {
        const client = await page.context().newCDPSession(page);
        await client.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      }
      await startQ1Import(page);
      await page.getByRole('link', { name: 'Parameter' }).first().click();
      // The import run is on its way while the first key is typed.
      await expect(page.getByTestId('result-probe')).toHaveAttribute(
        'data-updating',
        'true',
      );
      const keys = await typeAndMeasure(page);
      console.log(
        `Q2 ${browserName}${throttle > 1 ? ` x${throttle}` : ''}: key delays ` +
          keys.map((key) => Math.round(key.latency)).join(' / ') +
          ' ms',
      );
      expect(keys[0]?.updating, 'the first key came during a run').toBe(true);
      for (const key of keys) {
        expect(key.latency).toBeLessThanOrEqual(KEY_LATENCY_LIMIT_MS);
      }
      // The typed value arrived whole.
      await expect(
        page.locator('[id="f-parameters.electricityPrice.mid"]'),
      ).toHaveValue('0,331');
    });
  }
});

test.describe('S24: Q8 (persistence in a persistent browser context)', () => {
  test('Q8: after a reload and after the browser was closed and started again, everything is there', async ({
    browserName,
  }, testInfo) => {
    const type = { chromium, firefox, webkit }[browserName];
    // A persistent context does not inherit the project's options.
    const options = {
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 1280, height: 900 },
    };
    const profile = testInfo.outputPath('profile');

    let context = await type.launchPersistentContext(profile, options);
    let page = context.pages()[0] ?? (await context.newPage());
    await seedScenario(page);
    await waitSaved(page);
    await open(page, '/ergebnis');
    const row = () => page.getByRole('row', { name: /Modell A Kauf/ });
    await expect(row()).toBeVisible();
    const before = await row().textContent();

    await page.reload();
    await expect(row()).toHaveText(before ?? '');

    // The browser is closed and started again on the same profile.
    await context.close();
    context = await type.launchPersistentContext(profile, options);
    page = context.pages()[0] ?? (await context.newPage());
    await open(page, '/ergebnis');
    await expect(row()).toHaveText(before ?? '');
    await open(page, '/fahrprofil');
    await expect(page.getByLabel(/^Name/).nth(0)).toHaveValue('Golf Benziner');
    await open(page, '/parameter');
    await expect(
      page.locator('[id="f-parameters.electricityPrice.mid"]'),
    ).toHaveValue('0,30');
    await context.close();
  });
});

test.describe('S24: Viewports (acceptance criterion)', () => {
  for (const width of [1280, 1024, 820, 390]) {
    test(`Viewports: every area at ${width} px has no cut-off input field`, async ({
      page,
    }) => {
      await seedScenario(page);
      await waitSaved(page);
      await page.setViewportSize({ width, height: 900 });

      for (const path of [
        '/fahrprofil',
        '/parameter',
        '/kandidaten',
        '/ergebnis',
        '/szenarien',
      ]) {
        await open(page, path);
        expect(await cutOffFields(page), `${path} at ${width} px`).toEqual([]);
      }

      // The candidate form: on a phone it has four steps.
      await open(page, '/kandidaten');
      await page
        .getByRole('region', { name: 'Modell A' })
        .getByRole('button', { name: /Bearbeiten|Ergänzen/ })
        .click();
      if (width < 900) {
        for (let step = 1; step <= 4; step++) {
          await expect(page.getByText(`Schritt ${step} von 4`)).toBeVisible();
          expect(
            await cutOffFields(page),
            `candidate form, step ${step}, ${width} px`,
          ).toEqual([]);
          if (step < 4) {
            await page.getByRole('button', { name: 'Weiter' }).click();
          }
        }
      } else {
        expect(
          await cutOffFields(page),
          `candidate form at ${width} px`,
        ).toEqual([]);
      }

      // The price slider of the result area.
      await open(page, '/ergebnis');
      await page.getByText('Preis-Regler').first().click();
      expect(await cutOffFields(page), `price slider at ${width} px`).toEqual(
        [],
      );
    });
  }
});

test.describe('S24: Q10 (accessibility with data in the forms)', () => {
  // The other areas have their own analysis per step (S16 to S23). The forms
  // were analysed empty only; here they hold the seeded scenario.
  for (const width of [1280, 1024, 820, 390]) {
    for (const path of ['/fahrprofil', '/parameter']) {
      test(`Q10: no axe violations at ${path} with data at ${width} px`, async ({
        page,
      }) => {
        await seedScenario(page);
        await page.setViewportSize({ width, height: 900 });
        await open(page, path);
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `${path}: ${v.id} ${v.help}`),
        ).toEqual([]);
      });
    }
  }
});
