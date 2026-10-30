import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { Canvas, Font, measureText, roundedRect } from './raster';

const require = createRequire(import.meta.url);
const display = Font.load(
  require.resolve('@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff'),
);
const mono = Font.load(
  require.resolve('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'),
);

/** Decode the encoder's own output: one IDAT, Sub filter on every row. */
function decode(png: Buffer): { width: number; height: number; rgb: Uint8Array } {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idatLength = png.readUInt32BE(33);
  expect(png.toString('latin1', 37, 41)).toBe('IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width * 3; i++) {
      const left = i >= 3 ? rgb[y * width * 3 + i - 3]! : 0;
      rgb[y * width * 3 + i] = (raw[y * (width * 3 + 1) + 1 + i]! + left) & 0xff;
    }
  }
  return { width, height, rgb };
}

describe('the rasterizer', () => {
  it('fills a pixel-aligned square exactly, with no bleed', () => {
    const canvas = new Canvas(6, 6, [255, 255, 255]);
    canvas.fill([roundedRect(2, 2, 2, 2, 0)], [0, 0, 0]);
    const at = (x: number, y: number): number => canvas.pixels[(y * 6 + x) * 3]!;
    expect([at(2, 2), at(3, 3)]).toEqual([0, 0]);
    expect([at(1, 2), at(4, 2), at(2, 1), at(2, 4)]).toEqual([255, 255, 255, 255]);
  });

  it('antialiases a half-covered pixel to half', () => {
    const canvas = new Canvas(4, 1, [255, 255, 255]);
    canvas.fill([roundedRect(0.5, 0, 2, 1, 0)], [0, 0, 0]);
    expect([...canvas.pixels.filter((_, i) => i % 3 === 0)]).toEqual([128, 0, 128, 255]);
  });

  it('cuts a hole where a reversed contour sits inside another', () => {
    const canvas = new Canvas(10, 10, [255, 255, 255]);
    canvas.fill([roundedRect(1, 1, 8, 8, 0), roundedRect(3, 3, 4, 4, 0, true)], [0, 0, 0]);
    expect(canvas.pixels[(5 * 10 + 5) * 3]).toBe(255);
    expect(canvas.pixels[(2 * 10 + 2) * 3]).toBe(0);
  });

  it('writes a PNG that decodes back to the same pixels', () => {
    const canvas = new Canvas(5, 3, [10, 20, 30]);
    canvas.fill([roundedRect(1, 0, 2, 3, 0)], [200, 100, 50]);
    const decoded = decode(canvas.png());
    expect(decoded.width).toBe(5);
    expect(decoded.height).toBe(3);
    expect([...decoded.rgb]).toEqual([...canvas.pixels]);
  });
});

describe('fonts', () => {
  it('reads the site’s WOFF faces and measures with their advances', () => {
    // JetBrains Mono: every glyph advances 600 units of 1000.
    expect(mono.unitsPerEm).toBe(1000);
    expect(measureText(mono, 10, '$1,087/mo')).toBeCloseTo(9 * 6, 5);
  });

  it('applies the face’s pair kerning', () => {
    const glyph = (char: string): number => display.glyphId(char.codePointAt(0)!);
    const kerned = measureText(display, 100, 'To');
    const apart = measureText(display, 100, 'T') + measureText(display, 100, 'o');
    expect(display.kern(glyph('T'), glyph('o'))).toBeLessThan(0);
    expect(kerned).toBeLessThan(apart);
  });

  it('draws text as ink and leaves the space beside it untouched', () => {
    const canvas = new Canvas(120, 40, [255, 255, 255]);
    const advance = canvas.text(display, 30, 4, 30, 'Ab', [0, 0, 0]);
    expect(advance).toBeGreaterThan(20);
    const inked = canvas.pixels.filter((value) => value < 128).length;
    expect(inked).toBeGreaterThan(50);
    expect(canvas.pixels[(10 * 120 + 110) * 3]).toBe(255);
  });
});
