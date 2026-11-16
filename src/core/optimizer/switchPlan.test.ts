import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { expectSpec } from '../../../tests/helpers/specTolerance';
import {
  CandidateComputeSchema,
  ScenarioComputeSchema,
  upgradeScenario,
  type Scenario,
} from '../../domain';
import { resolvePrices } from '../calc/prices';
import { monthsUntilSoh } from '../calc/soh';
import { buildProblem, pairIndex, type Problem } from './problem';
import {
  monthsUntilSohAlong,
  odometerAt,
  optionWindowCost,
  phaseFigures,
  simulateSwitch,
} from './switchPlan';
import type { Group, Option } from './types';

// Change C3b (docs/change-soh-plan.md): the simulation of the plan with switch
// points, test cases 23, 24 and 26 of the specification.

const EXPORT = new URL(
  '../../../docs/acceptance/eauto-export-2026-11-16-v2_3.json',
  import.meta.url,
);

function loadExport(): Scenario {
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

/** The problem of the Corsa 2023 of the export with a Kilometerreserve, and the plan P at the start. */
function corsa(scenario: Scenario, minReserveKm: number) {
  const sc: Scenario = {
    ...scenario,
    parameters: { ...scenario.parameters, minReserveKm },
  };
  const compute = ScenarioComputeSchema.parse(sc);
  const candidate = CandidateComputeSchema.parse(
    sc.candidates.find((c) => c.name === 'Opel Corsa 2023'),
  );
  const problem = buildProblem(
    compute,
    candidate,
    resolvePrices(compute.iceVehicle, compute.parameters, { priceCase: 'mid' }),
  );
  const selection = problem.startSolver().solve({
    offerCost: () => 0,
    budgetKmPerYear: null,
    strict: false,
    reserveAtSoh: problem.reserveAtSoh,
  });
  if (selection.status !== 'ok') throw new Error('unsuitable');
  return { problem, selection, months: compute.parameters.comparisonMonths };
}

describe('C3b: simulation on the export (test cases 23 and 24)', () => {
  let scenario: Scenario;
  beforeAll(() => {
    scenario = loadExport();
  });

  it('TC23: the plan at the start drives 19.055 km per year and its first event is at 30,47 months', () => {
    const { problem, selection } = corsa(scenario, 10);
    expectSpec(selection.evKmPerYear, '19.055');
    const sim = simulateSwitch(problem, selection.optionIndex);
    expect(sim.infeasible).toBeNull();
    const first = sim.events[0];
    if (!first) throw new Error('no event');
    expectSpec(first.month, '30,47');
    expectSpec(first.threshold, '0,914');
    // Only way A in January: every entry drives A and rests afterwards.
    expect(first.entries.length).toBeGreaterThan(0);
    for (const entry of first.entries) {
      const info = problem.info[entry.group];
      expect(info?.kind === 'day' && info.month).toBe(0);
      const options = (problem.groups[entry.group] as Group).options;
      expect(options[entry.from]?.choice).toBe('evA');
      expect(options[entry.to]?.choice).toBe('rest');
    }
  });

  it('TC23: the other cells tip at 37,86 months at the unchanged rate and later after the first event', () => {
    const { problem, selection } = corsa(scenario, 10);
    const sim = simulateSwitch(problem, selection.optionIndex);
    for (const month of [1, 11]) {
      const threshold = problem.thresholds[pairIndex('a', month)] as number;
      expectSpec(
        monthsUntilSoh(
          problem.curve,
          problem.mileageKm,
          selection.evKmPerYear,
          threshold,
        ),
        '37,86',
      );
    }
    const second = sim.events[1];
    expect(second?.month).toBeGreaterThan(37.86);
    // The rate fell with the first event, so the second one comes later.
    expect(second?.rateBefore).toBe(sim.events[0]?.rateAfter);
    expect(sim.events[0]?.rateAfter).toBeLessThan(
      sim.events[0]?.rateBefore ?? 0,
    );
  });

  it('TC23: costs of the entry Wednesday, January, only A: 67,47 + 264,84 = 332,30 against 212,58 and 387,97', () => {
    const { problem, selection, months } = corsa(scenario, 10);
    const sim = simulateSwitch(problem, selection.optionIndex);
    const first = sim.events[0];
    const group = problem.info.findIndex(
      (info) =>
        info.kind === 'day' &&
        info.weekday === 'wed' &&
        info.month === 0 &&
        info.state === 'onlyA',
    );
    const entry = first?.entries.find((e) => e.group === group);
    if (!first || !entry) throw new Error('entry missing');
    const options = (problem.groups[group] as Group).options;
    const ev = options[entry.from] as Option;
    const rest = options[entry.to] as Option;
    const phase1 = optionWindowCost(problem, ev, 0, first.month);
    const phase2 = optionWindowCost(problem, rest, first.month, months);
    expectSpec(phase1, '67,47');
    expectSpec(phase2, '264,84');
    expectSpec(phase1 + phase2, '332,30');
    expectSpec(optionWindowCost(problem, ev, 0, months), '212,58');
    expectSpec(optionWindowCost(problem, rest, 0, months), '387,97');
  });

  it('TC24: with R = 0 all 24 thresholds lie below 0,85, so there is no event', () => {
    const { problem, selection } = corsa(scenario, 0);
    expect(Math.max(...problem.thresholds)).toBeLessThan(0.85);
    expectSpec(Math.max(...problem.thresholds), '0,829');
    const sim = simulateSwitch(problem, selection.optionIndex);
    expect(sim.events).toEqual([]);
    expect(sim.phases).toHaveLength(1);
    expect(sim.phases[0]?.toMonth).toBe(96);
  });

  it('the allowed set is constant exactly when no threshold can be crossed (the second plan is then skipped)', () => {
    // R = 0: all thresholds lie below the lowest SoH, nothing can tip.
    expect(corsa(scenario, 0).problem.solver.allowedSetIsConstant).toBe(true);
    // R = 10: the thresholds of way A lie above 0,85, so the set changes with the rate.
    expect(corsa(scenario, 10).problem.solver.allowedSetIsConstant).toBe(false);
  });

  it('the phases are contiguous, cover the period, and the figures follow them', () => {
    const { problem, selection, months } = corsa(scenario, 10);
    const sim = simulateSwitch(problem, selection.optionIndex);
    expect(sim.phases[0]?.fromMonth).toBe(0);
    expect(sim.phases.at(-1)?.toMonth).toBe(months);
    sim.phases.forEach((phase, at) => {
      if (at > 0) expect(phase.fromMonth).toBe(sim.phases[at - 1]?.toMonth);
    });
    const figures = phaseFigures(problem, sim.phases);
    expect(figures.evKmPerYear).toBeLessThan(selection.evKmPerYear);
    expect(figures.evOdometerEnd).toBeCloseTo(
      odometerAt(problem, sim.phases, months),
      6,
    );
    expect(figures.evOdometerEnd - problem.mileageKm).toBeCloseTo(
      (figures.evKmPerYear * months) / 12,
      6,
    );
    // The piecewise inverse agrees with the event: the cell of the first event tips there.
    const first = sim.events[0];
    expect(
      monthsUntilSohAlong(problem, sim.phases, first?.threshold ?? 0),
    ).toBeCloseTo(first?.month ?? NaN, 9);
  });

  it('Q5: the order of the entries does not change events or figures (tolerance of 8.4)', () => {
    const { problem, selection } = corsa(scenario, 10);
    const order = problem.groups.map((_, at) => at).reverse();
    const shuffled = {
      ...problem,
      groups: order.map((at) => problem.groups[at] as Group),
      info: order.map((at) => problem.info[at]),
    } as Problem;
    const optionIndex = order.map((at) => selection.optionIndex[at] as number);
    const a = simulateSwitch(problem, selection.optionIndex);
    const b = simulateSwitch(shuffled, optionIndex);
    expect(b.events).toHaveLength(a.events.length);
    a.events.forEach((event, at) => {
      expect(b.events[at]?.month).toBeCloseTo(event.month, 9);
      expect(b.events[at]?.rateAfter).toBeCloseTo(event.rateAfter, 6);
      expect(b.events[at]?.entries).toHaveLength(event.entries.length);
    });
    const fa = phaseFigures(problem, a.phases);
    const fb = phaseFigures(shuffled, b.phases);
    expect(fb.electricity).toBeCloseTo(fa.electricity, 6);
    expect(fb.petrol).toBeCloseTo(fa.petrol, 6);
    expect(fb.evOdometerEnd).toBeCloseTo(fa.evOdometerEnd, 6);
  });
});

// A hand-made problem: SoH 1 - 7.5e-7 · km, so a yearly rate of 10.000 km
// reaches 0,9 after 160 months. Prices 1, no escalation, D = 240 months.
function fake(
  groups: Group[],
  thresholds: number[],
  extra: Partial<Problem['costInput']> = {},
): Problem {
  return {
    groups,
    info: groups.map(() => ({ kind: 'extra', month: 0 })),
    thresholds,
    curve: { soh0: 1, k0: 0, sohMin: 0.85, slope: 7.5e-7 },
    mileageKm: 0,
    costInput: {
      electricityPrice: 1,
      petrolPrice: 1,
      electricityEscalationPct: 0,
      petrolEscalationPct: 0,
      evPerKm: 0,
      icePerKm: 0,
      comparisonMonths: 240,
      ...extra,
    },
  } as unknown as Problem;
}
const ev = (needs: number, km = 10000, grid = 100): Option => ({
  km,
  cost: 0,
  needs,
  choice: 'ev',
  quantities: { gridKwh: grid, litres: 0, iceKm: 0 },
});
const petrol = (litres = 100): Option => ({
  km: 0,
  cost: 0,
  needs: null,
  choice: 'rest',
  quantities: { gridKwh: 0, litres, iceKm: 10000 },
});

describe('C3b: rules of the simulation', () => {
  it('two thresholds that are crossed at the same time are one event', () => {
    const problem = fake(
      [
        { key: 'a', options: [ev(0), petrol()] },
        { key: 'b', options: [ev(1), petrol()] },
      ],
      [0.9, 0.9],
    );
    const sim = simulateSwitch(problem, [0, 0]);
    expect(sim.events).toHaveLength(1);
    expect(sim.events[0]?.entries).toHaveLength(2);
    // Two groups at 10.000 km per year: 20.000 km per year reach 0,9 after 80 months.
    expect(sim.events[0]?.month).toBeCloseTo(80, 9);
    expect(sim.events[0]?.rateAfter).toBe(0);
  });

  it('different thresholds are separate events, the second after the rate has fallen', () => {
    const problem = fake(
      [
        { key: 'a', options: [ev(0), petrol()] },
        { key: 'b', options: [ev(1), petrol()] },
      ],
      [0.9, 0.88],
    );
    const sim = simulateSwitch(problem, [0, 0]);
    expect(sim.events.map((event) => event.entries.length)).toEqual([1, 1]);
    // First at 0,9 with 20.000 km per year; then 10.000 km per year to 0,88.
    expect(sim.events[0]?.month).toBeCloseTo(80, 9);
    expect(sim.events[1]?.month).toBeCloseTo(
      80 + (12 * (160_000 - 133_333.33333333334)) / 10000,
      6,
    );
    expect(sim.phases.map((phase) => phase.evKmPerYear)).toEqual([
      20000, 10000, 0,
    ]);
  });

  it('an option without a need, such as the extra mileage, never moves and keeps the rate', () => {
    const extra: Option = {
      km: 1000,
      cost: 0,
      needs: null,
      choice: 'share:50',
      quantities: { gridKwh: 5, litres: 5, iceKm: 1000 },
    };
    const problem = fake(
      [
        { key: 'a', options: [ev(0), petrol()] },
        { key: 'x', options: [extra] },
      ],
      [0.9],
    );
    const sim = simulateSwitch(problem, [0, 0]);
    expect(sim.events).toHaveLength(1);
    expect(sim.events[0]?.entries.map((entry) => entry.group)).toEqual([0]);
    expect(sim.phases.map((phase) => phase.evKmPerYear)).toEqual([11000, 1000]);
  });

  it('a group without an allowed option makes the plan infeasible, at that time', () => {
    const problem = fake(
      [
        { key: 'a', options: [ev(0), ev(1, 10000, 90)] },
        { key: 'b', options: [ev(1), ev(0, 10000, 90)] },
      ],
      [0.9, 0.9],
    );
    const sim = simulateSwitch(problem, [0, 0]);
    expect(sim.infeasible?.month).toBeCloseTo(80, 9);
    expect(sim.infeasible?.group).toBe(0);
  });

  it('a switch inside the period moves to the cheaper allowed option, ties go to the lower threshold and to resting', () => {
    const cheap = ev(1, 10000, 50);
    const sameCost = ev(2, 10000, 50);
    const problem = fake(
      [
        // Cheapest allowed wins over the one that costs more.
        { key: 'a', options: [ev(0), cheap, petrol(1000)] },
        // Equal cost (within 0,01): the lower threshold, 0,85, beats 0,88.
        { key: 'b', options: [ev(0), sameCost, cheap] },
        // Equal cost with resting: resting has no threshold and wins.
        { key: 'c', options: [ev(0), petrol(50), cheap] },
      ],
      [0.9, 0.88, 0.85],
    );
    const sim = simulateSwitch(problem, [0, 0, 0]);
    const first = sim.events[0];
    expect(first?.entries.map((entry) => [entry.group, entry.to])).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
  });

  it('TC26: a switch at 0 gives the cost of the fallback, a switch at D the cost of the original', () => {
    for (const escalation of [0, 3]) {
      const problem = fake([], [], {
        comparisonMonths: 48,
        electricityEscalationPct: escalation,
        petrolEscalationPct: escalation,
      });
      const original = ev(0, 10000, 100);
      const fallback = petrol(80);
      const whole = (option: Option) =>
        optionWindowCost(problem, option, 0, 48);
      expect(
        optionWindowCost(problem, original, 0, 0) +
          optionWindowCost(problem, fallback, 0, 48),
      ).toBeCloseTo(whole(fallback), 12);
      expect(
        optionWindowCost(problem, original, 0, 48) +
          optionWindowCost(problem, fallback, 48, 48),
      ).toBeCloseTo(whole(original), 12);
      // A split at 24: the phases add up to the cost of the original over the whole period.
      expect(
        optionWindowCost(problem, original, 0, 24) +
          optionWindowCost(problem, original, 24, 48),
      ).toBeCloseTo(whole(original), 12);
      if (escalation === 0) {
        expect(optionWindowCost(problem, original, 0, 12)).toBeCloseTo(
          whole(original) / 4,
          12,
        );
      }
    }
  });
});
