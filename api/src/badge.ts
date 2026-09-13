/**
 * Embeddable price badges: an SVG this Worker draws itself, and a shields.io
 * "endpoint" JSON so the same numbers can be rendered through shields' own
 * styles via `img.shields.io/endpoint?url=...`.
 *
 * No image library — the SVG is the classic shields "flat" template, hand
 * rolled, sized from an approximate character-width table rather than real
 * font metrics. That is what shields itself does; pixel-perfect kerning is
 * not the point, a badge that never fails to render is.
 */

import type { PriceRow } from './catalog';

export interface BadgeContent {
  label: string;
  message: string;
  color: string;
}

/** Unknown model: a legible fallback, never a 404 — a broken image in someone
 *  else's README is how a badge gets removed rather than fixed. */
const UNKNOWN: BadgeContent = { label: 'promptspend', message: 'model not found', color: 'lightgrey' };

function formatRate(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
}

/** The badge for one model, or the fallback when the id is not in the catalog. */
export function badgeContent(row: PriceRow | undefined): BadgeContent {
  if (!row) return UNKNOWN;
  return {
    label: row.id,
    message: `$${formatRate(row.input)}/$${formatRate(row.output)} per 1M · ${row.lastVerified}`,
    color: row.status === 'deprecated' ? 'red' : row.status === 'legacy' ? 'orange' : 'brightgreen',
  };
}

const NAMED_COLORS: Record<string, string> = {
  brightgreen: '#4c1',
  green: '#97ca00',
  orange: '#fe7d37',
  red: '#e05d44',
  lightgrey: '#9f9f9f',
  blue: '#2456e6',
};

/** shields.io badge colors are either a name from its fixed palette or a raw hex/CSS color. */
function resolveColor(color: string): string {
  return NAMED_COLORS[color] ?? color;
}

// Approximate Verdana-11px advance widths by character class — the same trick
// shields.io itself uses rather than shipping font metrics into a Worker.
const NARROW = new Set("iIl.,:;'|!" + ' ');
const WIDE = new Set('mMW@%');
function charWidth(ch: string): number {
  if (NARROW.has(ch)) return 4;
  if (WIDE.has(ch)) return 11;
  if (ch >= 'A' && ch <= 'Z') return 8;
  return 7;
}
function textWidth(s: string): number {
  let width = 0;
  for (const ch of s) width += charWidth(ch);
  return width;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PAD = 10;
const HEIGHT = 20;

/** A flat, shields-style SVG badge: dark label segment, colored message segment. */
export function renderBadgeSvg({ label, message, color }: BadgeContent): string {
  const rightColor = resolveColor(color);
  const labelWidth = textWidth(label) + PAD * 2;
  const messageWidth = textWidth(message) + PAD * 2;
  const totalWidth = labelWidth + messageWidth;
  const labelX = labelWidth / 2;
  const messageX = labelWidth + messageWidth / 2;
  const safeLabel = escapeXml(label);
  const safeMessage = escapeXml(message);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${HEIGHT}" role="img" aria-label="${safeLabel}: ${safeMessage}">
  <title>${safeLabel}: ${safeMessage}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="${HEIGHT}" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${HEIGHT}" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="${HEIGHT}" fill="${rightColor}"/>
    <rect width="${totalWidth}" height="${HEIGHT}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelX}" y="14" fill="#010101" fill-opacity=".3">${safeLabel}</text>
    <text x="${labelX}" y="13">${safeLabel}</text>
    <text x="${messageX}" y="14" fill="#010101" fill-opacity=".3">${safeMessage}</text>
    <text x="${messageX}" y="13">${safeMessage}</text>
  </g>
</svg>
`;
}

/** The shape shields.io's `/endpoint` badge expects — https://shields.io/badges/endpoint-badge */
export function shieldsEndpoint({
  label,
  message,
  color,
}: BadgeContent): { schemaVersion: 1 } & BadgeContent {
  return { schemaVersion: 1, label, message, color };
}
