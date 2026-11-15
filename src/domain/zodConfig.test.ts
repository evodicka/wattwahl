import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import './index';

// S23: the policy of architecture 8.11 forbids `new Function`.
describe('S23: zod runs without code generation', () => {
  it('is set to jitless by the domain module', () => {
    expect(z.core.globalConfig.jitless).toBe(true);
  });

  it('still checks values', () => {
    expect(z.object({ a: z.number() }).safeParse({ a: 'x' }).success).toBe(
      false,
    );
    expect(z.object({ a: z.number() }).safeParse({ a: 1 }).success).toBe(true);
  });
});
