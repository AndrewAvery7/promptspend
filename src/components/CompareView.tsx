import { useMemo, useState } from 'react';
import { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { formatContext, formatRate } from '@/lib/engine/format';
import { HelpTip, ReviewBadge } from './Disclosure';

interface CompareViewProps {
  catalog: Catalog;
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function CompareView({ catalog, selectedIds, onToggle }: CompareViewProps) {
  const spread = catalog.rateSpread();

  return (
    <section aria-labelledby="compare-heading">
      <p className="eyebrow">Compare</p>
      <h1 className="headline" id="compare-heading">
        Price is a <em>{spread ? `${Math.round(spread.multiple)}×` : 'big'}</em> decision.
      </h1>
      {/* The multiple used to divide the priciest *output* rate by the cheapest
          *input* rate, which produced a far larger and entirely meaningless
          number — nobody ever chooses between input and output. Both sides are
          now the same measure, and both are printed, so the arithmetic can be
          checked against the table below. */}
      {spread && (
        <p className="subhead">
          On a blended rate — input weighted 75%, output 25% — <b>{spread.priciest.displayName}</b> costs{' '}
          {formatRate(spread.priciestRate)}/M against <b>{spread.cheapest.displayName}</b> at{' '}
          {formatRate(spread.cheapestRate)}/M. The same measure on both sides, so the multiple means
          something.
        </p>
      )}
      <p className="subhead">
        Every model we track, mapped by what it costs. Choose a dot or a table row to add it to your estimate,
        and sort the table on any column.
      </p>

      <ValueMap catalog={catalog} selectedIds={selectedIds} onToggle={onToggle} />
      <CatalogTable catalog={catalog} selectedIds={selectedIds} onToggle={onToggle} />
    </section>
  );
}

const WIDTH = 860;
const HEIGHT = 430;
const PAD = { left: 64, right: 24, top: 20, bottom: 48 };

function ValueMap({ catalog, selectedIds, onToggle }: CompareViewProps) {
  const [hover, setHover] = useState<{ model: Model; x: number; y: number } | null>(null);

  const points = useMemo(() => {
    // Only models with a capability estimate are plotted.
    //
    // Substituting a default for the rest drew 26 models along one flat line at
    // exactly 70, which reads as a finding and is an artefact. A model without
    // a score is not in the middle of the axis; it is not on the axis.
    const models = catalog.primaryModels.filter(
      (m) => Catalog.blendedRate(m) > 0 && m.capabilityIndex !== undefined,
    );
    if (models.length === 0) return null;

    const rates = models.map((m) => Catalog.blendedRate(m));
    const min = Math.min(...rates) * 0.8;
    const max = Math.max(...rates) * 1.25;
    const capabilities = models.map((m) => m.capabilityIndex ?? 0);
    const capMin = Math.min(...capabilities) - 4;
    const capMax = Math.max(...capabilities) + 4;

    const x = (rate: number) =>
      PAD.left +
      ((Math.log10(rate) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))) *
        (WIDTH - PAD.left - PAD.right);
    const y = (capability: number) =>
      PAD.top + ((capMax - capability) / (capMax - capMin)) * (HEIGHT - PAD.top - PAD.bottom);

    return {
      models: models.map((model) => ({
        model,
        cx: x(Catalog.blendedRate(model)),
        cy: y(model.capabilityIndex ?? 0),
      })),
      xTicks: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]
        .filter((v) => v >= min && v <= max)
        .map((v) => ({ v, x: x(v) })),
      yTicks: tickRange(capMin, capMax).map((v) => ({ v, y: y(v) })),
      unscored: catalog.primaryModels.length - models.length,
    };
  }, [catalog]);

  // Label only the models a reader is likely to be looking for: the extremes of
  // each axis plus anything currently selected. Labelling all of them is unreadable.
  const labelled = useMemo(() => {
    if (!points) return new Set<string>();
    const byPrice = [...points.models].sort(
      (a, b) => Catalog.blendedRate(a.model) - Catalog.blendedRate(b.model),
    );
    const byCapability = [...points.models].sort(
      (a, b) => (b.model.capabilityIndex ?? 0) - (a.model.capabilityIndex ?? 0),
    );
    return new Set([
      ...byPrice.slice(0, 3).map((p) => p.model.id),
      ...byPrice.slice(-3).map((p) => p.model.id),
      ...byCapability.slice(0, 4).map((p) => p.model.id),
      ...selectedIds,
    ]);
  }, [points, selectedIds]);

  if (!points) return null;

  return (
    <div className="value-map" id="panel-valuemap">
      <h2 className="panel__title">
        Value map — blended $/1M tokens (log) vs capability
        <HelpTip label="Capability axis">
          The capability axis is an illustrative ordering, not a benchmark. It exists to spread the models
          apart so the price axis is readable — never to tell you which model is better at your task. Models
          with no estimate are not plotted; all of them are in the table below.
        </HelpTip>
      </h2>
      {/* A wide chart squeezed onto a phone becomes an unreadable poster.
          Scrolling inside its own box keeps it legible and stops the page
          scrolling sideways; on a small screen the table underneath is the real
          answer, which is why it is sortable and selectable. */}
      <div className="value-map__scroll">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="group"
          aria-label={`Scatter plot of ${points.models.length} models: blended price on a logarithmic x axis against an illustrative capability index on the y axis. Each point can be focused and activated to add that model to the estimate. The full data is in the table below.`}
          onMouseLeave={() => setHover(null)}
        >
          {points.xTicks.map((tick) => (
            <g key={`x-${tick.v}`}>
              <line
                x1={tick.x}
                y1={PAD.top}
                x2={tick.x}
                y2={HEIGHT - PAD.bottom}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={tick.x}
                y={HEIGHT - PAD.bottom + 18}
                textAnchor="middle"
                fontSize="13"
                fontFamily="var(--font-mono)"
                fill="var(--muted)"
              >
                ${tick.v}
              </text>
            </g>
          ))}
          {points.yTicks.map((tick) => (
            <g key={`y-${tick.v}`}>
              <line
                x1={PAD.left}
                y1={tick.y}
                x2={WIDTH - PAD.right}
                y2={tick.y}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 10}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="13"
                fontFamily="var(--font-mono)"
                fill="var(--muted)"
              >
                {tick.v}
              </text>
            </g>
          ))}
          <text
            x={(PAD.left + WIDTH - PAD.right) / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize="13"
            fontFamily="var(--font-mono)"
            fill="var(--muted)"
          >
            BLENDED PRICE $/1M TOKENS (LOG SCALE)
          </text>
          <text
            x={16}
            y={(PAD.top + HEIGHT - PAD.bottom) / 2}
            textAnchor="middle"
            fontSize="13"
            fontFamily="var(--font-mono)"
            fill="var(--muted)"
            transform={`rotate(-90 16 ${(PAD.top + HEIGHT - PAD.bottom) / 2})`}
          >
            CAPABILITY (ILLUSTRATIVE)
          </text>

          {points.models.map(({ model, cx, cy }) => {
            const selected = selectedIds.includes(model.id);
            return (
              <g key={model.id}>
                {/* Each mark is a real control: focusable, activated by Enter or
                    Space, and named. Click handlers on a bare <circle> left the
                    chart's only interaction reachable by mouse alone. */}
                <g
                  className="value-map__point"
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`${model.displayName}, ${formatRate(model.pricing.input)} in and ${formatRate(
                    model.pricing.output,
                  )} out per million tokens. ${selected ? 'In your estimate' : 'Add to your estimate'}.`}
                  onClick={() => onToggle(model.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onToggle(model.id);
                    }
                  }}
                  onFocus={() => setHover({ model, x: 0, y: 0 })}
                  onBlur={() => setHover(null)}
                  onMouseMove={(event) => setHover({ model, x: event.clientX, y: event.clientY })}
                  onMouseLeave={() => setHover(null)}
                >
                  {/* A generous invisible hit area: the visible dot is 6px
                      across, far under any usable touch target. */}
                  <circle cx={cx} cy={cy} r={22} fill="transparent" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={selected ? 8 : 6}
                    fill={selected ? 'var(--accent)' : 'transparent'}
                    stroke={selected ? 'var(--accent)' : 'var(--muted)'}
                    strokeWidth="2"
                  />
                </g>
                {labelled.has(model.id) && (
                  <text
                    x={cx}
                    y={cy - 15}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="600"
                    fill="var(--ink)"
                    pointerEvents="none"
                  >
                    {model.displayName}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="value-map__caption">
        Filled dots are in your estimate — choose any dot to add or remove it. Blended price weights input 75%
        / output 25%.{' '}
        {points.unscored > 0 && (
          <>
            <b>{points.unscored}</b> of {catalog.primaryModels.length} models have no capability estimate and
            so are not plotted; every one of them is in the table below.
          </>
        )}
      </p>
      {hover && hover.x > 0 && (
        <div className="chart-tooltip" style={{ left: hover.x + 14, top: hover.y - 10 }}>
          <b>{hover.model.displayName}</b> · {catalog.providerName(hover.model)}
          <br />
          in {formatRate(hover.model.pricing.input)}/M · out {formatRate(hover.model.pricing.output)}/M
        </div>
      )}
    </div>
  );
}

type SortKey = 'name' | 'provider' | 'input' | 'output' | 'context';

function CatalogTable({ catalog, selectedIds, onToggle }: CompareViewProps) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'input', asc: true });
  const [showRetired, setShowRetired] = useState(false);

  const rows = useMemo(() => {
    const value = (model: Model): string | number => {
      switch (sort.key) {
        case 'name':
          return model.displayName;
        case 'provider':
          return catalog.providerName(model);
        case 'output':
          return model.pricing.output;
        case 'context':
          return model.contextWindow;
        default:
          return model.pricing.input;
      }
    };
    // Retired and unlisted rows are kept but hidden by default: they inflate
    // the count and invite someone to price a model they cannot call.
    const visible = catalog.models.filter(
      (m) => showRetired || (m.status === 'current' && m.provenance.stale !== true),
    );
    return visible.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const comparison =
        typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb);
      return comparison * (sort.asc ? 1 : -1);
    });
  }, [catalog, sort, showRetired]);

  const hidden = catalog.models.length - rows.length;

  const header = (key: SortKey, label: string, alignLeft = false) => (
    <th
      className={alignLeft ? 'align-left' : undefined}
      aria-sort={sort.key === key ? (sort.asc ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => setSort((prev) => ({ key, asc: prev.key === key ? !prev.asc : true }))}
      >
        {label}
        {sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  return (
    <>
      <div className="table-controls">
        <label className="check-inline">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(event) => setShowRetired(event.target.checked)}
          />
          Show legacy, deprecated and unlisted models
          {hidden > 0 && !showRetired ? ` (${hidden} hidden)` : ''}
        </label>
      </div>
      <div className="table-wrap">
        <table className="catalog">
          <caption className="visually-hidden">
            Every tracked model with its published rates, context window and data source. The first column
            adds a model to your estimate.
          </caption>
          <thead>
            <tr>
              <th className="align-left">
                <span className="visually-hidden">In your estimate</span>
                <span aria-hidden="true">Use</span>
              </th>
              {header('name', 'Model', true)}
              {header('provider', 'Provider', true)}
              {header('input', 'Input $/1M')}
              {header('output', 'Output $/1M')}
              {header('context', 'Context')}
              <th className="align-left">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((model) => {
              const provider = catalog.provider(model);
              const sourceUrl = model.provenance.verifiedUrl ?? provider?.pricingUrl;
              return (
                <tr key={model.id}>
                  <td>
                    {/* Selection from the table, not only from the chart: a plot
                        point is a poor control on a phone and unusable with a
                        screen reader alone. */}
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(model.id)}
                      disabled={model.aliasOf !== undefined}
                      aria-label={
                        model.aliasOf
                          ? `${model.displayName} is an alias for ${model.aliasOf} — select that instead`
                          : `Add ${model.displayName} to your estimate`
                      }
                      onChange={() => onToggle(model.id)}
                    />
                  </td>
                  <td className="align-left">
                    <span className="model-name">{model.displayName}</span>{' '}
                    {model.pricing.intro && <span className="badge badge--intro">INTRO</span>}
                    {model.aliasOf && <span className="pill">alias</span>}
                    {model.status !== 'current' && <span className="pill">{model.status}</span>}
                    {model.provenance.stale && <span className="pill">unlisted</span>}
                  </td>
                  <td className="align-left">
                    {catalog.providerName(model)} <span className="pill">{provider?.country}</span>
                  </td>
                  <td className="mono">{formatRate(model.pricing.input)}</td>
                  <td className="mono">{formatRate(model.pricing.output)}</td>
                  <td className="mono">{formatContext(model.contextWindow)}</td>
                  <td className="align-left source-cell">
                    {/* "Every number shows its work" is only true if the work is
                        a link somebody can follow. */}
                    {sourceUrl ? (
                      <a href={sourceUrl} target="_blank" rel="noreferrer noopener">
                        {model.provenance.source === 'vendor' ? 'vendor ✓' : model.provenance.source} ↗
                      </a>
                    ) : (
                      <span>{model.provenance.source}</span>
                    )}{' '}
                    <span className="source-cell__date">{model.provenance.lastVerified.slice(5)}</span>{' '}
                    {model.provenance.needsReview && (
                      <ReviewBadge note={model.provenance.reviewNote} verifiedUrl={sourceUrl} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function tickRange(min: number, max: number): number[] {
  const start = Math.ceil(min / 10) * 10;
  const ticks: number[] = [];
  for (let value = start; value <= max; value += 10) ticks.push(value);
  return ticks;
}
