import type { Plugin } from 'vite';

/**
 * The Content Security Policy of architecture 8.11. GitHub Pages cannot send
 * headers, so it goes into the page as a meta tag.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/**
 * Puts the policy into `index.html` of the build. Not in development: the dev
 * server needs inline scripts for hot reload.
 */
export function contentSecurityPolicy(): Plugin {
  return {
    name: 'wattwahl:csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: CONTENT_SECURITY_POLICY,
          },
          // First in the head: the policy only covers what comes after it.
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

/**
 * Names the build in a meta tag (`BUILD_ID` from the environment). It makes
 * two builds differ in `index.html`, so the end-to-end test can tell them
 * apart and the service worker sees an update.
 */
export function buildId(id = process.env.BUILD_ID ?? 'local'): Plugin {
  return {
    name: 'wattwahl:build-id',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { name: 'build-id', content: id },
        injectTo: 'head',
      },
    ],
  };
}
