/**
 * A small, dependency-free 2D rasterizer: TrueType text, filled shapes, PNG out.
 *
 * It exists so the build can draw a share image for every model, provider and
 * comparison page without a native image library or a browser. The usual
 * routes each cost something this build will not pay: `sharp`, `canvas` and
 * `@resvg/resvg-js` ship platform binaries (megabytes per OS, and a postinstall
 * that the reviewed-install step in CI refuses), and a headless browser makes
 * the deploy depend on one being installed and on it not hanging. Social sites
 * do not accept SVG for `og:image`, so a PNG has to be produced somewhere.
 *
 * What it does, and no more:
 *
 * - reads the site's own WOFF faces (the `@fontsource` files, TrueType outlines
 *   inside zlib-compressed tables) and their GPOS pair kerning;
 * - fills paths with exact-area antialiasing, the accumulation method used by
 *   font-rs: every edge adds its signed area to the cells it crosses, and a
 *   running sum along each row gives the coverage of every pixel;
 * - writes an 8-bit RGB PNG with `node:zlib`.
 *
 * Deterministic by construction: no clock, no randomness, no system fonts, so
 * the same input draws the same pixels on any machine.
 */
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

export type Rgb = readonly [number, number, number];

/** A point in pixel space; `on` is false for a quadratic control point. */
interface OutlinePoint {
  x: number;
  y: number;
  on: boolean;
}

/** One closed contour, already flattened to straight segments, in pixels. */
export type Polygon = { x: number; y: number }[];

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

interface GlyphOutline {
  /** Font units, y up. */
  contours: OutlinePoint[][];
}

export class Font {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  private readonly tables = new Map<string, DataView>();
  private readonly cmap = new Map<number, number>();
  private readonly advances: number[] = [];
  private readonly locaOffsets: number[] = [];
  private readonly kerning = new Map<number, Map<number, number>>();
  private readonly classKerning: {
    coverage: Map<number, number>;
    class1: Map<number, number>;
    class2: Map<number, number>;
    values: Int16Array;
    class2Count: number;
  }[] = [];
  private readonly outlines = new Map<number, GlyphOutline>();

  constructor(bytes: Uint8Array) {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const signature = data.getUint32(0);
    if (signature === 0x774f4646) this.readWoff(bytes, data);
    else if (signature === 0x00010000 || signature === 0x74727565) this.readSfnt(data);
    else throw new Error('unsupported font: expected WOFF or TrueType');

    const head = this.table('head');
    this.unitsPerEm = head.getUint16(18);
    const indexToLocFormat = head.getInt16(50);
    const hhea = this.table('hhea');
    this.ascender = hhea.getInt16(4);
    this.descender = hhea.getInt16(6);
    const numberOfHMetrics = hhea.getUint16(34);
    const numGlyphs = this.table('maxp').getUint16(4);

    const hmtx = this.table('hmtx');
    for (let gid = 0; gid < numGlyphs; gid++) {
      const index = Math.min(gid, numberOfHMetrics - 1);
      this.advances.push(hmtx.getUint16(index * 4));
    }
    const loca = this.table('loca');
    for (let gid = 0; gid <= numGlyphs; gid++) {
      this.locaOffsets.push(indexToLocFormat === 0 ? loca.getUint16(gid * 2) * 2 : loca.getUint32(gid * 4));
    }
    this.readCmap();
    if (this.tables.has('GPOS')) this.readKerning();
  }

  static load(path: string): Font {
    return new Font(readFileSync(path));
  }

  private table(tag: string): DataView {
    const found = this.tables.get(tag);
    if (!found) throw new Error(`font has no ${tag} table`);
    return found;
  }

  private readWoff(bytes: Uint8Array, data: DataView): void {
    const count = data.getUint16(12);
    for (let i = 0; i < count; i++) {
      const entry = 44 + i * 20;
      const tag = String.fromCharCode(
        data.getUint8(entry),
        data.getUint8(entry + 1),
        data.getUint8(entry + 2),
        data.getUint8(entry + 3),
      );
      const offset = data.getUint32(entry + 4);
      const compressed = data.getUint32(entry + 8);
      const original = data.getUint32(entry + 12);
      const slice = bytes.subarray(offset, offset + compressed);
      const table = compressed < original ? new Uint8Array(inflateSync(slice)) : slice;
      this.tables.set(tag, new DataView(table.buffer, table.byteOffset, table.byteLength));
    }
  }

  private readSfnt(data: DataView): void {
    const count = data.getUint16(4);
    for (let i = 0; i < count; i++) {
      const entry = 12 + i * 16;
      const tag = String.fromCharCode(
        data.getUint8(entry),
        data.getUint8(entry + 1),
        data.getUint8(entry + 2),
        data.getUint8(entry + 3),
      );
      const offset = data.getUint32(entry + 8);
      const length = data.getUint32(entry + 12);
      this.tables.set(tag, new DataView(data.buffer, data.byteOffset + offset, length));
    }
  }

  /** Unicode to glyph id, from the Windows Unicode subtable (format 4 or 12). */
  private readCmap(): void {
    const cmap = this.table('cmap');
    const count = cmap.getUint16(2);
    let best = -1;
    let bestFormat = 0;
    for (let i = 0; i < count; i++) {
      const platform = cmap.getUint16(4 + i * 8);
      const encoding = cmap.getUint16(6 + i * 8);
      const offset = cmap.getUint32(8 + i * 8);
      const format = cmap.getUint16(offset);
      const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
      if (unicode && (format === 12 || (format === 4 && bestFormat !== 12))) {
        best = offset;
        bestFormat = format;
      }
    }
    if (best < 0) throw new Error('font has no Unicode cmap');
    if (bestFormat === 12) {
      const groups = cmap.getUint32(best + 12);
      for (let g = 0; g < groups; g++) {
        const at = best + 16 + g * 12;
        const start = cmap.getUint32(at);
        const end = cmap.getUint32(at + 4);
        const glyph = cmap.getUint32(at + 8);
        for (let code = start; code <= end; code++) this.cmap.set(code, glyph + code - start);
      }
      return;
    }
    const segments = cmap.getUint16(best + 6) / 2;
    const ends = best + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const rangeOffsets = deltas + segments * 2;
    for (let s = 0; s < segments; s++) {
      const end = cmap.getUint16(ends + s * 2);
      const start = cmap.getUint16(starts + s * 2);
      const delta = cmap.getInt16(deltas + s * 2);
      const rangeOffset = cmap.getUint16(rangeOffsets + s * 2);
      for (let code = start; code <= end && code !== 0xffff; code++) {
        let glyph: number;
        if (rangeOffset === 0) glyph = (code + delta) & 0xffff;
        else {
          const at = rangeOffsets + s * 2 + rangeOffset + (code - start) * 2;
          glyph = cmap.getUint16(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) this.cmap.set(code, glyph);
      }
    }
  }

  /**
   * Pair kerning from GPOS: every lookup of type 2 (or type 9 wrapping it) that
   * the `kern` feature names. Only the first glyph's x-advance is read, which is
   * all horizontal Latin kerning uses.
   */
  private readKerning(): void {
    const gpos = this.table('GPOS');
    const featureList = gpos.getUint16(6);
    const lookupList = gpos.getUint16(8);
    const lookups = new Set<number>();
    const features = gpos.getUint16(featureList);
    for (let f = 0; f < features; f++) {
      const record = featureList + 2 + f * 6;
      const tag = String.fromCharCode(
        gpos.getUint8(record),
        gpos.getUint8(record + 1),
        gpos.getUint8(record + 2),
        gpos.getUint8(record + 3),
      );
      if (tag !== 'kern') continue;
      const feature = featureList + gpos.getUint16(record + 4);
      const indices = gpos.getUint16(feature + 2);
      for (let l = 0; l < indices; l++) lookups.add(gpos.getUint16(feature + 4 + l * 2));
    }
    for (const index of [...lookups].sort((a, b) => a - b)) {
      const lookup = lookupList + gpos.getUint16(lookupList + 2 + index * 2);
      const type = gpos.getUint16(lookup);
      const subtables = gpos.getUint16(lookup + 4);
      for (let s = 0; s < subtables; s++) {
        let subtable = lookup + gpos.getUint16(lookup + 6 + s * 2);
        let subtype = type;
        if (type === 9) {
          subtype = gpos.getUint16(subtable + 2);
          subtable += gpos.getUint32(subtable + 4);
        }
        if (subtype === 2) this.readPairPos(gpos, subtable);
      }
    }
  }

  private readPairPos(gpos: DataView, at: number): void {
    const format = gpos.getUint16(at);
    const coverage = readCoverage(gpos, at + gpos.getUint16(at + 2));
    const format1 = gpos.getUint16(at + 4);
    const format2 = gpos.getUint16(at + 6);
    const size1 = valueRecordSize(format1);
    const size2 = valueRecordSize(format2);
    // Bytes before XAdvance inside a value record: XPlacement and YPlacement.
    const xAdvanceAt = (format1 & 1 ? 2 : 0) + (format1 & 2 ? 2 : 0);
    const hasXAdvance = (format1 & 4) !== 0;
    if (!hasXAdvance) return;
    if (format === 1) {
      const sets = gpos.getUint16(at + 8);
      for (const [glyph, coverageIndex] of coverage) {
        if (coverageIndex >= sets) continue;
        const set = at + gpos.getUint16(at + 10 + coverageIndex * 2);
        const pairs = gpos.getUint16(set);
        let row = this.kerning.get(glyph);
        if (!row) this.kerning.set(glyph, (row = new Map()));
        for (let p = 0; p < pairs; p++) {
          const pair = set + 2 + p * (2 + size1 + size2);
          const second = gpos.getUint16(pair);
          const value = gpos.getInt16(pair + 2 + xAdvanceAt);
          // An earlier lookup wins, as in a shaping engine.
          if (!row.has(second)) row.set(second, value);
        }
      }
    } else if (format === 2) {
      const class1 = readClassDef(gpos, at + gpos.getUint16(at + 8));
      const class2 = readClassDef(gpos, at + gpos.getUint16(at + 10));
      const class1Count = gpos.getUint16(at + 12);
      const class2Count = gpos.getUint16(at + 14);
      const values = new Int16Array(class1Count * class2Count);
      for (let c1 = 0; c1 < class1Count; c1++) {
        for (let c2 = 0; c2 < class2Count; c2++) {
          const record = at + 16 + (c1 * class2Count + c2) * (size1 + size2);
          values[c1 * class2Count + c2] = gpos.getInt16(record + xAdvanceAt);
        }
      }
      this.classKerning.push({ coverage, class1, class2, values, class2Count });
    }
  }

  glyphId(codePoint: number): number {
    return this.cmap.get(codePoint) ?? 0;
  }

  hasGlyph(codePoint: number): boolean {
    return this.cmap.has(codePoint);
  }

  advance(glyph: number): number {
    return this.advances[glyph] ?? 0;
  }

  kern(left: number, right: number): number {
    const pair = this.kerning.get(left)?.get(right);
    if (pair !== undefined) return pair;
    for (const table of this.classKerning) {
      if (!table.coverage.has(left)) continue;
      const c1 = table.class1.get(left) ?? 0;
      const c2 = table.class2.get(right) ?? 0;
      return table.values[c1 * table.class2Count + c2] ?? 0;
    }
    return 0;
  }

  outline(glyph: number): GlyphOutline {
    const cached = this.outlines.get(glyph);
    if (cached) return cached;
    const outline = this.readGlyph(glyph, 0);
    this.outlines.set(glyph, outline);
    return outline;
  }

  private readGlyph(glyph: number, depth: number): GlyphOutline {
    const glyf = this.table('glyf');
    const start = this.locaOffsets[glyph] ?? 0;
    const end = this.locaOffsets[glyph + 1] ?? start;
    if (end <= start || depth > 8) return { contours: [] };
    const contourCount = glyf.getInt16(start);
    if (contourCount < 0) return this.readComposite(glyf, start + 10, depth);

    const endPoints: number[] = [];
    for (let c = 0; c < contourCount; c++) endPoints.push(glyf.getUint16(start + 10 + c * 2));
    const pointCount = (endPoints.at(-1) ?? -1) + 1;
    let at = start + 10 + contourCount * 2;
    at += 2 + glyf.getUint16(at); // instructions
    const flags: number[] = [];
    while (flags.length < pointCount) {
      const flag = glyf.getUint8(at++);
      flags.push(flag);
      if (flag & 8) {
        let repeat = glyf.getUint8(at++);
        while (repeat-- > 0) flags.push(flag);
      }
    }
    const xs: number[] = [];
    let x = 0;
    for (const flag of flags) {
      if (flag & 2) {
        const dx = glyf.getUint8(at++);
        x += flag & 16 ? dx : -dx;
      } else if (!(flag & 16)) {
        x += glyf.getInt16(at);
        at += 2;
      }
      xs.push(x);
    }
    const ys: number[] = [];
    let y = 0;
    for (const flag of flags) {
      if (flag & 4) {
        const dy = glyf.getUint8(at++);
        y += flag & 32 ? dy : -dy;
      } else if (!(flag & 32)) {
        y += glyf.getInt16(at);
        at += 2;
      }
      ys.push(y);
    }
    const contours: OutlinePoint[][] = [];
    let first = 0;
    for (const last of endPoints) {
      const contour: OutlinePoint[] = [];
      for (let p = first; p <= last; p++) contour.push({ x: xs[p]!, y: ys[p]!, on: (flags[p]! & 1) !== 0 });
      if (contour.length > 0) contours.push(contour);
      first = last + 1;
    }
    return { contours };
  }

  private readComposite(glyf: DataView, at: number, depth: number): GlyphOutline {
    const contours: OutlinePoint[][] = [];
    let more = true;
    while (more) {
      const flags = glyf.getUint16(at);
      const component = glyf.getUint16(at + 2);
      at += 4;
      let dx: number;
      let dy: number;
      if (flags & 1) {
        dx = glyf.getInt16(at);
        dy = glyf.getInt16(at + 2);
        at += 4;
      } else {
        dx = glyf.getInt8(at);
        dy = glyf.getInt8(at + 1);
        at += 2;
      }
      let [a, b, c, d] = [1, 0, 0, 1];
      const f2dot14 = (offset: number): number => glyf.getInt16(offset) / 16384;
      if (flags & 8) {
        a = d = f2dot14(at);
        at += 2;
      } else if (flags & 0x40) {
        a = f2dot14(at);
        d = f2dot14(at + 2);
        at += 4;
      } else if (flags & 0x80) {
        a = f2dot14(at);
        b = f2dot14(at + 2);
        c = f2dot14(at + 4);
        d = f2dot14(at + 6);
        at += 8;
      }
      // Point-matched anchoring (ARGS_ARE_XY_VALUES unset) is not used by these
      // faces; treat the arguments as an offset either way.
      for (const contour of this.readGlyph(component, depth + 1).contours) {
        contours.push(
          contour.map((p) => ({ x: a * p.x + c * p.y + dx, y: b * p.x + d * p.y + dy, on: p.on })),
        );
      }
      more = (flags & 0x20) !== 0;
    }
    return { contours };
  }
}

function valueRecordSize(format: number): number {
  let size = 0;
  for (let bit = format; bit > 0; bit >>= 1) if (bit & 1) size += 2;
  return size;
}

function readCoverage(view: DataView, at: number): Map<number, number> {
  const coverage = new Map<number, number>();
  const format = view.getUint16(at);
  const count = view.getUint16(at + 2);
  if (format === 1) {
    for (let i = 0; i < count; i++) coverage.set(view.getUint16(at + 4 + i * 2), i);
  } else {
    for (let r = 0; r < count; r++) {
      const record = at + 4 + r * 6;
      const start = view.getUint16(record);
      const end = view.getUint16(record + 2);
      const index = view.getUint16(record + 4);
      for (let g = start; g <= end; g++) coverage.set(g, index + g - start);
    }
  }
  return coverage;
}

function readClassDef(view: DataView, at: number): Map<number, number> {
  const classes = new Map<number, number>();
  const format = view.getUint16(at);
  if (format === 1) {
    const start = view.getUint16(at + 2);
    const count = view.getUint16(at + 4);
    for (let i = 0; i < count; i++) classes.set(start + i, view.getUint16(at + 6 + i * 2));
  } else {
    const count = view.getUint16(at + 2);
    for (let r = 0; r < count; r++) {
      const record = at + 4 + r * 6;
      const start = view.getUint16(record);
      const end = view.getUint16(record + 2);
      const value = view.getUint16(record + 4);
      for (let g = start; g <= end; g++) classes.set(g, value);
    }
  }
  return classes;
}

/** Width of a string, in pixels, at a font size in pixels. */
export function measureText(font: Font, size: number, text: string): number {
  const scale = size / font.unitsPerEm;
  let width = 0;
  let previous = -1;
  for (const char of text) {
    const glyph = font.glyphId(char.codePointAt(0)!);
    if (previous >= 0) width += font.kern(previous, glyph);
    width += font.advance(glyph);
    previous = glyph;
  }
  return width * scale;
}

/** Quadratic outline to straight segments, in pixel space. */
function flattenContour(
  points: OutlinePoint[],
  transform: (x: number, y: number) => [number, number],
): Polygon {
  const n = points.length;
  // Start from an on-curve point; if there is none, from the midpoint of the
  // first two control points, which TrueType defines as on the curve.
  const startIndex = points.findIndex((p) => p.on);
  let start: OutlinePoint;
  let rest: OutlinePoint[];
  if (startIndex < 0) {
    start = { x: (points[0]!.x + points[1 % n]!.x) / 2, y: (points[0]!.y + points[1 % n]!.y) / 2, on: true };
    rest = [...points.slice(1), points[0]!];
  } else {
    start = points[startIndex]!;
    rest = [...points.slice(startIndex + 1), ...points.slice(0, startIndex)];
  }
  const out: Polygon = [];
  const emit = (x: number, y: number): void => {
    const [px, py] = transform(x, y);
    out.push({ x: px, y: py });
  };
  emit(start.x, start.y);
  let current = start;
  let control: OutlinePoint | null = null;
  const curveTo = (from: OutlinePoint, ctrl: OutlinePoint, to: OutlinePoint): void => {
    const [ax, ay] = transform(from.x, from.y);
    const [bx, by] = transform(ctrl.x, ctrl.y);
    const [cx, cy] = transform(to.x, to.y);
    const length = Math.hypot(bx - ax, by - ay) + Math.hypot(cx - bx, cy - by);
    const steps = Math.max(2, Math.min(24, Math.ceil(length / 3)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push({ x: u * u * ax + 2 * u * t * bx + t * t * cx, y: u * u * ay + 2 * u * t * by + t * t * cy });
    }
  };
  for (const target of [...rest, start]) {
    if (target.on) {
      if (control) curveTo(current, control, target);
      else emit(target.x, target.y);
      current = target;
      control = null;
    } else if (control) {
      const mid = { x: (control.x + target.x) / 2, y: (control.y + target.y) / 2, on: true };
      curveTo(current, control, mid);
      current = mid;
      control = target;
    } else control = target;
  }
  if (control) curveTo(current, control, start);
  return out;
}

/** The outlines of a line of text, as polygons, with the baseline at `y`. */
export function textPolygons(font: Font, size: number, x: number, y: number, text: string): Polygon[] {
  const scale = size / font.unitsPerEm;
  const polygons: Polygon[] = [];
  let pen = 0;
  let previous = -1;
  for (const char of text) {
    const glyph = font.glyphId(char.codePointAt(0)!);
    if (previous >= 0) pen += font.kern(previous, glyph);
    const origin = pen;
    const transform = (gx: number, gy: number): [number, number] => [
      x + (origin + gx) * scale,
      y - gy * scale,
    ];
    for (const contour of font.outline(glyph).contours) polygons.push(flattenContour(contour, transform));
    pen += font.advance(glyph);
    previous = glyph;
  }
  return polygons;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** A rounded rectangle, clockwise on screen. `reverse` winds it the other way, to cut a hole. */
export function roundedRect(x: number, y: number, w: number, h: number, r: number, reverse = false): Polygon {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  const points: Polygon = [];
  const corner = (cx: number, cy: number, from: number): void => {
    const steps = Math.max(4, Math.ceil(radius / 2));
    for (let s = 0; s <= steps; s++) {
      const angle = from + (s / steps) * (Math.PI / 2);
      points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
  };
  corner(x + w - radius, y + radius, -Math.PI / 2);
  corner(x + w - radius, y + h - radius, 0);
  corner(x + radius, y + h - radius, Math.PI / 2);
  corner(x + radius, y + radius, Math.PI);
  return reverse ? points.reverse() : points;
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export class Canvas {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    background: Rgb,
  ) {
    this.pixels = new Uint8Array(width * height * 3);
    const [r, g, b] = background;
    if (r === 0 && g === 0 && b === 0) return;
    for (let i = 0; i < width * 3; i += 3) {
      this.pixels[i] = r;
      this.pixels[i + 1] = g;
      this.pixels[i + 2] = b;
    }
    for (let row = 1; row < height; row++) this.pixels.copyWithin(row * width * 3, 0, width * 3);
  }

  clone(): Canvas {
    const copy = new Canvas(this.width, this.height, [0, 0, 0]);
    copy.pixels.set(this.pixels);
    return copy;
  }

  /**
   * Fill polygons with the nonzero rule, antialiased by exact area coverage.
   *
   * The accumulation buffer covers only the shapes' bounding box, so a line of
   * text costs a few thousand cells rather than the whole card.
   */
  fill(polygons: readonly Polygon[], color: Rgb): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const polygon of polygons) {
      for (const p of polygon) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!Number.isFinite(minX)) return;
    const left = Math.max(0, Math.floor(minX));
    const top = Math.max(0, Math.floor(minY));
    const right = Math.min(this.width, Math.ceil(maxX) + 1);
    const bottom = Math.min(this.height, Math.ceil(maxY) + 1);
    const w = right - left;
    const h = bottom - top;
    if (w <= 0 || h <= 0) return;
    const stride = w + 2;
    const acc = new Float32Array(stride * h + 2);

    for (const polygon of polygons) {
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        accumulateLine(acc, stride, h, w, a.x - left, a.y - top, b.x - left, b.y - top);
      }
    }

    const [r, g, bl] = color;
    for (let row = 0; row < h; row++) {
      let sum = 0;
      const base = row * stride;
      for (let col = 0; col < stride; col++) {
        sum += acc[base + col]!;
        if (col >= w) continue;
        const coverage = Math.min(1, Math.abs(sum));
        if (coverage < 1 / 512) continue;
        const at = ((top + row) * this.width + left + col) * 3;
        const px = this.pixels;
        px[at] = Math.round(px[at]! + (r - px[at]!) * coverage);
        px[at + 1] = Math.round(px[at + 1]! + (g - px[at + 1]!) * coverage);
        px[at + 2] = Math.round(px[at + 2]! + (bl - px[at + 2]!) * coverage);
      }
    }
  }

  /** A line of text with its baseline at `y`; returns the advance in pixels. */
  text(font: Font, size: number, x: number, y: number, value: string, color: Rgb): number {
    this.fill(textPolygons(font, size, x, y, value), color);
    return measureText(font, size, value);
  }

  png(): Buffer {
    return encodePng(this.width, this.height, this.pixels);
  }
}

/**
 * Add one edge's signed area to the accumulation buffer (font-rs). Every row
 * the edge crosses gets the area to the right of the edge split between the
 * cells it passes through; a running sum along the row then yields coverage.
 */
function accumulateLine(
  acc: Float32Array,
  stride: number,
  height: number,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  if (y0 === y1) return;
  let dir = 1;
  if (y0 > y1) {
    dir = -1;
    [x0, x1] = [x1, x0];
    [y0, y1] = [y1, y0];
  }
  const clampX = (v: number): number => Math.max(0, Math.min(width, v));
  const dxdy = (x1 - x0) / (y1 - y0);
  let x = x0;
  if (y0 < 0) {
    x -= y0 * dxdy;
    y0 = 0;
  }
  const yEnd = Math.min(y1, height);
  for (let y = Math.floor(y0); y < yEnd; y++) {
    const line = y * stride;
    const dy = Math.min(y + 1, yEnd) - Math.max(y, y0);
    const xNext = x + dxdy * dy;
    const d = dy * dir;
    const xa = clampX(Math.min(x, xNext));
    const xb = clampX(Math.max(x, xNext));
    const xaFloor = Math.floor(xa);
    const xaInt = xaFloor;
    const xbCeil = Math.ceil(xb);
    const xbInt = xbCeil;
    if (xbInt <= xaInt + 1) {
      const xmf = 0.5 * (xa + xb) - xaFloor;
      acc[line + xaInt] = acc[line + xaInt]! + d - d * xmf;
      acc[line + xaInt + 1] = acc[line + xaInt + 1]! + d * xmf;
    } else {
      const s = 1 / (xb - xa);
      const xaF = xa - xaFloor;
      const a0 = 0.5 * s * (1 - xaF) * (1 - xaF);
      const xbF = xb - xbCeil + 1;
      const am = 0.5 * s * xbF * xbF;
      acc[line + xaInt] = acc[line + xaInt]! + d * a0;
      if (xbInt === xaInt + 2) {
        acc[line + xaInt + 1] = acc[line + xaInt + 1]! + d * (1 - a0 - am);
      } else {
        const a1 = s * (1.5 - xaF);
        acc[line + xaInt + 1] = acc[line + xaInt + 1]! + d * (a1 - a0);
        for (let xi = xaInt + 2; xi < xbInt - 1; xi++) acc[line + xi] = acc[line + xi]! + d * s;
        const a2 = a1 + (xbInt - xaInt - 3) * s;
        acc[line + xbInt - 1] = acc[line + xbInt - 1]! + d * (1 - a2 - am);
      }
      acc[line + xbInt] = acc[line + xbInt]! + d * am;
    }
    x = xNext;
  }
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * An 8-bit RGB PNG. Every row uses the Sub filter: a card is mostly flat color,
 * and a run of identical pixels becomes a run of zeros, which deflate shrinks to
 * almost nothing.
 */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const rowBytes = width * 3;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const out = y * (rowBytes + 1);
    const src = y * rowBytes;
    raw[out] = 1; // Sub
    for (let i = 0; i < rowBytes; i++) {
      const left = i >= 3 ? rgb[src + i - 3]! : 0;
      raw[out + 1 + i] = (rgb[src + i]! - left) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
