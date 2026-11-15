import { useEffect } from 'react';
import type { DeviceSettings } from '../../domain';

type Colors = DeviceSettings['trafficLightColors'];

const TOKENS = { green: 'ok', yellow: 'warn', red: 'bad' } as const;

/**
 * Applies the user's traffic light colours on the root element at runtime
 * (8.8), without a reload. The chosen colour is the text; the background is
 * a tint of it on the raised surface, so it works in light and dark. `null`
 * returns to the theme's tokens.
 */
export function useTrafficLightColors(
  colors: Colors,
  root: HTMLElement = document.documentElement,
) {
  useEffect(() => {
    if (!colors) return;
    for (const [light, token] of Object.entries(TOKENS)) {
      const color = colors[light as keyof typeof TOKENS];
      root.style.setProperty(`--${token}-fg`, color);
      root.style.setProperty(
        `--${token}-bg`,
        `color-mix(in srgb, ${color} 18%, var(--surface-raised))`,
      );
    }
    return () => {
      for (const token of Object.values(TOKENS)) {
        root.style.removeProperty(`--${token}-fg`);
        root.style.removeProperty(`--${token}-bg`);
      }
    };
  }, [colors, root]);
}
