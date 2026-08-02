/**
 * Display formatting. Rounding happens here and nowhere else — the engine
 * always hands over full-precision values.
 */

/**
 * Money with precision that scales to magnitude: a fraction of a cent still
 * reads as a number rather than "$0.00", and a five-figure line item does not
 * drown in decimals.
 */
export function formatMoney(dollars: number): string {
  if (!Number.isFinite(dollars)) return '—';
  const sign = dollars < 0 ? '-' : '';
  const value = Math.abs(dollars);

  if (value >= 1000) return `${sign}$${Math.round(value).toLocaleString('en-US')}`;
  if (value >= 100) return `${sign}$${value.toFixed(0)}`;
  if (value >= 1) return `${sign}$${value.toFixed(2)}`;
  if (value >= 0.01) return `${sign}$${value.toFixed(3)}`;
  if (value === 0) return '$0';
  return `${sign}$${value.toPrecision(2)}`;
}

export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens)) return '—';
  const value = Math.round(tokens);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M tok`;
  if (value >= 1000) {
    const thousands = value / 1000;
    return `${thousands.toFixed(value % 1000 === 0 ? 0 : 1)}k tok`;
  }
  return `${value} tok`;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** Fractions in, percent out. `0.98` -> `98%`. */
export function formatPercent(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatRate(dollarsPerMillion: number): string {
  return `$${Number(dollarsPerMillion.toFixed(3))}`;
}

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${Number(millions.toFixed(millions < 10 ? 2 : 0))}M`;
  }
  return `${Math.round(tokens / 1000)}K`;
}

/** Render the `**bold**` / `*italic*` spans used in insight strings. */
export function renderEmphasis(text: string): { text: string; emphasis: 'none' | 'strong' | 'em' }[] {
  const parts: { text: string; emphasis: 'none' | 'strong' | 'em' }[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), emphasis: 'none' });
    }
    if (match[1] !== undefined) parts.push({ text: match[1], emphasis: 'strong' });
    else if (match[2] !== undefined) parts.push({ text: match[2], emphasis: 'em' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), emphasis: 'none' });
  return parts;
}
