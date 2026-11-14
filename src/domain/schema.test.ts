import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_IDS,
  exampleCandidate,
  exampleScenario,
} from '../../tests/fixtures/exampleScenario';
import {
  CandidateComputeSchema,
  CandidateSchema,
  CURRENT_SCHEMA_VERSION,
  MAX_COMPARISON_MONTHS,
  ScenarioComputeSchema,
  ScenarioSchema,
} from './schema';
import {
  PARAMETER_DEFAULTS,
  createCandidateTemplate,
  createLeaseTierTemplate,
  createScenarioTemplate,
  LEASE_TIER_PRESETS,
  type ParameterDefault,
} from './defaults';
import {
  leaseOfferId,
  listOffers,
  parseOfferId,
  purchaseOfferId,
} from './offerId';
import { DEFAULT_DEVICE_SETTINGS, DeviceSettingsSchema } from './settings';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

const ID_A = '00000000-0000-4000-8000-0000000000aa';
const ID_B = '00000000-0000-4000-8000-0000000000bb';

/** Compute schema applies to the scenario without candidates. */
const computeIssuePaths = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) => (result.error?.issues ?? []).map((issue) => issue.path.join('.'));

describe('S03: parameter list', () => {
  const spec = readFileSync(
    join(process.cwd(), 'docs/specification.md'),
    'utf8',
  );
  const section = must(
    must(spec.split('## Parameterliste mit Standardwerten')[1]).split(
      '\n## ',
    )[0],
  );
  const specRows = section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter(
      (cells) => cells[0] !== 'Parameter' && !cells[0]?.startsWith('---'),
    );

  const UNIT_CODES: Record<string, ParameterDefault['unit']> = {
    Monate: 'months',
    '%': 'percent',
    km: 'km',
    Auswahl: 'choice',
    '°C': 'celsius',
    K: 'kelvin',
    '€/km': 'eurPerKm',
    '€/l': 'eurPerL',
    '€/kWh': 'eurPerKwh',
    '% pro Jahr': 'percentPerYear',
    Wochen: 'weeks',
    'Tage pro Jahr': 'daysPerYear',
    Schalter: 'switch',
    'km pro Jahr': 'kmPerYear',
    Tage: 'days',
  };
  const WORDS: Record<string, string | boolean> = {
    'Ende der Vergleichsdauer': 'end',
    'frei optimiert': 'optimized',
    aus: false,
    an: true,
  };

  function decode(text: string): ParameterDefault['value'] {
    if (text === 'Pflichteingabe') return null;
    const word = WORDS[text];
    if (word !== undefined) return word;
    if (text.startsWith('Jan ')) {
      return [...text.matchAll(/\p{L}+ (-?\d+)/gu)].map((m) => Number(m[1]));
    }
    return Number(text.replace('−', '-').replaceAll('.', ''));
  }

  it('reads every row of the spec table', () => {
    expect(specRows).toHaveLength(28);
  });

  it.each(specRows)('%s', (label, standard, unit, hint) => {
    const entries = PARAMETER_DEFAULTS.filter(
      (e) =>
        // Rows may share a prefix; the label is the exact spec cell.
        e.specRow === label,
    );
    expect(entries.length, `no defaults entry for "${label}"`).toBeGreaterThan(
      0,
    );
    const flag =
      standard === 'Pflichteingabe'
        ? 'required'
        : hint?.includes('Platzhalter')
          ? 'placeholder'
          : 'fixed';
    for (const entry of entries) {
      expect(entry.value).toEqual(decode(String(standard)));
      expect(entry.unit).toBe(UNIT_CODES[String(unit)]);
      expect(entry.flag).toBe(flag);
    }
  });

  it('has no entry without a spec row', () => {
    const labels = new Set(specRows.map((cells) => cells[0]));
    for (const entry of PARAMETER_DEFAULTS) {
      expect(labels.has(entry.specRow)).toBe(true);
    }
  });

  it('applies every default at its path in the template', () => {
    const template = createScenarioTemplate({ id: ID_A, name: 'Template' });
    for (const entry of PARAMETER_DEFAULTS) {
      if (entry.path.startsWith('settings.')) continue;
      const actual = entry.path
        .split('.')
        .reduce<unknown>((node, key) => (node as never)[key], template);
      expect(actual, entry.path).toEqual(entry.value);
    }
  });

  it('only names paths that exist in the scenario template', () => {
    const template = createScenarioTemplate({ id: ID_A, name: 'Template' });
    for (const entry of PARAMETER_DEFAULTS) {
      if (entry.path.startsWith('settings.')) continue;
      const exists = entry.path.split('.').reduce<unknown>((node, key) => {
        expect(node, entry.path).toBeTypeOf('object');
        expect(key in (node as object), entry.path).toBe(true);
        return (node as Record<string, unknown>)[key];
      }, template);
      expect(exists, entry.path).not.toBeUndefined();
    }
  });

  it('keeps the export reminder in the device settings', () => {
    expect(DEFAULT_DEVICE_SETTINGS.exportReminderDays).toBe(
      PARAMETER_DEFAULTS.find((e) => e.path === 'settings.exportReminderDays')
        ?.value,
    );
  });
});

describe('S03: empty template', () => {
  const template = createScenarioTemplate({ id: ID_A, name: 'Template' });

  it('passes the storage schema', () => {
    expect(ScenarioSchema.safeParse(template).success).toBe(true);
  });

  it('fails the compute schema', () => {
    const result = ScenarioComputeSchema.safeParse(template);
    expect(result.success).toBe(false);
    expect(computeIssuePaths(result)).toContain('iceVehicle.maintenancePerKm');
  });

  it('gives a new candidate template that stores but cannot compute', () => {
    const candidate = createCandidateTemplate(ID_B);
    expect(CandidateSchema.safeParse(candidate).success).toBe(true);
    expect(CandidateComputeSchema.safeParse(candidate).success).toBe(false);
  });

  it('offers the four spec presets and builds a tier template from one', () => {
    expect(LEASE_TIER_PRESETS).toEqual([10000, 15000, 20000, 25000]);
    expect(createLeaseTierTemplate(ID_A, 10000).tierKmPerYear).toBe(10000);
  });

  it('takes ids as arguments and does not generate them', () => {
    expect(template.id).toBe(ID_A);
    expect(createCandidateTemplate(ID_B).id).toBe(ID_B);
  });
});

describe('S03: example data of the spec test cases', () => {
  it('passes the storage and the compute schema', () => {
    const scenario = exampleScenario();
    expect(ScenarioSchema.safeParse(scenario).success).toBe(true);
    const { candidates, ...profile } = scenario;
    const result = ScenarioComputeSchema.safeParse(profile);
    expect(computeIssuePaths(result)).toEqual([]);
    expect(CandidateComputeSchema.safeParse(candidates[0]).success).toBe(true);
    expect(CandidateSchema.safeParse(exampleCandidate()).success).toBe(true);
  });

  it('survives a JSON round trip unchanged', () => {
    const scenario = exampleScenario();
    expect(ScenarioSchema.parse(JSON.parse(JSON.stringify(scenario)))).toEqual(
      scenario,
    );
  });
});

describe('S03: edge cases of the spec are rejected', () => {
  const profile = () => {
    const { candidates: _candidates, ...rest } = exampleScenario();
    void _candidates;
    return rest;
  };

  it('minimum price above mid price', () => {
    const scenario = profile();
    scenario.iceVehicle.petrolPrice = { min: 2, mid: 1.9, max: 2.1 };
    const result = ScenarioComputeSchema.safeParse(scenario);
    expect(computeIssuePaths(result)).toEqual(['iceVehicle.petrolPrice']);
  });

  it('mid price above maximum electricity price', () => {
    const scenario = profile();
    scenario.parameters.electricityPrice = { min: 0.2, mid: 0.4, max: 0.3 };
    expect(
      computeIssuePaths(ScenarioComputeSchema.safeParse(scenario)),
    ).toEqual(['parameters.electricityPrice']);
  });

  it('a comparison period above 1,200 months', () => {
    const scenario = profile();
    scenario.parameters.comparisonMonths = MAX_COMPARISON_MONTHS;
    expect(ScenarioComputeSchema.safeParse(scenario).success).toBe(true);
    scenario.parameters.comparisonMonths = MAX_COMPARISON_MONTHS + 1;
    const result = ScenarioComputeSchema.safeParse(scenario);
    expect(computeIssuePaths(result)).toEqual(['parameters.comparisonMonths']);
  });

  it('a traffic light threshold above 100 %', () => {
    const scenario = profile();
    scenario.parameters.trafficLightGreenFromPct = 101;
    expect(
      computeIssuePaths(ScenarioComputeSchema.safeParse(scenario)),
    ).toEqual(['parameters.trafficLightGreenFromPct']);
  });

  it('an ICE consumption of 0 l/100 km on any road type', () => {
    const scenario = profile();
    scenario.iceVehicle.consumptionLPer100Km.rural = 0;
    expect(
      computeIssuePaths(ScenarioComputeSchema.safeParse(scenario)),
    ).toEqual(['iceVehicle.consumptionLPer100Km.rural']);
  });

  it('a commute sum of 0', () => {
    const scenario = profile();
    scenario.workplaces.a.commute = { city: 0, rural: 0, highway: 0 };
    expect(
      computeIssuePaths(ScenarioComputeSchema.safeParse(scenario)),
    ).toEqual(['workplaces.a.commute']);
  });

  it('more free days than working days', () => {
    const scenario = profile();
    scenario.workplaces.b.freeDaysPerYear = 105;
    expect(
      computeIssuePaths(ScenarioComputeSchema.safeParse(scenario)),
    ).toEqual(['workplaces.b.freeDaysPerYear']);
  });

  it('a workplace without weekdays', () => {
    const scenario = profile();
    scenario.workplaces.b.weekdays = [];
    expect(ScenarioComputeSchema.safeParse(scenario).success).toBe(false);
    expect(
      ScenarioSchema.safeParse({ ...scenario, candidates: [] }).success,
    ).toBe(true);
  });

  it('cold reference temperature not below the mild one', () => {
    const scenario = profile();
    scenario.parameters.tempColdC = 23;
    expect(
      computeIssuePaths(ScenarioComputeSchema.safeParse(scenario)),
    ).toEqual(['parameters.tempColdC']);
  });

  it('more than four lease tiers', () => {
    const candidate = exampleCandidate();
    candidate.leaseTiers = [10000, 15000, 20000, 25000, 30000].map(
      (km, index) =>
        createLeaseTierTemplate(
          `00000000-0000-4000-8000-00000000010${index}`,
          km,
        ),
    );
    expect(CandidateSchema.safeParse(candidate).success).toBe(false);
  });

  it('two lease tiers of the same step, with the path of the second', () => {
    const candidate = exampleCandidate();
    candidate.leaseTiers = [
      createLeaseTierTemplate(ID_A, 15000),
      createLeaseTierTemplate(ID_B, 15000),
    ];
    const result = CandidateSchema.safeParse(candidate);
    expect(result.success).toBe(false);
    expect(computeIssuePaths(result)).toEqual(['leaseTiers.1.tierKmPerYear']);
  });

  it('a new car with mileage', () => {
    const candidate = exampleCandidate();
    candidate.mileageKm = 5000;
    expect(
      computeIssuePaths(CandidateComputeSchema.safeParse(candidate)),
    ).toEqual(['mileageKm']);
  });

  it('values outside the range', () => {
    const candidate = exampleCandidate();
    candidate.condition = 'used';
    candidate.sohKnownPct = 40;
    candidate.purchasePrice = 0;
    expect(computeIssuePaths(CandidateSchema.safeParse(candidate))).toEqual(
      expect.arrayContaining(['sohKnownPct', 'purchasePrice']),
    );
  });

  it('keeps a saved half-edited state loadable', () => {
    const scenario = exampleScenario();
    scenario.iceVehicle.petrolPrice = { min: 3, mid: 1, max: 2 };
    scenario.workplaces.a.commute.city = null;
    expect(ScenarioSchema.safeParse(scenario).success).toBe(true);
  });
});

describe('S03: offer ids', () => {
  const candidate = exampleCandidate();

  it('derives the purchase and lease ids from the architecture format', () => {
    expect(purchaseOfferId(candidate.id)).toBe(`${candidate.id}:purchase`);
    expect(leaseOfferId(candidate.id, EXAMPLE_IDS.leaseTier)).toBe(
      `${candidate.id}:lease:${EXAMPLE_IDS.leaseTier}`,
    );
  });

  it('lists the purchase offer first and one offer per lease tier', () => {
    expect(listOffers(candidate).map((o) => o.offerId)).toEqual([
      purchaseOfferId(candidate.id),
      leaseOfferId(candidate.id, EXAMPLE_IDS.leaseTier),
    ]);
  });

  it('keeps the lease offer id when the km tier is edited', () => {
    const edited = {
      ...candidate,
      leaseTiers: candidate.leaseTiers.map((t) => ({
        ...t,
        tierKmPerYear: 20000,
      })),
    };
    expect(listOffers(edited)).toEqual(listOffers(candidate));
  });

  it('round-trips through parseOfferId and rejects garbage', () => {
    for (const offer of listOffers(candidate)) {
      expect(parseOfferId(offer.offerId)).toEqual(offer);
    }
    for (const bad of [
      '',
      'x',
      'x:lease',
      'x:other',
      'x:purchase:y',
      ':purchase',
    ]) {
      expect(parseOfferId(bad), bad).toBeNull();
    }
  });
});

describe('S03: device settings', () => {
  it('are separate from the scenario and valid by default', () => {
    expect(
      DeviceSettingsSchema.safeParse(DEFAULT_DEVICE_SETTINGS).success,
    ).toBe(true);
    expect(Object.keys(exampleScenario())).not.toContain('exportReminderDays');
  });

  it('rejects a bad export date and color', () => {
    expect(
      DeviceSettingsSchema.safeParse({
        ...DEFAULT_DEVICE_SETTINGS,
        lastExportAt: 'yesterday',
      }).success,
    ).toBe(false);
    expect(
      DeviceSettingsSchema.safeParse({
        ...DEFAULT_DEVICE_SETTINGS,
        trafficLightColors: { green: 'red', yellow: '#ffff00', red: '#ff0000' },
      }).success,
    ).toBe(false);
  });
});

describe('S03: no parallel type definitions (architecture 8.1)', () => {
  const dir = join(process.cwd(), 'src/domain');
  const files = readdirSync(dir).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  );

  it.each(files)('%s declares types only through z.infer', (file) => {
    const source = readFileSync(join(dir, file), 'utf8');
    const interfaces = [
      ...source.matchAll(/^\s*(?:export\s+)?interface\s+\w+/gm),
    ];
    const objectTypes = [
      ...source.matchAll(/^\s*(?:export\s+)?type\s+\w+(?:<[^>]*>)?\s*=\s*\{/gm),
    ];
    expect(interfaces).toEqual([]);
    expect(objectTypes).toEqual([]);
  });

  it('is the schema version the migrations start from', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});
