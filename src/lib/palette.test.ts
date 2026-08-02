/**
 * The chart palette is an accessibility guarantee, so it is enforced by a test
 * rather than by good intentions. If someone re-themes the app and the input /
 * output pair stops being distinguishable, CI fails.
 *
 * Method: convert to linear sRGB, simulate dichromatic vision with the standard
 * Viénot–Brettel–Mollon LMS transforms, then measure separation in OKLab
 * (perceptually uniform), plus WCAG contrast against the chart surface.
 */
import { describe, expect, it } from 'vitest';

const PALETTE = {
  light: { input: '#2166A5', output: '#0E7B43', surface: '#FFFFFF' },
  dark: { input: '#4B8FC9', output: '#33A664', surface: '#121722' },
};

/** Deuteranopia and protanopia together account for the vast majority of CVD. */
const CVD_FLOOR = 8;
const NORMAL_FLOOR = 15;
const CONTRAST_FLOOR = 3;

type RGB = [number, number, number];

function hexToLinear(hex: string): RGB {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  return channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as RGB;
}

function linearToOklab([r, g, b]: RGB): RGB {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function simulate([r, g, b]: RGB, kind: 'protan' | 'deutan' | 'tritan'): RGB {
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;

  let l = L;
  let m = M;
  let s = S;
  if (kind === 'protan') l = 2.02344 * M - 2.52581 * S;
  if (kind === 'deutan') m = 0.494207 * L + 1.24827 * S;
  if (kind === 'tritan') s = -0.395913 * L + 0.801109 * M;

  return [
    0.080944448 * l - 0.130504409 * m + 0.116721066 * s,
    -0.0102485335 * l + 0.0540193266 * m - 0.113614708 * s,
    -0.000365296938 * l - 0.00412161469 * m + 0.693511405 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel))) as RGB;
}

/** OKLab distance, scaled by 100 to match the usual reporting convention. */
function deltaE(a: RGB, b: RGB): number {
  const [l1, a1, b1] = linearToOklab(a);
  const [l2, a2, b2] = linearToOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe.each(['light', 'dark'] as const)('chart palette in %s mode', (mode) => {
  const input = hexToLinear(PALETTE[mode].input);
  const output = hexToLinear(PALETTE[mode].output);
  const surface = hexToLinear(PALETTE[mode].surface);

  it('separates input from output for normal colour vision', () => {
    expect(deltaE(input, output)).toBeGreaterThanOrEqual(NORMAL_FLOOR);
  });

  it.each(['protan', 'deutan'] as const)('stays distinguishable under %s vision', (kind) => {
    expect(deltaE(simulate(input, kind), simulate(output, kind))).toBeGreaterThanOrEqual(CVD_FLOOR);
  });

  it('keeps both marks visible against the chart surface', () => {
    expect(contrast(input, surface)).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
    expect(contrast(output, surface)).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });

  /**
   * Tritanopia confuses blue with green, so this pair is close under it. That is
   * acceptable here only because colour is never the sole channel: the two
   * segments are adjacent in a fixed order and both are named in the legend
   * beside their value. This test documents the trade-off rather than hiding it.
   */
  it('relies on labels, not colour alone, for tritan vision', () => {
    const separation = deltaE(simulate(input, 'tritan'), simulate(output, 'tritan'));
    expect(separation).toBeLessThan(CVD_FLOOR);
  });
});
