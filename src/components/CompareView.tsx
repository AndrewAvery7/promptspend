import { useMemo, useState } from 'react';
import { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { formatContext, formatRate } from '@/lib/engine/format';

interface CompareViewProps {
  catalog: Catalog;
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function CompareView({ catalog, selectedIds, onToggle }: CompareViewProps) {
  const spread = catalog.outputSpread();

  return (
    <section aria-labelledby="compare-heading">
      <p className="eyebrow">Compare</p>
      <h1 className="headline" id="compare-heading">
        Price is a <em>{spread ? `${Math.round(spread.multiple)}×` : 'big'}</em> decision.
      </h1>
      <p className="subhead">
        Every model we track, mapped by what it costs against roughly what it can do. Click a dot to add it to
        your estimate, or sort the table below on any column.
      </p>

      <ValueMap catalog={catalog} selectedIds={selectedIds} onToggle={onToggle} />
      <CatalogTable catalog={catalog} />
    </section>
  );
}

const WIDTH = 860;
const HEIGHT = 430;
const PAD = { left: 64, right: 24, top: 20, bottom: 48 };

function ValueMap({ catalog, selectedIds, onToggle }: CompareViewProps) {
  const [hover, setHover] = useState<{ model: Model; x: number; y: number } | null>(null);

  const points = useMemo(() => {
    const models = catalog.models.filter((m) => Catalog.blendedRate(m) > 0);
    const rates = models.map((m) => Catalog.blendedRate(m));
    const min = Math.min(...rates) * 0.8;
    const max = Math.max(...rates) * 1.25;
    const capabilities = models.map((m) => m.capabilityIndex ?? 70);
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
        cy: y(model.capabilityIndex ?? 70),
      })),
      xTicks: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]
        .filter((v) => v >= min && v <= max)
        .map((v) => ({ v, x: x(v) })),
      yTicks: tickRange(capMin, capMax).map((v) => ({ v, y: y(v) })),
    };
  }, [catalog]);

  // Label only the models a reader is likely to be looking for: the extremes of
  // each axis plus anything currently selected. Labelling all 70 is unreadable.
  const labelled = useMemo(() => {
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
  }, [points.models, selectedIds]);

  return (
    <div className="value-map" id="panel-valuemap">
      <h2 className="panel__title">Value map — blended $/1M tokens (log) vs capability</h2>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Scatter plot of ${points.models.length} models: blended price on a logarithmic x axis against capability index on the y axis. The full data is in the table below.`}
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
              fontSize="11"
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
              fontSize="11"
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
          fontSize="11"
          fontFamily="var(--font-mono)"
          fill="var(--muted)"
        >
          BLENDED PRICE $/1M TOKENS (LOG SCALE)
        </text>
        <text
          x={16}
          y={(PAD.top + HEIGHT - PAD.bottom) / 2}
          textAnchor="middle"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fill="var(--muted)"
          transform={`rotate(-90 16 ${(PAD.top + HEIGHT - PAD.bottom) / 2})`}
        >
          CAPABILITY INDEX (ILLUSTRATIVE)
        </text>

        {points.models.map(({ model, cx, cy }) => {
          const selected = selectedIds.includes(model.id);
          return (
            <g key={model.id}>
              <circle
                cx={cx}
                cy={cy}
                r={selected ? 8 : 6}
                fill={selected ? 'var(--accent)' : 'transparent'}
                stroke={selected ? 'var(--accent)' : 'var(--muted)'}
                strokeWidth="2"
                style={{ cursor: 'pointer' }}
                onMouseMove={(event) => setHover({ model, x: event.clientX, y: event.clientY })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onToggle(model.id)}
              >
                <title>{`${model.displayName} — $${model.pricing.input} in / $${model.pricing.output} out per 1M`}</title>
              </circle>
              {labelled.has(model.id) && (
                <text
                  x={cx}
                  y={cy - 13}
                  textAnchor="middle"
                  fontSize="11.5"
                  fontWeight="600"
                  fill="var(--ink)"
                >
                  {model.displayName}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="value-map__caption">
        Filled dots are in your estimate — click any dot to add or remove it. Blended price weights input 75%
        / output 25%. The capability axis is an illustrative placeholder, not a benchmark score.
      </p>
      {hover && (
        <div className="chart-tooltip" style={{ left: hover.x + 14, top: hover.y - 10 }}>
          <b>{hover.model.displayName}</b> · {catalogProvider(hover.model)}
          <br />
          in {formatRate(hover.model.pricing.input)}/M · out {formatRate(hover.model.pricing.output)}/M
        </div>
      )}
    </div>
  );
}

function catalogProvider(model: Model): string {
  return model.providerId;
}

type SortKey = 'name' | 'provider' | 'input' | 'output' | 'context';

function CatalogTable({ catalog }: { catalog: Catalog }) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'input', asc: true });

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
    return [...catalog.models].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const comparison =
        typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb);
      return comparison * (sort.asc ? 1 : -1);
    });
  }, [catalog, sort]);

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
    <div className="table-wrap">
      <table className="catalog">
        <caption className="visually-hidden">
          Every tracked model with its published rates, context window and data source
        </caption>
        <thead>
          <tr>
            {header('name', 'Model', true)}
            {header('provider', 'Provider', true)}
            {header('input', 'Input $/1M')}
            {header('output', 'Output $/1M')}
            {header('context', 'Context')}
            <th className="align-left">
              <button type="button" disabled>
                Source
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((model) => (
            <tr key={model.id}>
              <td className="align-left">
                <span className="model-name">{model.displayName}</span>{' '}
                {model.pricing.intro && <span className="badge badge--intro">INTRO</span>}
                {model.status !== 'current' && <span className="pill">{model.status}</span>}
              </td>
              <td className="align-left">
                {catalog.providerName(model)} <span className="pill">{catalog.provider(model)?.country}</span>
              </td>
              <td>{formatRate(model.pricing.input)}</td>
              <td>{formatRate(model.pricing.output)}</td>
              <td>{formatContext(model.contextWindow)}</td>
              <td className="align-left source-cell">
                {model.provenance.source === 'vendor' ? 'vendor ✓' : model.provenance.source} ·{' '}
                {model.provenance.lastVerified.slice(5)}
                {model.provenance.needsReview && (
                  <span className="badge badge--review" title={model.provenance.reviewNote}>
                    {' '}
                    CHECK
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function tickRange(min: number, max: number): number[] {
  const start = Math.ceil(min / 10) * 10;
  const ticks: number[] = [];
  for (let value = start; value <= max; value += 10) ticks.push(value);
  return ticks;
}
