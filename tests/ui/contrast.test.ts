import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contrastProblem,
  SURFACE_RAISED,
  tintContrast,
} from '../../src/ui/shell/contrast';

// S17: warning for traffic light colours whose text misses WCAG AA on their tint.

describe('S17: contrast of a traffic light colour', () => {
  it('uses the raised surface of the design tokens', () => {
    const tokens = JSON.parse(
      readFileSync(join(process.cwd(), 'docs/design/tokens.json'), 'utf8'),
    ) as {
      color: {
        tokens: { name: string; value: { light: string; dark: string } }[];
      };
    };
    const raised = tokens.color.tokens.find((t) => t.name === 'surface-raised');
    expect(raised?.value).toEqual(SURFACE_RAISED);
  });

  it('flags #ccaa00 (yellow on its tint) in the light mode', () => {
    expect(tintContrast('#ccaa00', 'light')).toBeLessThan(4.5);
    expect(contrastProblem('#ccaa00')?.schemes).not.toBeUndefined();
  });

  it('accepts the theme colours of the light and the dark mode', () => {
    expect(tintContrast('#14693a', 'light')).toBeGreaterThanOrEqual(4.5);
    expect(tintContrast('#74d6a0', 'dark')).toBeGreaterThanOrEqual(4.5);
  });

  it('passes a dark colour in both modes only if both are fine', () => {
    expect(contrastProblem('#000000')?.schemes).toBe('dark');
    expect(contrastProblem('#ffffff')?.schemes).toBe('light');
  });
});
