import { describe, expect, it } from 'vitest';
import { isIosBrowserTab } from './install';

// S23: when the iOS install hint (Z09) applies.

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Mobile Safari/537.36';

describe('S23: isIosBrowserTab', () => {
  it('is true for an iPhone or iPad in a browser tab', () => {
    expect(isIosBrowserTab({ userAgent: IPHONE }, false)).toBe(true);
    expect(
      isIosBrowserTab({ userAgent: IPHONE.replace('iPhone', 'iPad') }, false),
    ).toBe(true);
  });

  it('is true for an iPad that calls itself a Mac (iPadOS 13 and later)', () => {
    expect(
      isIosBrowserTab(
        { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 },
        false,
      ),
    ).toBe(true);
  });

  it('is false for a real Mac and for Android', () => {
    expect(
      isIosBrowserTab(
        { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 },
        false,
      ),
    ).toBe(false);
    expect(isIosBrowserTab({ userAgent: ANDROID }, false)).toBe(false);
  });

  it('is false once the app runs from the home screen', () => {
    expect(
      isIosBrowserTab({ userAgent: IPHONE, standalone: true }, false),
    ).toBe(false);
    expect(isIosBrowserTab({ userAgent: IPHONE }, true)).toBe(false);
  });
});
