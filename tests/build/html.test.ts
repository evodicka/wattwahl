import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  buildId,
  contentSecurityPolicy,
} from '../../build/html';

// S23: the policy of architecture 8.11 and the build id meta tag.

describe('S23: content security policy', () => {
  it('is the policy of 8.11, directive for directive', () => {
    expect(CONTENT_SECURITY_POLICY.split('; ')).toEqual([
      "default-src 'self'",
      "script-src 'self'",
      "worker-src 'self'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
    ]);
  });

  it('allows no foreign origin, no inline script and no eval', () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:|\*|unsafe-/);
  });

  it('is added to the build only, as the first element of the head', () => {
    const plugin = contentSecurityPolicy();
    expect(plugin.apply).toBe('build');
    const hook = plugin.transformIndexHtml as {
      handler: () => {
        tag: string;
        attrs: Record<string, string>;
        injectTo: string;
      }[];
    };
    expect(hook.handler()).toEqual([
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: CONTENT_SECURITY_POLICY,
        },
        injectTo: 'head-prepend',
      },
    ]);
  });
});

describe('S23: build id', () => {
  it('names the build in a meta tag', () => {
    const hook = buildId('b').transformIndexHtml as unknown as () => {
      attrs: Record<string, string>;
    }[];
    expect(hook()[0]?.attrs).toEqual({ name: 'build-id', content: 'b' });
  });
});
