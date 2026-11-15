import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Each fixture is linted under a virtual file path, so `npm run lint` never
// sees it as a file. Imports resolve against the real module index files.
const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

// Same matrix as the block diagram in architecture chapter 5.
const ALLOWED: Record<string, string[]> = {
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
const pairs = MODULES.flatMap((target) =>
  MODULES.filter((from) => from !== target).map((from) => ({
    target,
    from,
    allowed: ALLOWED[target]?.includes(from) ?? false,
  })),
);

describe('layer boundaries (Q11, architecture chapter 5)', () => {
  it('Q11: an import from src/ui to src/core fails the lint', async () => {
    const ids = await ruleIds(
      "import '../core';\n",
      'src/ui/__lint_fixture__.ts',
    );
    expect(ids).toEqual(['import-x/no-restricted-paths']);
  });

  it('keeps an allowed import from src/core to src/domain green', async () => {
    const ids = await ruleIds(
      "import '../domain';\n",
      'src/core/__lint_fixture__.ts',
    );
    expect(ids).toEqual([]);
  });

  it.each(pairs)(
    '$target -> $from is allowed: $allowed',
    async ({ target, from, allowed }) => {
      const ids = await ruleIds(
        `import '../${from}';\n`,
        `src/${target}/__lint_fixture__.ts`,
      );
      expect(ids).toEqual(allowed ? [] : ['import-x/no-restricted-paths']);
    },
  );
});

describe('calculation core bans (8.4)', () => {
  const core = 'src/core/__lint_fixture__.ts';

  it.each([
    [
      'Math.pow',
      'export const x = Math.pow(2, 3);\n',
      'no-restricted-properties',
    ],
    ['Math.exp', 'export const x = Math.exp(1);\n', 'no-restricted-properties'],
    ['Math.log', 'export const x = Math.log(1);\n', 'no-restricted-properties'],
    [
      'Math.random',
      'export const x = Math.random();\n',
      'no-restricted-properties',
    ],
    ['** operator', 'export const x = 2 ** 3;\n', 'no-restricted-syntax'],
    [
      '**= operator',
      'let x = 2;\nx **= 3;\nexport { x };\n',
      'no-restricted-syntax',
    ],
    ['new Date()', 'export const x = new Date();\n', 'no-restricted-globals'],
    ['Date.now()', 'export const x = Date.now();\n', 'no-restricted-globals'],
    [
      'performance.now()',
      'export const x = performance.now();\n',
      'no-restricted-globals',
    ],
    [
      'document access',
      'export const x = document.body;\n',
      'no-restricted-globals',
    ],
    [
      'bare package import',
      "import { z } from 'zod';\nexport const x = z;\n",
      'no-restricted-imports',
    ],
  ])('rejects %s', async (_name, code, rule) => {
    expect(await ruleIds(code, core)).toEqual([rule]);
  });

  it('accepts plain arithmetic', async () => {
    expect(await ruleIds('export const x = 1 + 2 * 3;\n', core)).toEqual([]);
  });

  it('allows Math.pow and package imports in core test files', async () => {
    const code =
      "import { expect } from 'vitest';\nexpect(Math.pow(2, 3)).toBe(8);\n";
    expect(
      await ruleIds(code, 'src/core/math/__tests__/__lint_fixture__.test.ts'),
    ).toEqual([]);
  });

  it('rejects production code that imports from __tests__ (brute force stays out of the build)', async () => {
    const ids = await ruleIds(
      "import { bruteForce } from './__tests__/bruteForce';\nexport const x = bruteForce;\n",
      'src/core/optimizer/__lint_fixture__.ts',
    );
    expect(ids).toEqual(['no-restricted-imports']);
  });

  it('allows test files to import from __tests__', async () => {
    const code =
      "import { bruteForce } from './__tests__/bruteForce';\nvoid bruteForce;\n";
    expect(
      await ruleIds(code, 'src/core/optimizer/__lint_fixture__.test.ts'),
    ).toEqual([]);
  });

  it('does not apply the core bans outside src/core', async () => {
    const code = 'export const x = Math.pow(2, 3) + Date.now();\n';
    expect(await ruleIds(code, 'src/ui/__lint_fixture__.ts')).toEqual([]);
  });
});

describe('database access only in the repository (8.2)', () => {
  it.each([
    [
      'idb import in src/state',
      "import { openDB } from 'idb';\nexport const x = openDB;\n",
      'src/state/__lint_fixture__.ts',
      'no-restricted-imports',
    ],
    [
      'indexedDB global in src/state',
      "export const x = indexedDB.open('eauto');\n",
      'src/state/__lint_fixture__.ts',
      'no-restricted-globals',
    ],
    [
      'idb import elsewhere in src/storage',
      "import { openDB } from 'idb';\nexport const x = openDB;\n",
      'src/storage/__lint_fixture__.ts',
      'no-restricted-imports',
    ],
  ])('rejects %s', async (_name, code, filePath, rule) => {
    expect(await ruleIds(code, filePath)).toEqual([rule]);
  });

  it('allows src/storage/repository.ts to open the database', async () => {
    const code =
      "import { openDB } from 'idb';\nexport const x = [openDB, indexedDB];\n";
    expect(await ruleIds(code, 'src/storage/repository.ts')).toEqual([]);
  });
});
