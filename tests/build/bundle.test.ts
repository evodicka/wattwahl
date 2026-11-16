import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

// S20 / architecture 8.9, ADR-11: the chart library is not in the start
// bundle; every chart is a chunk of its own, loaded when a view shows it.
// The build runs in memory (no files written).

type Chunk = {
  type: 'chunk';
  code: string;
  fileName: string;
  isEntry: boolean;
  isDynamicEntry: boolean;
  imports: string[];
  moduleIds: string[];
  facadeModuleId: string | null;
};

type Asset = { type: 'asset'; fileName: string; source: string | Uint8Array };

async function outputOfBuild(): Promise<{ chunks: Chunk[]; assets: Asset[] }> {
  const result = await build({
    logLevel: 'silent',
    build: { write: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks: Chunk[] = [];
  const assets: Asset[] = [];
  for (const output of outputs) {
    if (!('output' in output)) continue;
    for (const item of output.output) {
      if (item.type === 'chunk') chunks.push(item as unknown as Chunk);
      else assets.push(item as unknown as Asset);
    }
  }
  return { chunks, assets };
}

async function chunksOfBuild(): Promise<Chunk[]> {
  return (await outputOfBuild()).chunks;
}

/** Module ids with forward slashes, whatever the platform. */
const normalize = (id: string) => id.replaceAll('\\', '/');

const usesVisx = (chunk: Chunk) =>
  chunk.moduleIds.some((id) => normalize(id).includes('/@visx/'));

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
  let chunks: Chunk[] = [];
  beforeAll(async () => {
    chunks = await chunksOfBuild();
  }, 120_000);

  it('keeps the chart library out of the start chunks and in lazy chunks', () => {
    const start = startChunks(chunks);
    expect(start.length).toBeGreaterThan(0);
    expect(start.filter(usesVisx).map((c) => c.fileName)).toEqual([]);
    expect(chunks.filter(usesVisx).length).toBeGreaterThan(0);
  });

  it('makes every chart a chunk of its own that no start chunk contains', () => {
    const start = startChunks(chunks).map((c) => c.fileName);
    for (const chart of ['CostBars', 'ReserveHeatmap', 'AssignmentGrid']) {
      const owner = chunks.find((c) =>
        c.moduleIds.some((id) =>
          normalize(id).endsWith(`/charts/${chart}.tsx`),
        ),
      );
      expect(owner, chart).toBeDefined();
      expect(owner?.isEntry, `${chart} is not an entry chunk`).toBe(false);
      expect(start, `${chart} is not in a start chunk`).not.toContain(
        owner?.fileName,
      );
    }
  });
});

// S24 / architecture 11 (set at G2): the start chunks (main bundle and worker
// together) stay within 250 KB gzip. Charts and other lazy chunks do not count.
const START_BUDGET_BYTES = 250 * 1000;

const chunkSize = (_output: unknown, chunk: Chunk) => gzipSize(chunk.code);

const gzipSize = (source: string | Uint8Array) =>
  gzipSync(typeof source === 'string' ? Buffer.from(source) : source).length;

describe('S24: bundle budget', () => {
  let output: { chunks: Chunk[]; assets: Asset[] } = { chunks: [], assets: [] };
  beforeAll(async () => {
    // Vitest sets NODE_ENV=test, which makes the build bundle React's
    // development code, about a third larger than what is deployed. The
    // budget is about the deployed build.
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      output = await outputOfBuild();
    } finally {
      if (before === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = before;
    }
  }, 120_000);

  it('keeps the start chunks and the worker within 250 KB gzip', () => {
    const start = startChunks(output.chunks);
    // Vite emits the worker either as a chunk or as an asset of its own build.
    const workerChunks = output.chunks.filter(
      (c) => c.isEntry && c.fileName.includes('worker'),
    );
    const workerAssets = output.assets.filter((a) =>
      /worker.*\.js$/.test(a.fileName),
    );
    expect(
      workerChunks.length + workerAssets.length,
      'the core worker is part of the build output',
    ).toBeGreaterThan(0);

    const sizes = [
      ...start.map((c) => ({ name: c.fileName, bytes: chunkSize(output, c) })),
      ...workerChunks.map((c) => ({
        name: c.fileName,
        bytes: chunkSize(output, c),
      })),
      ...workerAssets.map((a) => ({
        name: a.fileName,
        bytes: gzipSize(a.source),
      })),
    ];
    const total = sizes.reduce((sum, item) => sum + item.bytes, 0);
    console.log(
      `S24 start bundle: ${(total / 1000).toFixed(1)} KB gzip of ${START_BUDGET_BYTES / 1000} KB (` +
        sizes
          .map((s) => `${s.name} ${(s.bytes / 1000).toFixed(1)}`)
          .join(', ') +
        ')',
    );
    expect(total).toBeLessThanOrEqual(START_BUDGET_BYTES);
  });
});
