// WCAG contrast of a user-chosen traffic light colour (S17). S16 sets the
// colour as text on a tint of 18 % over --surface-raised (useTrafficLightColors);
// this checks that very pair in light and dark.

/** --surface-raised per scheme; tests/ui/contrast.test.ts checks it against the tokens. */
export const SURFACE_RAISED = { light: '#ffffff', dark: '#1c2024' } as const;

/** Same share as the `color-mix` in useTrafficLightColors. */
const TINT = 0.18;
export const MIN_CONTRAST = 4.5;

type Rgb = [number, number, number];

const parse = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: Rgb): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

/** Contrast of `color` as text on its own 18 % tint over the raised surface. */
export function tintContrast(color: string, scheme: 'light' | 'dark'): number {
  const text = parse(color);
  const surface = parse(SURFACE_RAISED[scheme]);
  const tint = text.map((v, i) =>
    Math.round(v * TINT + (surface[i] ?? 0) * (1 - TINT)),
  ) as Rgb;
  return contrastRatio(text, tint);
}

export type ContrastProblem = {
  schemes: 'light' | 'dark' | 'both';
  ratio: number;
};

/** The schemes in which the colour misses WCAG AA, with the lower ratio; `null` if it passes. */
export function contrastProblem(color: string): ContrastProblem | null {
  const light = tintContrast(color, 'light');
  const dark = tintContrast(color, 'dark');
  const failLight = light < MIN_CONTRAST;
  const failDark = dark < MIN_CONTRAST;
  if (!failLight && !failDark) return null;
  if (failLight && failDark) {
    return { schemes: 'both', ratio: Math.min(light, dark) };
  }
  return failLight
    ? { schemes: 'light', ratio: light }
    : { schemes: 'dark', ratio: dark };
}
