import { build } from 'vite';
import { describe, expect, it } from 'vitest';

// S20 / architecture 8.9, ADR-11: the chart library is not in the start
// bundle; every chart is a chunk of its own, loaded when a view shows it.
// The build runs in memory (no files written).

type Chunk = {
  type: 'chunk';
  fileName: string;
  isEntry: boolean;
  isDynamicEntry: boolean;
  imports: string[];
  moduleIds: string[];
  facadeModuleId: string | null;
};

async function chunksOfBuild(): Promise<Chunk[]> {
  const result = await build({
    logLevel: 'silent',
    build: { write: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks: Chunk[] = [];
  for (const output of outputs) {
    if (!('output' in output)) continue;
    for (const item of output.output) {
      if (item.type === 'chunk') chunks.push(item as unknown as Chunk);
    }
  }
  return chunks;
}

const usesVisx = (chunk: Chunk) =>
  chunk.moduleIds.some((id) => id.includes('/@visx/'));

/** The entry chunk and everything it imports statically. */
function startChunks(chunks: Chunk[]): Chunk[] {
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  const seen = new Set<string>();
  const queue = chunks.filter(
    (c) => c.isEntry && !c.fileName.includes('worker'),
  );
  const result: Chunk[] = [];
  while (queue.length > 0) {
    const chunk = queue.pop();
    if (!chunk || seen.has(chunk.fileName)) continue;
    seen.add(chunk.fileName);
    result.push(chunk);
    for (const name of chunk.imports) {
      const next = byName.get(name);
      if (next) queue.push(next);
    }
  }
  return result;
}

describe('S20: chart library and start bundle', () => {
  it('keeps the chart library out of the start chunks and in lazy chunks of the charts', async () => {
    const chunks = await chunksOfBuild();
    const start = startChunks(chunks);
    expect(start.length).toBeGreaterThan(0);
    expect(start.filter(usesVisx).map((c) => c.fileName)).toEqual([]);

    const withVisx = chunks.filter(usesVisx);
    expect(withVisx.length).toBeGreaterThan(0);
    for (const chunk of withVisx) {
      expect(start.map((c) => c.fileName)).not.toContain(chunk.fileName);
    }
  }, 120_000);

  it('makes every chart a chunk of its own', async () => {
    const chunks = await chunksOfBuild();
    const sources = chunks.flatMap((c) => c.moduleIds);
    for (const chart of ['CostBars', 'ReserveHeatmap', 'AssignmentGrid']) {
      const owner = chunks.find((c) =>
        c.moduleIds.some((id) => id.endsWith(`/charts/${chart}.tsx`)),
      );
      expect(owner, chart).toBeDefined();
      expect(owner?.isEntry, `${chart} is not in the entry chunk`).toBe(false);
    }
    expect(sources.length).toBeGreaterThan(0);
  }, 120_000);
});
