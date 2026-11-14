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

type Block = { media: string | null; decls: [string, string][] };

/**
 * Splits theme.css into its rule blocks with a brace-depth scanner, so
 * formatting changes do not matter. Each block keeps its enclosing @media
 * condition (null outside of a media query) and its custom properties.
 */
const parseBlocks = (source: string): Block[] => {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: Block[] = [];
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') {
      stack.push(text.slice(start, i).trim());
      start = i + 1;
    } else if (ch === '}') {
      const body = text.slice(start, i);
      const selector = stack.pop() ?? '';
      if (!selector.startsWith('@')) {
        const media = stack.find((s) => s.startsWith('@media')) ?? null;
        const decls = [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
          (m) => [m[1] ?? '', (m[2] ?? '').trim()] as [string, string],
        );
        blocks.push({ media: media?.replace(/\s+/g, ' ') ?? null, decls });
      }
      start = i + 1;
    }
  }
  return blocks;
};

const blocks = parseBlocks(css);
const isDark = (b: Block) =>
  b.media?.replace(/\s/g, '') === '@media(prefers-color-scheme:dark)';
const lightDecls = blocks
  .filter((b) => b.media === null)
  .flatMap((b) => b.decls);
const darkDecls = blocks.filter(isDark).flatMap((b) => b.decls);
const otherDecls = blocks
  .filter((b) => b.media !== null && !isDark(b))
  .flatMap((b) => b.decls);

/** All values declared for a custom property in a list of declarations. */
const declarations = (decls: [string, string][], name: string): string[] =>
  decls.filter(([n]) => n === `--${name}`).map(([, v]) => v);

const colorOf = (decls: [string, string][], name: string): string => {
  const [value] = declarations(decls, name);
  if (!value) throw new Error(`--${name} is missing`);
  return value;
};

/** Every custom property the design system defines. */
const expectedNames = new Set([
  ...tokens.color.tokens.map((t) => `--${t.name}`),
  ...tokens.spacing.tokens.map((t) => `--${t.name}`),
  ...tokens.radius.tokens.map((t) => `--${t.name}`),
  ...tokens.shadow.tokens.map((t) => `--${t.name}`),
  ...Object.keys(tokens.type.families).map((k) => `--font-${k}`),
  ...tokens.type.groups.flatMap((g) =>
    g.styles.flatMap((s) =>
      ['family', 'size', 'line-height', 'weight'].map(
        (p) => `--type-${s.name}-${p}`,
      ),
    ),
  ),
]);
const darkNames = new Set(tokens.color.tokens.map((t) => `--${t.name}`));

describe('D4: theme.css has every token exactly once', () => {
  it('declares exactly the design system tokens outside of media queries', () => {
    const names = lightDecls.map(([n]) => n);
    expect(new Set(names)).toEqual(expectedNames);
    expect(names).toHaveLength(expectedNames.size);
  });

  it('redeclares only the colors in the dark media query', () => {
    const names = darkDecls.map(([n]) => n);
    expect(new Set(names)).toEqual(darkNames);
    expect(names).toHaveLength(darkNames.size);
  });

  it('has no other media query with tokens', () => {
    expect(otherDecls).toEqual([]);
  });

  it.each(tokens.color.tokens.map((t) => [t.name, t] as const))(
    'color %s: one light and one dark value, equal to the design system',
    (name, token) => {
      expect(declarations(lightDecls, name)).toEqual([token.value.light]);
      expect(declarations(darkDecls, name)).toEqual([token.value.dark]);
    },
  );

  it.each(
    [...tokens.spacing.tokens, ...tokens.radius.tokens].map(
      (t) => [t.name, t.value] as const,
    ),
  )('size %s: one value, %s', (name, value) => {
    expect(declarations(lightDecls, name)).toEqual([value]);
  });

  it.each(tokens.shadow.tokens.map((t) => [t.name, t.value] as const))(
    'shadow %s: one value',
    (name, value) => {
      expect(declarations(lightDecls, name)).toEqual([value]);
    },
  );

  it.each(Object.entries(tokens.type.families))(
    'font family %s: one value',
    (key, stack) => {
      // Prettier writes CSS strings in single quotes, the export in double.
      const quotes = (value: string) => value.replaceAll("'", '"');
      expect(declarations(lightDecls, `font-${key}`).map(quotes)).toEqual([
        stack,
      ]);
    },
  );

  it.each(
    tokens.type.groups.flatMap((g) =>
      g.styles.map((s) => [s.name, s, g.family] as const),
    ),
  )(
    'type style %s: family, size, line height and weight',
    (name, style, family) => {
      expect(declarations(lightDecls, `type-${name}-family`)).toEqual([
        `var(--font-${family})`,
      ]);
      expect(declarations(lightDecls, `type-${name}-size`)).toEqual([
        style.fontSize,
      ]);
      expect(declarations(lightDecls, `type-${name}-line-height`)).toEqual([
        style.lineHeight,
      ]);
      expect(declarations(lightDecls, `type-${name}-weight`)).toEqual([
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
  ['light', lightDecls],
  ['dark', darkDecls],
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
