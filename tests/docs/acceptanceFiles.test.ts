import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildExport, parseImport } from '../../src/storage/exportImport';
import { q1Scenario } from '../fixtures/q1Scenario';

// S25: the file for the Q1 test on a phone (docs/acceptance-checklist.md) is
// the Q1 measurement scenario as an export file. It must not drift from the
// fixture the automatic Q1 test uses (e2e/q1.ts has the same fixed time).

const EXPORTED_AT = new Date('2026-11-16T12:00:00.000Z');
const file = new URL('../../docs/acceptance/q1-messszenario.json', import.meta.url);

describe('S25: acceptance files', () => {
  it('the Q1 file is the export of the Q1 measurement scenario', () => {
    expect(readFileSync(file, 'utf8')).toBe(
      buildExport([q1Scenario()], EXPORTED_AT).content,
    );
  });

  it('the Q1 file can be imported by the app', async () => {
    const parsed = await parseImport(new Blob([readFileSync(file)]), {
      now: () => EXPORTED_AT,
    });
    expect(parsed.status).toBe('ok');
    if (parsed.status === 'ok') {
      expect(parsed.scenarios).toHaveLength(1);
      expect(parsed.scenarios[0]?.candidates).toHaveLength(10);
    }
  });
});
