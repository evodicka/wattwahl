import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// D4: every token of the design system has exactly one custom property in the
// theme, light and dark (architecture 8.8). The design system export at G3 is
// docs/design/tokens.json.

type ColorToken = { name: string; value: { light: string; dark: string } };
type ValueToken = { name: string; value: string };
type TypeStyle = {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
};
type Tokens = {
  color: { tokens: ColorToken[] };
  type: {
    families: Record<string, string>;
    groups: { family: string; styles: TypeStyle[] }[];
  };
  spacing: { tokens: ValueToken[] };
  radius: { tokens: ValueToken[] };
  shadow: { tokens: ValueToken[] };
};

const root = process.cwd();
const tokens = JSON.parse(
  readFileSync(join(root, 'docs/design/tokens.json'), 'utf8'),
) as Tokens;
const css = readFileSync(join(root, 'src/ui/theme.css'), 'utf8');

const DARK_START = '@media (prefers-color-scheme: dark) {';
const darkIndex = css.indexOf(DARK_START);
const lightBlock = css.slice(0, darkIndex);
const afterDark = css.slice(darkIndex);
const darkEnd = afterDark.indexOf('\n}\n');
const darkBlock = afterDark.slice(0, darkEnd);
const baseBlock = afterDark.slice(darkEnd);

/** All values declared for a custom property in a block of CSS. */
const declarations = (block: string, name: string): string[] =>
  [...block.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, 'g'))].map((m) =>
    (m[1] ?? '').trim(),
  );

const colorOf = (block: string, name: string): string => {
  const [value] = declarations(block, name);
  if (!value) throw new Error(`--${name} is missing`);
  return value;
};

describe('D4: theme.css has every token exactly once', () => {
  it('has a light, a dark and a base block', () => {
    expect(darkIndex).toBeGreaterThan(0);
    expect(darkEnd).toBeGreaterThan(0);
  });

  it.each(tokens.color.tokens.map((t) => [t.name, t] as const))(
    'color %s: one light and one dark value, equal to the design system',
    (name, token) => {
      expect(declarations(lightBlock, name)).toEqual([token.value.light]);
      expect(declarations(darkBlock, name)).toEqual([token.value.dark]);
      expect(declarations(baseBlock, name)).toEqual([]);
    },
  );

  it.each(
    [...tokens.spacing.tokens, ...tokens.radius.tokens].map(
      (t) => [t.name, t.value] as const,
    ),
  )('size %s: one value, %s', (name, value) => {
    expect(declarations(css, name)).toEqual([value]);
  });

  it.each(tokens.shadow.tokens.map((t) => [t.name, t.value] as const))(
    'shadow %s: one value',
    (name, value) => {
      expect(declarations(css, name)).toEqual([value]);
    },
  );

  it.each(Object.entries(tokens.type.families))(
    'font family %s: one value',
    (key, stack) => {
      // Prettier writes CSS strings in single quotes, the export in double.
      const quotes = (value: string) => value.replaceAll("'", '"');
      expect(declarations(css, `font-${key}`).map(quotes)).toEqual([stack]);
    },
  );

  it.each(
    tokens.type.groups.flatMap((g) =>
      g.styles.map((s) => [s.name, s, g.family] as const),
    ),
  )(
    'type style %s: family, size, line height and weight',
    (name, style, family) => {
      expect(declarations(css, `type-${name}-family`)).toEqual([
        `var(--font-${family})`,
      ]);
      expect(declarations(css, `type-${name}-size`)).toEqual([style.fontSize]);
      expect(declarations(css, `type-${name}-line-height`)).toEqual([
        style.lineHeight,
      ]);
      expect(declarations(css, `type-${name}-weight`)).toEqual([
        String(style.fontWeight),
      ]);
    },
  );
});

// WCAG 2 contrast of the pairs the design system names in its usage notes.
const luminance = (hex: string): number => {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

const TEXT: [string, string[]][] = [
  ['ink', ['surface', 'surface-raised', 'surface-sunken', 'accent-soft']],
  ['ink-muted', ['surface', 'surface-raised', 'surface-sunken']],
  ['accent', ['surface', 'surface-raised', 'accent-soft']],
  ['on-accent', ['accent']],
  ['ok-fg', ['ok-bg', 'surface-raised']],
  ['warn-fg', ['warn-bg', 'surface-raised']],
  ['bad-fg', ['bad-bg', 'surface-raised']],
];
const MARKS: [string, string[]][] = [
  ['line-strong', ['surface', 'surface-raised', 'surface-sunken']],
  ['focus', ['surface', 'surface-raised', 'surface-sunken', 'accent-soft']],
  ['chart-acquisition', ['surface-raised']],
  ['chart-electricity', ['surface-raised']],
  ['chart-petrol', ['surface-raised']],
  ['chart-maintenance', ['surface-raised']],
];
const pairs = (list: [string, string[]][], min: number) =>
  list.flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg, min] as const));

describe.each([
  ['light', lightBlock],
  ['dark', darkBlock],
] as const)('Q10: WCAG AA contrast in the %s theme', (_theme, block) => {
  it.each([...pairs(TEXT, 4.5), ...pairs(MARKS, 3)])(
    '%s on %s reaches %s:1',
    (fg, bg, min) => {
      expect(
        contrast(colorOf(block, fg), colorOf(block, bg)),
      ).toBeGreaterThanOrEqual(min);
    },
  );
});
