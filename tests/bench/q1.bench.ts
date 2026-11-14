import { it } from 'vitest';
import {
  CandidateComputeSchema,
  ScenarioComputeSchema,
  listOffers,
} from '../../src/domain';
import { hashResult } from '../../src/core';
import { resolvePrices } from '../../src/core/calc/prices';
import { optimizeOffer } from '../../src/core/optimizer/optimize';
import { buildProblem } from '../../src/core/optimizer/problem';
import { q1Scenario } from '../fixtures/q1Scenario';
import { Q1_PRICE_CASES, median, runQ1 } from './q1';

// Q1 in Node (architecture 10, S11). `npm run bench` prints the numbers; the
// browsers are measured by `npm run bench:browser`. The first run is cold (the
// engine has not optimised the code yet); a phone starts every session cold.

const RUNS = 4;
const round = (ms: number) => Math.round(ms * 10) / 10;

it('Q1 in Node: 10 candidates with purchase and 4 leases, 3 price cases', () => {
  const scenario = q1Scenario();
  const shared: number[] = [];
  let hash = '';
  for (let run = 0; run < RUNS; run++) {
    const { ms, results } = runQ1(scenario, true);
    shared.push(ms);
    hash = hashResult(results);
  }
  const unshared: number[] = [];
  for (let run = 0; run < 2; run++) unshared.push(runQ1(scenario, false).ms);

  // Where the time goes, warm: validation, building the problems, the first
  // offer of a problem (it runs the DP) and the other offers (cached DP).
  const phase = { validation: 0, build: 0, dp: 0, rest: 0 };
  const time = <T>(add: keyof typeof phase, work: () => T): T => {
    const start = performance.now();
    const value = work();
    phase[add] += performance.now() - start;
    return value;
  };
  const compute = time('validation', () =>
    ScenarioComputeSchema.parse(scenario),
  );
  for (const stored of scenario.candidates) {
    const candidate = time('validation', () =>
      CandidateComputeSchema.parse(stored),
    );
    for (const priceCase of Q1_PRICE_CASES) {
      const prices = resolvePrices(compute.iceVehicle, compute.parameters, {
        priceCase,
      });
      const problem = time('build', () =>
        buildProblem(compute, candidate, prices),
      );
      listOffers(candidate).forEach((offer, index) => {
        const tier = candidate.leaseTiers.find(
          (t) => offer.kind === 'lease' && t.id === offer.leaseTierId,
        );
        const terms =
          offer.kind === 'lease' && tier
            ? ({ kind: 'lease', tier } as const)
            : ({ kind: 'purchase' } as const);
        time(index === 0 ? 'dp' : 'rest', () =>
          optimizeOffer(compute, candidate, problem, terms),
        );
      });
    }
  }

  console.log(
    `Q1 node: cold ${round(shared[0] as number)} ms, warm ${shared
      .slice(1)
      .map(round)
      .join(
        ' / ',
      )} ms, median of the warm runs ${round(median(shared.slice(1)))} ms`,
  );
  console.log(
    `Q1 node without sharing the DP: ${unshared.map(round).join(' / ')} ms`,
  );
  console.log(
    `Q1 node phases (warm): validation ${round(phase.validation)} ms, build ${round(phase.build)} ms, first offer with DP ${round(phase.dp)} ms, other offers ${round(phase.rest)} ms`,
  );
  console.log(`Q1 node result hash: ${hash}`);
});
