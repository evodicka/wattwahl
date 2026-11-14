import { describe, expect, it } from 'vitest';
import { Trace } from './trace';

describe('Trace', () => {
  it('add returns the index of the new entry', () => {
    const trace = new Trace();
    expect(trace.add({ formula: 'F3.n', inputs: {}, value: 2 })).toBe(0);
    expect(trace.add({ formula: 'F3.u', inputs: {}, value: 0.63 })).toBe(1);
    expect(trace.entries).toHaveLength(2);
  });

  it('link sets the result path of an existing entry', () => {
    const trace = new Trace();
    const index = trace.add({ formula: 'F3.n', inputs: {}, value: 2 });
    trace.link(index, 'ways.0.n');
    expect(trace.entries[index]?.resultPath).toBe('ways.0.n');
  });

  it('link throws a RangeError for an unknown index', () => {
    const trace = new Trace();
    expect(() => trace.link(0, 'x')).toThrow(RangeError);
  });
});
