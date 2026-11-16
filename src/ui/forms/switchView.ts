import type { OkOfferResult, PlanSwitch } from '../../domain';

type PlanChoice = PlanSwitch['events'][number]['entries'][number]['to'];

/** The way the EV drives in a choice, or `null` if it rests. */
export const wayOfChoice = (choice: PlanChoice): 'a' | 'b' | null =>
  choice === 'evA' ? 'a' : choice === 'evB' ? 'b' : null;

/** What one plan entry (weekday, month, presence state) does over time: where it starts and each switch. */
export type SwitchChain = {
  start: PlanChoice;
  /** In time order; `atMonth` is exact, the display rounds it down. */
  steps: { atMonth: number; to: PlanChoice }[];
};

export const entryKey = (entry: {
  weekday: string;
  month: number;
  state: string;
}): string => `${entry.weekday}:${entry.month}:${entry.state}`;

/**
 * The entries that switch, by weekday, month and state. Empty unless the plan
 * with switch points is the chosen one (the fixed plan never switches).
 */
export function switchChains(
  planSwitch: PlanSwitch | null,
): Map<string, SwitchChain> {
  const chains = new Map<string, SwitchChain>();
  if (planSwitch?.chosen !== 'switch') return chains;
  for (const event of planSwitch.events) {
    for (const entry of event.entries) {
      const key = entryKey(entry);
      const chain = chains.get(key) ?? { start: entry.from, steps: [] };
      chain.steps.push({ atMonth: event.month, to: entry.to });
      chains.set(key, chain);
    }
  }
  return chains;
}

/** The choice of a chain at a point in time (months from the start). */
export function choiceAt(chain: SwitchChain, month: number): PlanChoice {
  let choice = chain.start;
  for (const step of chain.steps) {
    if (step.atMonth <= month) choice = step.to;
  }
  return choice;
}

/**
 * What the plan does at a point in time over all entries the EV drives at the
 * start: still drives its way, rests, or drives the other way.
 */
export function planStateCounts(
  result: OkOfferResult,
  month: number,
): { drives: number; rests: number; swapped: number } {
  const counts = { drives: 0, rests: 0, swapped: 0 };
  const chains = switchChains(result.planSwitch);
  for (const cell of result.plan) {
    if (cell.choice === 'rest') {
      // Resting at the start; a switch plan never puts the EV back on a way.
      continue;
    }
    const chain = chains.get(entryKey(cell));
    const now = chain ? choiceAt(chain, month) : cell.choice;
    if (now === cell.choice) counts.drives++;
    else if (now === 'rest') counts.rests++;
    else counts.swapped++;
  }
  return counts;
}

/**
 * Per cell of the heatmap (way, month) what happens to the entries the EV
 * drives there at the start, once the way tips: `ice` (all go to the petrol
 * car), `other` (all drive the other way) or `mixed`. `null` for a cell no
 * entry leaves. `atMonth` is the first switch, exact.
 */
export function cellSwitches(
  result: OkOfferResult,
): Map<string, { atMonth: number; then: 'ice' | 'other' | 'mixed' }> {
  const chains = switchChains(result.planSwitch);
  const found = new Map<
    string,
    { atMonth: number; thens: Set<'ice' | 'other'> }
  >();
  for (const cell of result.plan) {
    const way = wayOfChoice(cell.choice);
    const chain = chains.get(entryKey(cell));
    const first = chain?.steps[0];
    if (!way || !first) continue;
    const key = `${way}:${cell.month}`;
    const known = found.get(key) ?? {
      atMonth: first.atMonth,
      thens: new Set(),
    };
    known.atMonth = Math.min(known.atMonth, first.atMonth);
    known.thens.add(first.to === 'rest' ? 'ice' : 'other');
    found.set(key, known);
  }
  return new Map(
    [...found].map(([key, { atMonth, thens }]) => [
      key,
      {
        atMonth,
        then: thens.size > 1 ? 'mixed' : thens.has('ice') ? 'ice' : 'other',
      },
    ]),
  );
}
