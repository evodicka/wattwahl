import { it } from 'vitest';
import { detPow } from '../detPow';

// Micro-benchmark for S11: cost of detPow against Math.pow on the inputs the
// formulas use. Run with `npm run bench`. The results are summed into `sink`
// so the engine cannot drop the loops, and detPow is aliased locally to avoid
// the module export getter overhead.
const exponents = Array.from({ length: 100 }, (_, i) => (i + 1) / 12);
const deterministicPow = detPow;
let sink = 0;

it('detPow vs Math.pow, base 0.85, exponent D/12 for D = 1..100', async ({
  bench,
}) => {
  await bench.compare(
    bench('detPow', () => {
      for (const exponent of exponents)
        sink += deterministicPow(0.85, exponent);
    }),
    bench('Math.pow', () => {
      for (const exponent of exponents) sink += Math.pow(0.85, exponent);
    }),
  );
  if (Number.isNaN(sink)) throw new Error('unreachable');
});
