import { energyCost } from '../calc/costs';
import {
  electricityFactorWindow,
  maintenanceFactorWindow,
  petrolFactorWindow,
} from '../calc/prices';
import { monthsUntilSoh, sohAt } from '../calc/soh';
import type { Problem } from './problem';
import { TIE_BAND } from './select';
import type { Option } from './types';

// Plan with switch points (spec "Plan mit Wechselzeitpunkt"): a linear pass
// over the entries of the plan P the optimizer chose at the SoH at the start.
// Every entry runs with its option while that is allowed and then moves to the
// cheapest option of its group that the SoH at that time still allows.

/** One entry that moves to another option at an event. Indices are into `Group.options`. */
export type SwitchEntry = { group: number; from: number; to: number };

export type SwitchEvent = {
  /** Months from the start, exact (a float). */
  month: number;
  /** The threshold crossed (the highest one of the entries that move). */
  threshold: number;
  /** SoH at the event. */
  soh: number;
  rateBefore: number;
  rateAfter: number;
  entries: SwitchEntry[];
};

/** A stretch of time with a constant EV rate and one option per group. */
export type SwitchPhase = {
  fromMonth: number;
  toMonth: number;
  /** EV km per year in this phase. */
  evKmPerYear: number;
  optionIndex: readonly number[];
};

export type Simulation = {
  phases: SwitchPhase[];
  events: SwitchEvent[];
  /** Set if a group ran out of options inside the comparison: the switch plan is not admissible. */
  infeasible: { month: number; group: number } | null;
};

const optionsOf = (problem: Problem, group: number): readonly Option[] =>
  (problem.groups[group] as Problem['groups'][number]).options;

/** SoH threshold of an option; none (`-Infinity`) for an option without need. */
const thresholdOf = (problem: Problem, option: Option): number =>
  option.needs === null
    ? -Infinity
    : (problem.thresholds[option.needs] as number);

/**
 * Cost of one option over the window [fromMonth, toMonth): energy and
 * maintenance of its yearly quantities times the price factors of the window
 * (spec sections 7 and 8).
 */
export function optionWindowCost(
  problem: Problem,
  option: Option,
  fromMonth: number,
  toMonth: number,
): number {
  const input = problem.costInput;
  const quantities = option.quantities ?? { gridKwh: 0, litres: 0, iceKm: 0 };
  return (
    energyCost(
      'electricity',
      quantities.gridKwh,
      input.electricityPrice,
      electricityFactorWindow(
        input.electricityEscalationPct,
        fromMonth,
        toMonth,
      ),
    ) +
    energyCost(
      'petrol',
      quantities.litres,
      input.petrolPrice,
      petrolFactorWindow(input.petrolEscalationPct, fromMonth, toMonth),
    ) +
    maintenanceFactorWindow(fromMonth, toMonth) *
      (input.evPerKm * option.km + input.icePerKm * quantities.iceKm)
  );
}

/**
 * The cheapest option of a group that is allowed once the SoH has fallen to
 * `threshold`, for the window [month, D). Within the tie band the lower
 * threshold wins ("E ruht" has none and is the best), then the order of the
 * options. `null` if no option is allowed.
 */
function fallbackOption(
  problem: Problem,
  group: number,
  threshold: number,
  month: number,
): number | null {
  const options = optionsOf(problem, group);
  const allowed: { index: number; cost: number; threshold: number }[] = [];
  options.forEach((option, index) => {
    const own = thresholdOf(problem, option);
    if (own < threshold) {
      allowed.push({
        index,
        cost: optionWindowCost(
          problem,
          option,
          month,
          problem.costInput.comparisonMonths,
        ),
        threshold: own,
      });
    }
  });
  if (allowed.length === 0) return null;
  const cheapest = Math.min(...allowed.map((entry) => entry.cost));
  const tied = allowed.filter((entry) => entry.cost <= cheapest + TIE_BAND);
  tied.sort((a, b) => a.threshold - b.threshold || a.index - b.index);
  return (tied[0] as { index: number }).index;
}

/**
 * Runs the plan `optionIndex` (one option per group, the plan at the start)
 * through the comparison. The rate K is constant between events; the next
 * event is when the SoH falls below the highest threshold of the options in
 * use (inverse of F2, as `monthsUntilSoh`). Entries whose threshold is crossed
 * move together to their fallback option. Extra-mileage options need nothing
 * and never move.
 */
export function simulateSwitch(
  problem: Problem,
  optionIndex: readonly number[],
): Simulation {
  const total = problem.costInput.comparisonMonths;
  const current = [...optionIndex];
  const phases: SwitchPhase[] = [];
  const events: SwitchEvent[] = [];
  let month = 0;
  let odometer = problem.mileageKm;

  const rateOf = (): number =>
    current.reduce(
      (sum, option, group) =>
        sum + (optionsOf(problem, group)[option] as Option).km,
      0,
    );

  for (;;) {
    const rate = rateOf();
    let highest = -Infinity;
    current.forEach((option, group) => {
      highest = Math.max(
        highest,
        thresholdOf(problem, optionsOf(problem, group)[option] as Option),
      );
    });
    const eventMonth =
      highest === -Infinity
        ? Infinity
        : month + monthsUntilSoh(problem.curve, odometer, rate, highest);
    if (!(eventMonth < total)) {
      phases.push({
        fromMonth: month,
        toMonth: total,
        evKmPerYear: rate,
        optionIndex: [...current],
      });
      return { phases, events, infeasible: null };
    }

    phases.push({
      fromMonth: month,
      toMonth: eventMonth,
      evKmPerYear: rate,
      optionIndex: [...current],
    });
    odometer += (rate * (eventMonth - month)) / 12;
    month = eventMonth;

    const entries: SwitchEntry[] = [];
    for (let group = 0; group < current.length; group++) {
      const from = current[group] as number;
      const own = thresholdOf(
        problem,
        optionsOf(problem, group)[from] as Option,
      );
      if (own < highest) continue;
      const to = fallbackOption(problem, group, highest, month);
      if (to === null) {
        return { phases, events, infeasible: { month, group } };
      }
      entries.push({ group, from, to });
    }
    for (const entry of entries) current[entry.group] = entry.to;
    events.push({
      month,
      threshold: highest,
      soh: sohAt(problem.curve, odometer),
      rateBefore: rate,
      rateAfter: rateOf(),
      entries,
    });
  }
}

/** Costs, rates and the end odometer of a simulated plan (spec rules 4 to 6). */
export type PhaseFigures = {
  electricity: number;
  petrol: number;
  /** Per phase, in the order of `Simulation.phases`: for the Rechenweg. */
  perPhase: { electricity: number; petrol: number }[];
  /** Time-weighted average of the rates: K_EV. */
  evKmPerYear: number;
  /** Odometer of the EV at the end of the comparison. */
  evOdometerEnd: number;
};

/**
 * Energy cost per phase (quantity of the phase times the price factor of its
 * window), the time-weighted K_EV and K_ICE and the odometer at the end.
 * Maintenance is not here: it is linear in the km, so the full-period formula
 * on the averages is exact.
 */
export function phaseFigures(
  problem: Problem,
  phases: readonly SwitchPhase[],
): PhaseFigures {
  const input = problem.costInput;
  const total = input.comparisonMonths;
  let electricity = 0;
  let petrol = 0;
  let evMonthKm = 0;
  const perPhase: PhaseFigures['perPhase'] = [];
  for (const phase of phases) {
    let gridKwh = 0;
    let litres = 0;
    phase.optionIndex.forEach((choice, group) => {
      const option = optionsOf(problem, group)[choice] as Option;
      gridKwh += option.quantities?.gridKwh ?? 0;
      litres += option.quantities?.litres ?? 0;
    });
    const months = phase.toMonth - phase.fromMonth;
    const electricityPart = energyCost(
      'electricity',
      gridKwh,
      input.electricityPrice,
      electricityFactorWindow(
        input.electricityEscalationPct,
        phase.fromMonth,
        phase.toMonth,
      ),
    );
    const petrolPart = energyCost(
      'petrol',
      litres,
      input.petrolPrice,
      petrolFactorWindow(
        input.petrolEscalationPct,
        phase.fromMonth,
        phase.toMonth,
      ),
    );
    electricity += electricityPart;
    petrol += petrolPart;
    perPhase.push({ electricity: electricityPart, petrol: petrolPart });
    evMonthKm += phase.evKmPerYear * months;
  }
  return {
    electricity,
    petrol,
    perPhase,
    evKmPerYear: evMonthKm / total,
    evOdometerEnd: problem.mileageKm + evMonthKm / 12,
  };
}

/** Odometer of the EV `month` months from the start along the phases. */
export function odometerAt(
  problem: Problem,
  phases: readonly SwitchPhase[],
  month: number,
): number {
  let odometer = problem.mileageKm;
  for (const phase of phases) {
    const until = Math.min(month, phase.toMonth);
    if (until > phase.fromMonth) {
      odometer += (phase.evKmPerYear * (until - phase.fromMonth)) / 12;
    }
    if (month <= phase.toMonth) break;
  }
  return odometer;
}

/**
 * Months from the start until the SoH falls below `threshold` along the
 * phases (`Infinity` if it does not inside them): the piecewise version of
 * `monthsUntilSoh`.
 */
export function monthsUntilSohAlong(
  problem: Problem,
  phases: readonly SwitchPhase[],
  threshold: number,
): number {
  let odometer = problem.mileageKm;
  for (const phase of phases) {
    const months = monthsUntilSoh(
      problem.curve,
      odometer,
      phase.evKmPerYear,
      threshold,
    );
    if (phase.fromMonth + months < phase.toMonth) {
      return phase.fromMonth + months;
    }
    odometer += (phase.evKmPerYear * (phase.toMonth - phase.fromMonth)) / 12;
  }
  return Infinity;
}
