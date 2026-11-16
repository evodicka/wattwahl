import type {
  CandidateCompute,
  PlanSwitch,
  ScenarioCompute,
  UnsuitableReason,
} from '../../domain';
import {
  effectiveDepreciationPct,
  iceKmPerYear,
  leaseCost,
  maintenanceCost,
  purchaseCost,
} from '../calc/costs';
import { maintenanceFactor } from '../calc/prices';
import {
  optimizeOffer,
  type OfferTerms,
  type OptimizerOutcome,
} from './optimize';
import type { Problem } from './problem';
import { TIE_BAND } from './select';
import {
  phaseFigures,
  simulateSwitch,
  type PhaseFigures,
  type Simulation,
} from './switchPlan';
import type { Option } from './types';

// Mode `switch` (spec "Plan mit Wechselzeitpunkt", rules 3 and 7 to 8): runs
// the fixed plan and the plan with switch points and says which one the
// result follows.

type Ok = Extract<OptimizerOutcome, { status: 'ok' }>;

/** The pieces of the plan with switch points the result is built from. */
export type SwitchPlanParts = {
  /** The plan P at the start, with the warranty figures of its run. */
  start: Ok;
  simulation: Simulation;
  figures: PhaseFigures;
  /** K_ICE as the result states it: total km minus K_EV. */
  iceKmPerYear: number;
  acquisition: number;
  maintenance: number;
};

export type SwitchDecision =
  | { status: 'unsuitable'; reason: UnsuitableReason }
  | { status: 'ok'; chosen: 'fixed'; fixed: Ok; planSwitch: PlanSwitch }
  | {
      status: 'ok';
      chosen: 'switch';
      parts: SwitchPlanParts;
      planSwitch: PlanSwitch;
    };

/** Target cost of the plan with switch points: acquisition and the costs of the phases. */
function switchTarget(
  scenario: ScenarioCompute,
  candidate: CandidateCompute,
  problem: Problem,
  terms: OfferTerms,
  start: Ok,
  simulation: Simulation,
): { parts: SwitchPlanParts; target: number } {
  const months = scenario.parameters.comparisonMonths;
  const figures = phaseFigures(problem, simulation.phases);
  const kIce = iceKmPerYear(
    start.quantities.evKm + start.quantities.iceKm,
    figures.evKmPerYear,
  );
  const acquisition =
    terms.kind === 'purchase'
      ? purchaseCost(
          candidate.purchasePrice,
          effectiveDepreciationPct(candidate, scenario.parameters),
          months,
        )
      : leaseCost(terms.tier, figures.evKmPerYear, months).total;
  const maintenance = maintenanceCost(
    { ev: figures.evKmPerYear, ice: kIce },
    { ev: problem.costInput.evPerKm, ice: problem.costInput.icePerKm },
    maintenanceFactor(months),
  );
  // Same order as the total of the result, so both are the same number.
  const target =
    acquisition + figures.electricity + figures.petrol + maintenance;
  return {
    parts: {
      start,
      simulation,
      figures,
      iceKmPerYear: kIce,
      acquisition,
      maintenance,
    },
    target,
  };
}

function eventsOf(
  problem: Problem,
  simulation: Simulation,
): PlanSwitch['events'] {
  const choiceOf = (group: number, option: number): 'evA' | 'evB' | 'rest' => {
    const choice = (
      (problem.groups[group] as { options: readonly Option[] }).options[
        option
      ] as Option
    ).choice;
    if (choice === 'evA' || choice === 'evB' || choice === 'rest')
      return choice;
    throw new RangeError(`Unexpected plan choice "${choice}".`);
  };
  return simulation.events.map((event) => ({
    month: event.month,
    soh: event.soh,
    evKmPerYear: event.rateAfter,
    entries: event.entries.flatMap((entry) => {
      const info = problem.info[entry.group];
      if (info?.kind !== 'day') return [];
      return [
        {
          weekday: info.weekday,
          month: info.month,
          state: info.state,
          from: choiceOf(entry.group, entry.from),
          to: choiceOf(entry.group, entry.to),
        },
      ];
    }),
  }));
}

/**
 * The result of an offer in mode `switch`. The fixed plan is the one of mode
 * `fixed` with the SoH at the end. The strict mode checks over time, which is
 * that same plan (rule 8). Otherwise the plan with switch points wins if it is
 * admissible and cheaper than the fixed plan by more than the tie band, so the
 * result is never worse than `fixed` (rule 7). Only if neither is admissible is
 * the offer unsuitable.
 */
export function decideSwitch(
  scenario: ScenarioCompute,
  candidate: CandidateCompute,
  problem: Problem,
  terms: OfferTerms,
): SwitchDecision {
  const fixed = optimizeOffer(scenario, candidate, problem, terms);
  if (scenario.parameters.strictMode) {
    if (fixed.status === 'unsuitable') {
      return { status: 'unsuitable', reason: fixed.reason };
    }
    return {
      status: 'ok',
      chosen: 'fixed',
      fixed,
      planSwitch: {
        chosen: 'fixed',
        switchTargetCost: null,
        fixedTargetCost: fixed.targetCost,
        infeasibleAfterMonths: null,
        events: [],
      },
    };
  }

  const start = optimizeOffer(
    scenario,
    candidate,
    problem,
    terms,
    undefined,
    'start',
  );
  let candidatePlan: ReturnType<typeof switchTarget> | null = null;
  let simulation: Simulation | null = null;
  if (start.status === 'ok') {
    simulation = simulateSwitch(problem, start.optionIndex);
    if (!simulation.infeasible) {
      candidatePlan = switchTarget(
        scenario,
        candidate,
        problem,
        terms,
        start,
        simulation,
      );
    }
  }

  const fixedTargetCost = fixed.status === 'ok' ? fixed.targetCost : null;
  const infeasibleAfterMonths = simulation?.infeasible?.month ?? null;
  if (candidatePlan === null) {
    if (fixed.status === 'unsuitable') {
      return { status: 'unsuitable', reason: fixed.reason };
    }
    return {
      status: 'ok',
      chosen: 'fixed',
      fixed,
      planSwitch: {
        chosen: 'fixed',
        switchTargetCost: null,
        fixedTargetCost,
        infeasibleAfterMonths,
        events: [],
      },
    };
  }
  if (
    fixedTargetCost !== null &&
    !(candidatePlan.target < fixedTargetCost - TIE_BAND)
  ) {
    return {
      status: 'ok',
      chosen: 'fixed',
      fixed: fixed as Ok,
      planSwitch: {
        chosen: 'fixed',
        switchTargetCost: candidatePlan.target,
        fixedTargetCost,
        infeasibleAfterMonths: null,
        events: [],
      },
    };
  }
  return {
    status: 'ok',
    chosen: 'switch',
    parts: candidatePlan.parts,
    planSwitch: {
      chosen: 'switch',
      switchTargetCost: candidatePlan.target,
      fixedTargetCost,
      infeasibleAfterMonths: null,
      events: eventsOf(problem, candidatePlan.parts.simulation),
    },
  };
}
