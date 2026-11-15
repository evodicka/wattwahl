import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Allowed imports between modules (architecture chapter 5, block diagram).
// An arrow means "may import". Edges are not transitive.
// src/domain is imported by every module and imports no other module.
const ALLOWED = {
  ui: ['state', 'i18n', 'pwa', 'domain'],
  state: ['storage', 'worker', 'domain'],
  worker: ['core', 'domain'],
  storage: ['domain'],
  core: ['domain'],
  i18n: ['domain'],
  pwa: ['domain'],
  domain: [],
};
const MODULES = Object.keys(ALLOWED);

// One zone per ordered pair of modules. Forbidden edges are banned outright.
// Allowed edges may only go through the public index.ts of the target module.
const boundaryZones = MODULES.flatMap((target) =>
  MODULES.filter((from) => from !== target).map((from) => ({
    target: `./src/${target}`,
    from: `./src/${from}`,
    ...(ALLOWED[target].includes(from) ? { except: ['./index.ts'] } : {}),
    message: ALLOWED[target].includes(from)
      ? `Import src/${from} only through its index.ts.`
      : `src/${target} must not import src/${from} (architecture chapter 5).`,
  })),
);

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-b*',
      'coverage',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver()],
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: boundaryZones }],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    // Only the repository opens the database (architecture 8.2). This block
    // must stay before the core block: a later block replaces the options of
    // the same rule, and the core block bans indexedDB and all packages itself.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/storage/repository.ts', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'indexedDB',
          message: 'Only src/storage/repository.ts opens the database (8.2).',
        },
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].map((object) => ({
          object,
          property: 'indexedDB',
          message: 'Only src/storage/repository.ts opens the database (8.2).',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^idb(/|$)',
              message:
                'Only src/storage/repository.ts opens the database (8.2).',
            },
          ],
        },
      ],
    },
  },
  {
    // Determinism rules for the calculation core (architecture 8.4, ADR-10).
    // Test files may use Math.pow as a reference and import test libraries.
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/__tests__/**', 'src/core/**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['pow', 'exp', 'log', 'random'].map((property) => ({
          object: 'Math',
          property,
          message: `Math.${property} is forbidden in src/core (8.4). Use math/detPow.ts.`,
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**']",
          message:
            'The ** operator is forbidden in src/core (8.4). Use detPow.',
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message:
            'The **= operator is forbidden in src/core (8.4). Use detPow.',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'Date',
          'performance',
          'window',
          'document',
          'self',
          'globalThis',
          'navigator',
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'fetch',
          'setTimeout',
          'setInterval',
        ].map((name) => ({
          name,
          message: `${name} is forbidden in src/core (8.4): the core is pure and DOM-free.`,
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^[^./]',
              message:
                'src/core must not import packages (8.4). Only src/domain is allowed.',
            },
            {
              // Test-only code such as the brute-force reference must not reach
              // the production build. Test files and __tests__ itself are exempt.
              regex: '(^|/)__tests__(/|$)',
              message:
                'Production code in src/core must not import from __tests__ (architecture 5.2).',
            },
          ],
        },
      ],
    },
  },
);
