# Wattwahl

Wattwahl is a decision aid for choosing an electric car. For each candidate (purchase or lease tier) it checks whether the car covers every commute in every month, finds the cheapest split of daily trips between the electric car and the existing petrol car, and compares the total fleet cost over the chosen period under three price cases.

It is a client-only progressive web app. There is no server, all data stays in the browser, and the only way data leaves the device is the export file.

Live: <https://wattwahl.evodicka.dev/>

## Getting started

Requires Node.js 26 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

| Script                 | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Vite dev server                                |
| `npm run build`        | Type-check and production build into `dist/`   |
| `npm run preview`      | Serve the production build locally             |
| `npm run lint`         | ESLint, including the module import boundaries |
| `npm run typecheck`    | `tsc` in strict mode                           |
| `npm test`             | Vitest (unit tests and lint-rule fixtures)     |
| `npm run test:e2e`     | Playwright in Chromium, Firefox and WebKit     |
| `npm run format:check` | Prettier check (`npm run format` fixes)        |

The project `.npmrc` pins the public npm registry and exact dependency versions. Do not commit a lockfile that references a private registry.

## CI and deployment

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`: install, lint, format check, typecheck, unit tests, build, then the Playwright end-to-end tests in all three browser engines. Only a green push to `main` deploys to GitHub Pages.

- GitHub Pages is set to the source "GitHub Actions" and serves the custom domain `wattwahl.evodicka.dev` (configured in the repository settings; a `CNAME` file is ignored for this source).
- Vite `base` is `/`. The browser storage is bound to this origin, so never change the domain without exporting the data first.
- Run `npx playwright install` once before `npm run test:e2e` locally.

## Documentation

The documents are written in German and are binding. If code and documents disagree, the documents win and are changed first.

- [Specification](docs/specification.md): functional rules, formulas and test cases
- [Architecture](docs/architecture.md): arc42 documentation, module structure, decisions
- [Implementation plan](docs/implementation_plan.md): steps, order and validation

## Project layout

One package with eight modules under `src/`. Imports between them are restricted by ESLint to the arrows in the block diagram of the architecture document, and each module is imported only through its `index.ts`. `src/core` is the deterministic calculation core and may only import `src/domain`.

## License

[MIT](LICENSE)
