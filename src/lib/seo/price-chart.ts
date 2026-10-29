/**
 * The price-history chart on a model page: two step lines drawn as inline SVG.
 *
 * Inline and static on purpose. The generated pages carry no script of their
 * own and the policy forbids inline styles, so the chart is plain SVG whose
 * colors come from classes in the page stylesheet, and the table beside it
 * carries every figure for anyone who cannot see a picture.
 *
 * A rate holds its value until the next change, so each line is a staircase
 * rather than a slope: joining two published prices with a diagonal would
 * suggest a gradual glide that never happened. The vertical axis starts at
 * zero, so the size of a price cut is shown at its true proportion.
 */
import type { ChartRate, StepPoint } from './price-history-view';

const WIDTH = 420;
const HEIGHT = 240;
const LEFT = 52;
const RIGHT = 62;
const TOP = 16;
const BOTTOM = 40;

const DAY = 86_400_000;

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function day(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY;
}

/** A tick step of 1, 2, 2.5 or 5 times a power of ten, giving about three bands. */
export function niceStep(max: number): number {
  const rough = max / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  const factor = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return factor * power;
}

function dollars(value: number): string {
  return `$${Number(value.toPrecision(3))}`;
}

export interface ChartInput {
  modelName: string;
  /** First and last day shown (the left and right edges). */
  from: string;
  to: string;
  series: Record<ChartRate, StepPoint[]>;
}

/** One rate as a staircase ending at the right edge. */
function stepPath(
  points: StepPoint[],
  x: (date: string) => number,
  y: (value: number) => number,
  end: number,
) {
  const first = points[0]!;
  let d = `M${x(first.date).toFixed(1)} ${y(first.value).toFixed(1)}`;
  for (const point of points.slice(1)) {
    d += ` H${x(point.date).toFixed(1)} V${y(point.value).toFixed(1)}`;
  }
  return `${d} H${end.toFixed(1)}`;
}

export function priceChartSvg(input: ChartInput): string {
  const days = Math.max(1, day(input.to) - day(input.from));
  const plotRight = WIDTH - RIGHT;
  const x = (date: string): number => LEFT + ((day(date) - day(input.from)) / days) * (plotRight - LEFT);

  const all = [...input.series.input, ...input.series.output].map((point) => point.value);
  const step = niceStep(Math.max(...all, 0.000001));
  const top = Math.ceil(Math.max(...all) / step) * step;
  const y = (value: number): number => HEIGHT - BOTTOM - (value / top) * (HEIGHT - BOTTOM - TOP);

  const grid: string[] = [];
  for (let tick = 0; tick <= top + step / 1000; tick += step) {
    const py = y(tick).toFixed(1);
    grid.push(
      `<line class="chart-grid" x1="${LEFT}" x2="${plotRight}" y1="${py}" y2="${py}"/>` +
        `<text class="chart-axis" x="${LEFT - 6}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${esc(dollars(tick))}</text>`,
    );
  }

  const lines = (['input', 'output'] as const)
    .filter((rate) => input.series[rate].length > 0)
    .map((rate) => {
      const points = input.series[rate];
      const last = points[points.length - 1]!;
      const dots = points
        .slice(1)
        .map(
          (p) =>
            `<circle class="chart-dot chart-${rate}" cx="${x(p.date).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5"/>`,
        )
        .join('');
      return (
        `<path class="chart-line chart-${rate}" d="${stepPath(points, x, y, plotRight)}"/>${dots}` +
        `<text class="chart-label" x="${plotRight + 6}" y="${(y(last.value) + 4).toFixed(1)}">${rate === 'input' ? 'Input' : 'Output'}</text>`
      );
    })
    .join('');

  const base = HEIGHT - BOTTOM;
  const axis =
    `<text class="chart-axis" x="${LEFT}" y="${base + 20}" text-anchor="start">${esc(input.from)}</text>` +
    `<text class="chart-axis" x="${plotRight}" y="${base + 20}" text-anchor="end">${esc(input.to)}</text>`;

  const describe = (['input', 'output'] as const)
    .filter((rate) => input.series[rate].length > 0)
    .map((rate) => {
      const values = input.series[rate].map((p) => dollars(p.value));
      return `${rate} ${values.join(' then ')}`;
    })
    .join('; ');
  const title = `${input.modelName} price history`;
  const desc = `Price per million tokens, ${input.from} to ${input.to}: ${describe}. The table below lists every change.`;

  return (
    `<svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="chart-title chart-desc" focusable="false">` +
    `<title id="chart-title">${esc(title)}</title><desc id="chart-desc">${esc(desc)}</desc>` +
    `${grid.join('')}${lines}${axis}</svg>`
  );
}
