import { describe, expect, it } from 'vitest';
import type { OkOfferResult, PlanSwitch } from '../../domain';
import {
  cellSwitches,
  choiceAt,
  planStateCounts,
  switchChains,
} from './switchView';

// C3b: what the views derive from `planSwitch` (spec "Auswertung").

const entry = (
  weekday: 'wed' | 'thu',
  month: number,
  from: 'evA' | 'evB',
  to: 'rest' | 'evA' | 'evB',
) => ({ weekday, month, state: 'onlyA' as const, from, to });

const planSwitch: PlanSwitch = {
  chosen: 'switch',
  switchTargetCost: 1,
  fixedTargetCost: 2,
  infeasibleAfterMonths: null,
  events: [
    {
      month: 30.47,
      soh: 0.9,
      evKmPerYear: 100,
      entries: [entry('wed', 0, 'evA', 'evB'), entry('thu', 0, 'evA', 'rest')],
    },
    {
      month: 50.2,
      soh: 0.88,
      evKmPerYear: 50,
      entries: [entry('wed', 0, 'evB', 'rest')],
    },
  ],
};

const result = (ps: PlanSwitch | null) =>
  ({
    planSwitch: ps,
    plan: [
      { weekday: 'wed', month: 0, state: 'onlyA', choice: 'evA' },
      { weekday: 'thu', month: 0, state: 'onlyA', choice: 'evA' },
      { weekday: 'thu', month: 5, state: 'onlyA', choice: 'evA' },
      { weekday: 'fri', month: 0, state: 'onlyA', choice: 'rest' },
    ],
  }) as unknown as OkOfferResult;

describe('C3b: switchView', () => {
  it('has no chains for the fixed plan, in mode fixed and for an infeasible switch plan', () => {
    expect(switchChains(null).size).toBe(0);
    expect(switchChains({ ...planSwitch, chosen: 'fixed' }).size).toBe(0);
  });

  it('follows an entry through several switches', () => {
    const chain = switchChains(planSwitch).get('wed:0:onlyA');
    if (!chain) throw new Error('no chain');
    expect(chain.steps.map((step) => step.to)).toEqual(['evB', 'rest']);
    expect([0, 30.46, 30.47, 49, 50.2].map((m) => choiceAt(chain, m))).toEqual([
      'evA',
      'evA',
      'evB',
      'evB',
      'rest',
    ]);
  });

  it('counts what the plan does at a point in time', () => {
    const r = result(planSwitch);
    expect(planStateCounts(r, 0)).toEqual({ drives: 3, rests: 0, swapped: 0 });
    expect(planStateCounts(r, 40)).toEqual({ drives: 1, rests: 1, swapped: 1 });
    expect(planStateCounts(r, 60)).toEqual({ drives: 1, rests: 2, swapped: 0 });
  });

  it('names per heatmap cell the first switch and what follows', () => {
    const cells = cellSwitches(result(planSwitch));
    // Way A in January: one entry goes to the other way, one to the petrol car.
    expect(cells.get('a:0')).toEqual({ atMonth: 30.47, then: 'mixed' });
    expect(cells.has('a:5')).toBe(false);
  });
});
