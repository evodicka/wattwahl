import { readFileSync } from 'node:fs';
import { upgradeScenario, type Scenario } from '../../src/domain';

// The scenario of the export of the published app (docs/acceptance), migrated
// like an import does it. Test cases 21 to 26 of the specification use it.

const EXPORT = new URL(
  '../../docs/acceptance/eauto-export-2026-11-16-v2_3.json',
  import.meta.url,
);

export function loadExportScenario(): Scenario {
  const file = JSON.parse(readFileSync(EXPORT, 'utf8')) as {
    schemaVersion: number;
    scenarios: unknown[];
  };
  const result = upgradeScenario(
    { schemaVersion: file.schemaVersion, data: file.scenarios[0] },
    { migrationMonth: { month: 11, year: 2026 } },
  );
  if (result.status !== 'ok') throw new Error(`not ok: ${result.status}`);
  return result.scenario;
}

/** The export with other parameters. */
export function exportWith(
  scenario: Scenario,
  change: Partial<Scenario['parameters']>,
): Scenario {
  return { ...scenario, parameters: { ...scenario.parameters, ...change } };
}
