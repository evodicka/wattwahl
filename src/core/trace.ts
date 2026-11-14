import type { TraceEntry } from '../domain';

/**
 * Collector for the Rechenweg (architecture 8.4). Formulas take an optional
 * trace and write with `trace?.add({ ... })`: optional chaining skips building
 * the entry when no trace is given, so the main run pays nothing.
 */
export class Trace {
  readonly entries: TraceEntry[] = [];

  /** Appends an entry and returns its index, so S10 can link it to a result field. */
  add(entry: TraceEntry): number {
    this.entries.push(entry);
    return this.entries.length - 1;
  }

  /** Links the entry at `index` to a field of the offer result (Q6). */
  link(index: number, resultPath: string): void {
    const entry = this.entries[index];
    if (!entry) throw new RangeError(`Trace has no entry ${index}`);
    entry.resultPath = resultPath;
  }
}
