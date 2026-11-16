# Wattwahl developer guide

This guide is for working on the code. What the app must do is in the
[specification](specification.md), why it is built this way is in the
[architecture documentation](architecture.md) (arc42, German). Both are binding:
if code and documents disagree, change the documents first. Code, comments,
commit messages and this guide are English; user-facing texts are German and
live only in `src/i18n/de.json`.

## Architecture in one page

One package, eight modules under `src/`. Imports run only along the arrows of
the block diagram (architecture chapter 5) and ESLint enforces them.

| Module        | Job                                                                      | Architecture |
| ------------- | ------------------------------------------------------------------------ | ------------ |
| `src/domain`  | Zod schemas (the only source of types), defaults, migrations, warnings   | 8.1, 8.2     |
| `src/core`    | Formulas, optimizer, Rechenweg (trace), `detPow`. No clock, no random, no `Math.pow` or `**` | 5.2, 8.4 |
| `src/worker`  | Comlink endpoint around the core; generations and cooperative abort      | 8.5          |
| `src/storage` | IndexedDB repository (the only code that opens the database), export and import | 8.2, 8.3 |
| `src/state`   | Redux Toolkit store, autosave, debounce, worker client, thunks. IDs and the current month come from here | 6, 8.5 |
| `src/i18n`    | `de.json`, formatting with `Intl`                                        | 8.7          |
| `src/pwa`     | Service worker registration, update notice, iOS install hint             | 8.12         |
| `src/ui`      | React areas, forms, charts (lazy), theme                                 | 8.8, 8.9     |

The user types, `src/state` waits 300 ms, sends the scenario to the worker, the
worker runs the core and answers with results and a hash, `src/state` keeps the
answer of the latest generation. The Rechenweg of one offer is computed only
when it is opened. Runtime views: architecture 6.

Rules worth knowing before the first change:

- A scenario has two schemas: the storage schema (may be incomplete) and the
  strict compute schema. An incomplete candidate is reported with its field
  paths and is not computed; the others still are.
- Percentages are stored as typed (15 means 15 %); only the core turns them
  into fractions. The core returns unrounded numbers, rounding happens in
  `src/i18n/format.ts`.
- The core must give bit-identical results in every engine (Q5). That is why
  there is a `detPow` and why `Math.pow`, `**`, `Date` and `Math.random` are
  banned in `src/core` by lint.

## Tests

| Layer | Tool | Where | Run |
| --- | --- | --- | --- |
| Unit and property | Vitest, fast-check | `src/**/*.test.ts`, `tests/**/*.test.ts` | `npm test` |
| Components | Vitest, Testing Library (jsdom) | `src/ui/**/*.test.tsx` | `npm test` |
| End to end | Playwright, Chromium + Firefox + WebKit | `e2e/` | `npm run test:e2e` |
| Benchmarks | Vitest bench, Playwright (not in CI) | `tests/bench`, `bench/` | `npm run bench`, `npm run bench:browser` |

Every test case (TC1 to TC22 of the specification), quality scenario (Q1 to
Q11) and formula carries its id in the test title, so coverage can be checked
with a search: `grep -rn "TC12" src tests e2e`. Keep that when adding tests.

Things that are easy to trip over:

- `npm run test:e2e` serves `dist` through `vite preview`: run `npm run build`
  first, and again after every change to the app.
- `e2e/acceptance.spec.ts` holds the measurements of the finished app (Q1, Q2,
  Q5, Q8, viewports). `Q1_STRICT=1` asserts the 2 s limit; use it on a desktop
  machine, not on CI. The Q1 file the tests import is built from
  `tests/fixtures/q1Scenario.ts` by `e2e/q1.ts`.
- Chromium's CPU throttling does not slow the worker, so there is no throttled
  end-to-end Q1 test (architecture 11.1).
- `tests/build/bundle.test.ts` builds the app in memory and fails when the start
  chunks plus the worker exceed 250 KB gzip. Check it after adding a dependency.
- Axe in Firefox sometimes crashes on some pages; those tests are marked
  `fixme` (architecture 11.2).
- The screenshot tests (`S16: screenshots` and the like) run in Chromium only,
  so the pictures come from one engine; Firefox and WebKit skip them.

## Build, release and deployment

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:
install, lint, format check, typecheck, unit tests, build, end-to-end tests in
three engines. Only a green push to `main` is published to GitHub Pages, at
`https://wattwahl.evodicka.dev/` (custom domain set in the repository
settings). The base path is `/` and must not change: it fixes the origin of the
browser storage, and a new origin means every user starts with no data.

The build id is the commit SHA (`BUILD_ID` in CI, `local` otherwise) in
`<meta name="build-id">`. The version is `version` in `package.json`.

To make a release:

1. Change `version` in `package.json` and in the two places of
   `package-lock.json` that repeat it, in a pull request.
2. Merge it. Wait until the pipeline has published, then open the live site and
   check the version at the bottom of "Szenarien und Daten" and that the build
   id is the commit of `main`.
3. Tag that commit: `git tag v1.0.0-rc.1 <commit> && git push origin v1.0.0-rc.1`.

Browsers that have the app installed get the update notice ("Aktualisieren")
once the new service worker is on the server (architecture 6.4, 8.12).

## Adding a schema version

A schema change is a data migration for every user. Do it in one pull request,
in this order. `docs/change-garantie.md` is the worked example (v1 to v2).

1. **Describe the change** in the specification and architecture first (data
   model, parameter list, test cases, ADR if it is a decision) and get it
   reviewed before code, as C1a did.
2. **Change the schema** in `src/domain/schema.ts` and the defaults in
   `src/domain/defaults.ts`. Raise `CURRENT_SCHEMA_VERSION`. The IndexedDB
   version follows it, so older open tabs are told to reload (architecture 8.2).
3. **Write the step** `vN → vN+1` in `src/domain/migrations.ts` as a pure
   function that does not change its input, and register it in `MIGRATIONS`
   under the version it starts from. It gets a context with the month of the
   migration (`migrationMonth`); the domain reads no clock. Data that cannot be
   converted must keep its values and be flagged for the user to check, never
   dropped. Update `createScenarioTemplate`.
4. **Add the example file** `src/domain/__fixtures__/scenario.vN+1.json`. A test
   requires exactly one file per version from 1 to current, and that every file
   runs through the whole chain and passes the storage schema. Keep the old
   files unchanged.
5. **Test the step**: old file to new shape, a case that cannot be converted, a
   frozen input (no mutation), and a failing step leaves the old record in
   place (`src/domain/migrations.test.ts`, `src/storage` tests).
6. **Fixtures and export**: bring `tests/fixtures/exampleScenario.ts` and
   `q1Scenario.ts` to the new version. Export files carry `schemaVersion`; an
   import of an older file migrates, a newer file is refused with `newerVersion`.
   Regenerate `docs/acceptance/q1-messszenario.json` (its test shows how).
7. **Check the results**: a migrated scenario should give the same results as
   before unless the change is meant to alter them. Run the benchmark when the
   core is touched (`npm run bench`), update chapter 10 and 11.1 of the
   architecture if numbers move.
8. Raise the app version (see above); a schema change is at least a minor
   version.

## Open known issues

Listed in architecture chapter 11: Firefox axe crashes (11.2), a second open tab
after an update runs old code (11.3), bundle reserve is small (11).
