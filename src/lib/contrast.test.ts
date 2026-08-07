import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrast, checked against the real stylesheet.
 *
 * The theme × accent × canvas matrix has more combinations than anyone will
 * click through by hand, and the two that failed (emerald and teal on light)
 * failed quietly — the accent is used for links and small labels, so the cost
 * was borne entirely by people who could not read them. Reading the token file
 * rather than a copy of its values means a new accent cannot be added without
 * this test seeing it.
 */

const TOKENS = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

/** Every `--name: #hex;` inside the block whose selector matches. */
function tokensFor(selector: string): Record<string, string> {
  const start = TOKENS.indexOf(selector);
  if (start === -1) throw new Error(`selector not found in tokens.css: ${selector}`);
  const open = TOKENS.indexOf('{', start);
  const close = TOKENS.indexOf('}', open);
  const block = TOKENS.slice(open, close);
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[match[1]!] = match[2]!.toLowerCase();
  }
  return out;
}

const light = tokensFor("[data-theme='light'] {");
const dark = tokensFor("[data-theme='dark'] {");
const lightWarm = { ...light, ...tokensFor("[data-theme='light'][data-canvas='warm']") };
const darkWarm = { ...dark, ...tokensFor("[data-theme='dark'][data-canvas='warm']") };

/** Text-bearing surfaces an accent or money colour can land on. */
function surfaces(base: Record<string, string>): string[] {
  return [base.surface!, base['surface-2']!, base.bg!];
}

const ACCENTS = ['emerald', 'teal', 'violet'] as const;
const AA_NORMAL = 4.5;

describe('accent contrast across the whole theme matrix', () => {
  const combinations: { name: string; accent: string; on: string[] }[] = [
    { name: 'cobalt · light · cool', accent: light.accent!, on: surfaces(light) },
    { name: 'cobalt · light · warm', accent: lightWarm.accent!, on: surfaces(lightWarm) },
    { name: 'cobalt · dark · cool', accent: dark.accent!, on: surfaces(dark) },
    { name: 'cobalt · dark · warm', accent: darkWarm.accent!, on: surfaces(darkWarm) },
  ];

  for (const accent of ACCENTS) {
    combinations.push(
      {
        name: `${accent} · light · cool`,
        accent: tokensFor(`[data-theme='light'][data-accent='${accent}']`).accent!,
        on: surfaces(light),
      },
      {
        name: `${accent} · light · warm`,
        accent: tokensFor(`[data-theme='light'][data-accent='${accent}']`).accent!,
        on: surfaces(lightWarm),
      },
      {
        name: `${accent} · dark · cool`,
        accent: tokensFor(`[data-theme='dark'][data-accent='${accent}']`).accent!,
        on: surfaces(dark),
      },
      {
        name: `${accent} · dark · warm`,
        accent: tokensFor(`[data-theme='dark'][data-accent='${accent}']`).accent!,
        on: surfaces(darkWarm),
      },
    );
  }

  for (const { name, accent, on } of combinations) {
    it(`${name} clears AA for normal text on every surface`, () => {
      for (const surface of on) {
        expect(contrastRatio(accent, surface), `${accent} on ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });
  }
});

describe('money and status colours', () => {
  // These never change with branding, so they are checked once per theme.
  const semantic = ['save', 'cost', 'info', 'warn', 'muted', 'ink'] as const;

  for (const [themeName, theme] of [
    ['light', light],
    ['dark', dark],
    ['light warm', lightWarm],
    ['dark warm', darkWarm],
  ] as const) {
    for (const token of semantic) {
      it(`--${token} is readable on every ${themeName} surface`, () => {
        for (const surface of surfaces(theme)) {
          expect(contrastRatio(theme[token]!, surface), `--${token} on ${surface}`).toBeGreaterThanOrEqual(
            AA_NORMAL,
          );
        }
      });
    }
  }
});

describe('accent fills stay legible', () => {
  it('every accent-ink reads against its own accent', () => {
    const pairs: [string, string][] = [
      [light.accent!, light['accent-ink']!],
      [dark.accent!, dark['accent-ink']!],
    ];
    for (const accent of ACCENTS) {
      const lightBlock = tokensFor(`[data-theme='light'][data-accent='${accent}']`);
      const darkBlock = tokensFor(`[data-theme='dark'][data-accent='${accent}']`);
      pairs.push([lightBlock.accent!, lightBlock['accent-ink'] ?? light['accent-ink']!]);
      pairs.push([darkBlock.accent!, darkBlock['accent-ink'] ?? dark['accent-ink']!]);
    }
    for (const [background, ink] of pairs) {
      expect(contrastRatio(background, ink), `${ink} on ${background}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/**
 * The status chip on the results panel: semantic ink on its own soft fill.
 *
 * This pairing is not part of the accent matrix above — the money and status
 * colours are deliberately outside the accent system — so nothing was checking
 * it, and the first version of the chip shipped `opacity: 0.72` on its second
 * clause. That composited `--save` down to #4a9c71 on #e3f0e8: a ratio of
 * 2.84, caught by axe at 320 and 390 only after it was pushed. Softening
 * semantic text with opacity throws away the guarantee every token here is
 * validated for, so the rule is weight, never alpha — and this is the fast
 * check that says so before the browser suite has to.
 */
describe('status chip contrast', () => {
  /** `rgb(51 166 100 / 14%)` over an opaque base, as the browser composites it. */
  function flatten(value: string, over: string): string {
    const hex = value.trim().match(/^#([0-9a-fA-F]{6})$/);
    if (hex) return `#${hex[1]!.toLowerCase()}`;

    const rgba = value.trim().match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)%\s*\)$/);
    if (!rgba) throw new Error(`cannot parse colour: ${value}`);
    const alpha = Number(rgba[4]) / 100;
    const base = over.replace('#', '');
    const mixed = [1, 2, 3].map((i) => {
      const top = Number(rgba[i]);
      const bottom = parseInt(base.slice((i - 1) * 2, (i - 1) * 2 + 2), 16);
      return Math.round(top * alpha + bottom * (1 - alpha));
    });
    return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }

  /** Any `--name: <value>;`, translucent values included. */
  function rawTokens(selector: string): Record<string, string> {
    const start = TOKENS.indexOf(selector);
    const open = TOKENS.indexOf('{', start);
    const close = TOKENS.indexOf('}', open);
    const out: Record<string, string> = {};
    for (const match of TOKENS.slice(open, close).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      out[match[1]!] = match[2]!.trim();
    }
    return out;
  }

  const themes = [
    { name: 'light', tokens: rawTokens("[data-theme='light'] {"), resolved: light },
    { name: 'dark', tokens: rawTokens("[data-theme='dark'] {"), resolved: dark },
  ];

  for (const theme of themes) {
    for (const state of ['save', 'info', 'warn'] as const) {
      it(`${state} chip ink reads on its own fill in ${theme.name}`, () => {
        const ink = flatten(theme.tokens[state]!, theme.resolved.surface!);
        const fill = flatten(theme.tokens[`${state}-soft`]!, theme.resolved.surface!);
        expect(
          contrastRatio(fill, ink),
          `--${state} on --${state}-soft (${theme.name})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }

    it(`the unknown chip reads on every panel surface in ${theme.name}`, () => {
      // No fill of its own: it sits directly on whatever panel holds it.
      for (const surface of surfaces(theme.resolved)) {
        expect(
          contrastRatio(surface, theme.resolved.muted!),
          `--muted on ${surface} (${theme.name})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });
  }
});
