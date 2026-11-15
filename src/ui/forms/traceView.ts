import type { FormulaId, OkOfferResult, TraceEntry } from '../../domain';

/** One step of the Rechenweg with what the view needs to show it. */
export type TraceRow = {
  /** Position in the trace; unique, so a row has a stable key. */
  index: number;
  entry: TraceEntry;
  /** The step uses a value of a parameter that is a placeholder ("Annahme"). */
  assumption: boolean;
};

export type TraceFamily =
  'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'OPT';

export type TraceGroup = { family: TraceFamily; rows: TraceRow[] };

export type TraceView = {
  /** The steps that give the numbers of the result: each with the result field it fills. */
  numbers: TraceRow[];
  /** Every step, by formula family in the order of the specification. */
  groups: TraceGroup[];
};

const FAMILIES: readonly TraceFamily[] = [
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'OPT',
];

/**
 * Inputs of a step that are parameters whose default is a placeholder (spec
 * "Parameterliste"): a step with one of them carries the mark "Annahme".
 */
const PLACEHOLDER_INPUTS: ReadonlySet<string> = new Set([
  'safetyBufferPct',
  'kmToSohMin',
  'chargingEfficiencyPct',
  'tColdC',
  'tMildC',
  'tempC',
  'coldReserveK',
  'highwayDiscountPct',
  'depreciationPctPerYear',
  'freeDaysPerYear',
  'ageMonths',
]);

const familyOf = (formula: FormulaId): TraceFamily => {
  const family = formula.split('.')[0] as TraceFamily;
  return FAMILIES.includes(family) ? family : 'OPT';
};

const rowOf = (entry: TraceEntry, index: number): TraceRow => ({
  index,
  entry,
  assumption: Object.keys(entry.inputs).some((key) =>
    PLACEHOLDER_INPUTS.has(key),
  ),
});

/**
 * Splits a trace for display. `numbers` holds the steps linked to a field of
 * the result (Q6), one per field; of the 24 reserve cells only the smallest
 * one is listed, the others are in the heatmap.
 */
export function traceView(
  entries: TraceEntry[],
  result: OkOfferResult,
): TraceView {
  const min = result.minReserve;
  const minCell = min
    ? result.reserves.findIndex(
        (r) => r.way === min.way && r.month === min.month,
      )
    : -1;
  const seen = new Set<string>();
  const numbers: TraceRow[] = [];
  const rows = entries.map(rowOf);
  for (const row of rows) {
    const path = row.entry.resultPath;
    if (!path || seen.has(path)) continue;
    const cell = /^reserves\[(\d+)\]\./.exec(path);
    if (cell && Number(cell[1]) !== minCell) continue;
    seen.add(path);
    numbers.push(row);
  }
  const groups: TraceGroup[] = FAMILIES.flatMap((family) => {
    const own = rows.filter((row) => familyOf(row.entry.formula) === family);
    return own.length > 0 ? [{ family, rows: own }] : [];
  });
  return { numbers, groups };
}
