import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, normalize, resolve } from 'node:path';
import { open, seedScenario, waitSaved } from './helpers';

// S23: offline start (Q9, automatic part), update with two builds, no foreign
// origin and no policy violation (architecture 8.11, 8.12, 6.4).

/** The service worker is installed, active and controls the page. */
async function controlledByWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // The first load is not controlled: the worker takes over with the next one.
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);
}

test.describe('S23: offline (Q9)', () => {
  test('after the first load the app starts and computes without a network', async ({
    page,
    context,
  }) => {
    await seedScenario(page);
    await waitSaved(page);
    await open(page, '/ergebnis');
    await controlledByWorker(page);
    await expect(page.getByRole('table')).toBeVisible();
    const before = await page
      .getByRole('row', { name: /Modell A Kauf/ })
      .textContent();

    await context.setOffline(true);
    await page.reload();
    // The app, its data and the core worker come from the cache and the database.
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('row', { name: /Modell A Kauf/ })).toHaveText(
      before ?? '',
    );
    // Lazy chunks are in the cache too: the chart and a detail view.
    await expect(
      page.getByRole('img', { name: /Gestapelte Balken/ }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: /^(Details ansehen: )?Modell A/ })
      .first()
      .click();
    await expect(page.getByRole('region', { name: /^Heatmap/ })).toBeVisible();
    // And a new input still computes.
    await page.getByRole('link', { name: 'Parameter' }).first().click();
    const price = page.locator('[id="f-parameters.electricityPrice.mid"]');
    await price.fill('0,33');
    await price.blur();
    await page.getByRole('link', { name: 'Ergebnis' }).first().click();
    // The new price reaches the result: computed offline, by the cached worker.
    await expect(
      page.getByRole('row', { name: /Modell A Kauf/ }),
    ).not.toHaveText(before ?? '');
    await expect(page.getByTestId('status-line')).not.toContainText(
      'wird aktualisiert',
    );
    await context.setOffline(false);
  });

  test('the manifest names the app and its icons are in the build', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    const manifest = await (await request.get(href ?? '')).json();
    expect(manifest).toMatchObject({
      name: 'Wattwahl',
      short_name: 'Wattwahl',
      display: 'standalone',
      start_url: './#/',
    });
    for (const icon of manifest.icons as { src: string }[]) {
      expect((await request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
    }
  });
});

test.describe('S23: security (8.11)', () => {
  test('no request leaves the origin and the policy is never violated', async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? '').origin;
    const foreign: string[] = [];
    const messages: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (
        !url.startsWith(origin) &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:')
      ) {
        foreign.push(url);
      }
    });
    page.on('console', (message) => {
      if (/content security policy|csp/i.test(message.text()))
        messages.push(message.text());
    });
    await page.addInitScript(() => {
      (window as unknown as { __violations: string[] }).__violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { __violations: string[] }).__violations.push(
          `${event.violatedDirective} ${event.blockedURI}`,
        );
      });
    });

    await seedScenario(page);
    await waitSaved(page);
    for (const path of [
      '/fahrprofil',
      '/kandidaten',
      '/parameter',
      '/ergebnis',
      '/szenarien',
    ]) {
      await open(page, path);
    }
    await open(page, '/ergebnis');
    await expect(
      page.getByRole('img', { name: /Gestapelte Balken/ }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: /^(Details ansehen: )?Modell A/ })
      .first()
      .click();
    await expect(page.getByRole('region', { name: /^Heatmap/ })).toBeVisible();
    await page.getByText('Rechenweg anzeigen').click();
    await expect(page.getByText('Zahlen dieses Angebots')).toBeVisible();

    expect(foreign).toEqual([]);
    expect(messages).toEqual([]);
    expect(
      await page.evaluate(
        () => (window as unknown as { __violations: string[] }).__violations,
      ),
    ).toEqual([]);
  });

  test('the page carries the policy of 8.11 as its first head element', async ({
    page,
  }) => {
    await page.goto('/');
    const policy = await page
      .locator('head > meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(policy).toBe(
      "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'",
    );
    expect(
      await page.evaluate(() =>
        document.head.firstElementChild?.getAttribute('http-equiv'),
      ),
    ).toBe('Content-Security-Policy');
  });

  test('the policy holds: an inline script and a foreign request are blocked', async ({
    page,
  }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const violated: string[] = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        violated.push(event.violatedDirective),
      );
      (window as unknown as { __ran?: boolean }).__ran = false;
      const script = document.createElement('script');
      script.textContent = 'window.__ran = true';
      document.head.append(script);
      let fetched = true;
      await fetch('https://example.com/x').catch(() => {
        fetched = false;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        ran: (window as unknown as { __ran: boolean }).__ran,
        fetched,
        violated,
      };
    });
    expect(result.ran).toBe(false);
    expect(result.fetched).toBe(false);
    expect(result.violated.some((d) => d.startsWith('script-src'))).toBe(true);
    expect(result.violated.some((d) => d.startsWith('connect-src'))).toBe(true);
  });
});

// --- Update with two builds (6.4) ---------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

const isFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** Serves one build directory; `switchTo` changes the build under the same address. */
function buildServer(initial: string) {
  let root = initial;
  const server: Server = createServer((request, response) => {
    const path = normalize(
      new URL(request.url ?? '/', 'http://x').pathname,
    ).replace(/^(\.\.[/\\])+/, '');
    const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(resolve(root)) || !isFile(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    response.end(readFileSync(file));
  });
  return {
    start: () =>
      new Promise<string>((resolve) =>
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          resolve(
            `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`,
          );
        }),
      ),
    switchTo: (next: string) => {
      root = next;
    },
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.describe('S23: update (6.4)', () => {
  // One directory per project: the projects run in parallel workers.
  const buildB = () => `dist-b-${test.info().project.name}`;
  test.beforeAll(() => {
    test.setTimeout(180_000);
    // Build B differs from the build in dist/ in its build id only.
    execSync(`npx vite build --outDir ${buildB()} --emptyOutDir`, {
      env: { ...process.env, BUILD_ID: 'b' },
      stdio: 'inherit',
    });
  });

  test('the notice appears, and after "Aktualisieren" the new version runs with no input missing', async ({
    page,
    browserName,
  }) => {
    // The save before the update must come from the update itself: without the
    // lifecycle listeners and the 300 ms autosave timer, nothing else writes the edit.
    await page.addInitScript(() => {
      const timer = window.setTimeout;
      window.setTimeout = ((
        handler: TimerHandler,
        delay?: number,
        ...args: unknown[]
      ) =>
        delay === 300
          ? 0
          : timer(handler, delay, ...args)) as typeof window.setTimeout;
      const add = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (
        this: EventTarget,
        type: string,
        ...rest: unknown[]
      ) {
        if (type === 'pagehide' || type === 'visibilitychange') return;
        return (add as (...args: unknown[]) => void).call(this, type, ...rest);
      } as typeof EventTarget.prototype.addEventListener;
    });
    const server = buildServer('dist');
    const url = await server.start();
    try {
      await page.goto(`${url}#/fahrprofil`);
      await expect(page.locator('body')).toContainText('Standard');
      await controlledByWorker(page);
      const build = () =>
        page.locator('meta[name="build-id"]').getAttribute('content');
      // Build A is whatever `npm run build` made: "local", or the commit in CI.
      const buildA = await build();
      expect(buildA).not.toBe('b');
      await expect(page.getByText('Neue Version verfügbar')).toHaveCount(0);

      // Build B goes online; the running app looks for it.
      server.switchTo(buildB());
      // A browser may refuse a check once while it is busy: ask again.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            try {
              const registration =
                await navigator.serviceWorker.getRegistration();
              await registration?.update();
              return 'checked';
            } catch {
              return 'failed';
            }
          }),
        )
        .toBe('checked');
      // It appears when the new version is downloaded, which takes longer under load.
      await expect(page.getByText('Neue Version verfügbar')).toBeVisible({
        timeout: 20_000,
      });
      if (browserName === 'chromium') {
        await page.screenshot({
          path: 'screenshots/s23/update-notice-1280-light.png',
        });
      }
      // Still the old version until the user agrees.
      expect(await build()).toBe(buildA);

      // An input made right before the click is saved first (the autosave waits 300 ms).
      await page.getByLabel(/^Name/).first().fill('Mein Golf');
      await page.getByRole('button', { name: 'Aktualisieren' }).click();
      await expect(page.locator('meta[name="build-id"]')).toHaveAttribute(
        'content',
        'b',
        {
          timeout: 15_000,
        },
      );
      await expect(page.locator('body')).toContainText('Standard');
      await expect(page.getByLabel(/^Name/).first()).toHaveValue('Mein Golf');
      await expect(page.getByText('Neue Version verfügbar')).toHaveCount(0);
    } finally {
      await server.stop();
    }
  });
});

test.describe('S23: first start (Z18, Z09)', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 390]) {
      test(`the welcome notice is accessible at ${width} px, ${colorScheme}`, async ({
        page,
        browserName,
      }) => {
        // Known defect, cause unknown (architecture 11.2): Firefox crashes in
        // the accessibility analysis, here on a page without any lazy chunk.
        test.fixme(
          browserName === 'firefox',
          'Firefox crashes in the accessibility analysis (architecture 11.2).',
        );
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/#/fahrprofil');
        await expect(page.getByText('Willkommen bei Wattwahl')).toBeVisible();
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `first start: ${v.id} ${v.help}`),
        ).toEqual([]);
        if (browserName === 'chromium') {
          await page.screenshot({
            path: `screenshots/s23/first-start-${width}-${colorScheme}.png`,
          });
        }
      });
    }
  }

  test('the welcome shows once: closed it stays away, and the next start does not repeat it', async ({
    page,
  }) => {
    await page.goto('/#/fahrprofil');
    await expect(page.getByText('Willkommen bei Wattwahl')).toBeVisible();
    await page.getByRole('button', { name: 'Verstanden' }).click();
    await expect(page.getByText('Willkommen bei Wattwahl')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<boolean>((resolve) => {
              const request = indexedDB.open('eauto');
              request.onsuccess = () => {
                const db = request.result;
                const get = db
                  .transaction('settings')
                  .objectStore('settings')
                  .getAll();
                get.onsuccess = () => {
                  db.close();
                  resolve(
                    (get.result as { firstRunCompleted?: boolean }[]).some(
                      (settings) => settings.firstRunCompleted === true,
                    ),
                  );
                };
              };
            }),
        ),
      )
      .toBe(true);
    await page.reload();
    await expect(page.locator('body')).toContainText('Standard');
    await expect(page.getByText('Willkommen bei Wattwahl')).toHaveCount(0);
  });
});
