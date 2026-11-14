import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Table 5.1: the app is one package with eight modules under src/.
const MODULES = [
  'core',
  'domain',
  'i18n',
  'pwa',
  'state',
  'storage',
  'ui',
  'worker',
];
const src = join(process.cwd(), 'src');

describe('project structure (architecture table 5.1)', () => {
  it('has exactly the eight modules under src/', () => {
    const dirs = readdirSync(src)
      .filter((name) => statSync(join(src, name)).isDirectory())
      .sort();
    expect(dirs).toEqual(MODULES);
  });

  it.each(MODULES)('src/%s has a public index.ts', (name) => {
    expect(existsSync(join(src, name, 'index.ts'))).toBe(true);
  });
});
