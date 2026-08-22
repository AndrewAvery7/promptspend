import { useMemo, useState } from 'react';
import { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { formatContext, formatCount, formatMoney, formatRate } from '@/lib/engine/format';
import type { ComparisonRow } from '@/lib/engine/cost';
import { HelpTip, ReviewBadge } from './Disclosure';
import { CountryFilter } from './CountryFilter';
import { CountryTag, countryName } from './Flag';

interface CompareViewProps {
  catalog: Catalog;
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** Selected ISO-3166 alpha-2 codes; empty means every country. */
  countries: string[];
}

/** What the shortlist panel needs, on top of what the chart already takes.
 *  The country selection is this component's own state, not something handed
 *  down to it, which is why it is the one field omitted here. */
interface ComparePageProps extends Omit<CompareViewProps, 'countries'> {
  rows: ComparisonRow[];
  conversationsPerDay: number;
  onOpenEstimate: () => void;
}

export function CompareView({
  catalog,
  selectedIds,
  rows,
  conversationsPerDay,
  onOpenEstimate,
  onToggle,
}: ComparePageProps) {
  /* One selection for the whole view. The chart and the table are two readings
     of the same list — filtering one and not the other would show a model as a
     dot you could not find in the rows underneath it. */
  const [countries, setCountries] = useState<string[]>([]);
  const spread = catalog.rateSpread();
  const priciest = rows.length > 1 ? rows[rows.length - 1] : undefined;

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
      {/* Above the chart, not beside the table: it governs both, and a control
          that sits under the thing it filters reads as belonging to the table
          alone. */}
      <CountryFilter
        countries={catalog.countries()}
        selected={countries}
        onChange={setCountries}
        label="Show models from these countries"
      />
      {/* The chart and the shortlist share a row, and the shortlist is sticky.
          They were stacked: the panel sat in the hero and the chart below it,
          so by the time you were clicking dots the numbers you were changing
          had scrolled off the top of the window. Selecting a model and not
          seeing what it costs is the whole failure this panel was added to
          fix, reintroduced by where it was put. */}
      <div className="compare-layout">
        <div className="compare-layout__main">
          <ValueMap catalog={catalog} selectedIds={selectedIds} onToggle={onToggle} countries={countries} />
        </div>
        <aside className="hero__aside compare-layout__side" aria-labelledby="shortlist-title">
          <p className="hero__aside-eyebrow">Your shortlist</p>
          <h2 className="hero__aside-title" id="shortlist-title">
            {rows.length > 0 ? 'What your picks cost' : 'Nothing picked yet'}
          </h2>
          {rows.length === 0 ? (
            <p>
              Choose a dot on the chart, or a row in the table, and its monthly bill appears here — priced at
              the workload already set on Estimate.
            </p>
          ) : (
            <>
              <ol className="shortlist">
                {rows.map((row) => (
                  <li key={row.model.id}>
                    <span className="shortlist__name">
                      {row.model.displayName}
                      {row.isCheapest && <b className="shortlist__tag">CHEAPEST</b>}
                    </span>
                    <span className="shortlist__cost mono">{formatMoney(row.scaled.perMonth)}/mo</span>
                  </li>
                ))}
              </ol>
              {priciest && priciest.multipleOfCheapest !== null && priciest.multipleOfCheapest > 1 && (
                <p className="hero__aside-note">
                  <b>{priciest.model.displayName}</b> costs {Math.round(priciest.multipleOfCheapest)}× the
                  cheapest here — {formatMoney(priciest.deltaPerMonth)} more a month.
                </p>
              )}
              <p className="hero__aside-note">
                At {formatCount(conversationsPerDay)} conversations a day ·{' '}
                <button type="button" className="linklike" onClick={onOpenEstimate}>
                  Change the workload
                </button>
              </p>
            </>
          )}
        </aside>
      </div>

      <CatalogTable catalog={catalog} selectedIds={selectedIds} onToggle={onToggle} countries={countries} />
    </section>
  );
}

const WIDTH = 860;
const HEIGHT = 430;
const PAD = { left: 64, right: 24, top: 20, bottom: 48 };

/** Rough advance width per character at 13px / 600 weight in the display face.
 *  Estimated, not measured — see `labelled` for why. Erring high is the safe
 *  direction: it drops a borderline label rather than printing an overlap. */
const LABEL_CHAR_W = 7.1;
const LABEL_H = 13;

/** Tried in order. Above the dot reads best; the rest are fallbacks so a
 *  crowded cluster degrades to "moved" before it degrades to "missing". */
const LABEL_SPOTS = [
  { dx: 0, dy: -15, anchor: 'middle' as const },
  { dx: 0, dy: 24, anchor: 'middle' as const },
  { dx: 12, dy: 5, anchor: 'start' as const },
  { dx: -12, dy: 5, anchor: 'end' as const },
];

function ValueMap({ catalog, selectedIds, onToggle, countries }: CompareViewProps) {
  const [hover, setHover] = useState<{ model: Model; x: number; y: number } | null>(null);

  const points = useMemo(() => {
    // Only models with a capability estimate are plotted.
    //
    // Substituting a default for the rest drew 26 models along one flat line at
    // exactly 70, which reads as a finding and is an artefact. A model without
    // a score is not in the middle of the axis; it is not on the axis.
    //
    // The country filter narrows the pool *before* the axes are scaled, which
    // is the point of filtering a chart at all: with only the Chinese models
    // left, the price axis spans their range rather than leaving them bunched
    // against one edge of a scale drawn for models that are no longer shown.
    const inScope = catalog.primaryModels.filter((m) => catalog.inCountries(m, countries));
    const models = inScope.filter((m) => Catalog.blendedRate(m) > 0 && m.capabilityIndex !== undefined);
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
      unscored: inScope.length - models.length,
      scoped: inScope.length,
    };
  }, [catalog, countries]);

  /**
   * Where each label goes, or whether it goes at all.
   *
   * Choosing *which* models to label was never the problem — the extremes of
   * each axis plus the current selection is the right set. The problem is that
   * they were all drawn 15px above their dot regardless of what was already
   * there, and the top-right of this chart is a cluster: four frontier models
   * within a few points of capability and a couple of dollars of each other,
   * whose names then printed straight through one another.
   *
   * So each label is placed by trying four positions in order and taking the
   * first that hits nothing already placed. A label that fits nowhere is
   * dropped rather than overlapped — it is still in the tooltip on hover and
   * in the table below, which is where the precise reading happens anyway. An
   * unreadable label is worse than no label: it damages its neighbour too.
   *
   * Widths are estimated from character count rather than measured. Measuring
   * needs a laid-out DOM, which would move this into an effect and a second
   * render pass for a chart that is decoration around a table.
   */
  const labelled = useMemo(() => {
    const placements = new Map<string, { x: number; y: number; anchor: 'middle' | 'start' | 'end' }>();
    if (!points) return placements;

    const byPrice = [...points.models].sort(
      (a, b) => Catalog.blendedRate(a.model) - Catalog.blendedRate(b.model),
    );
    const byCapability = [...points.models].sort(
      (a, b) => (b.model.capabilityIndex ?? 0) - (a.model.capabilityIndex ?? 0),
    );

    // Selected models are labelled first, so a crowded corner drops a
    // background model rather than the one the reader just picked.
    const wanted = [
      ...selectedIds,
      ...byCapability.slice(0, 4).map((p) => p.model.id),
      ...byPrice.slice(0, 3).map((p) => p.model.id),
      ...byPrice.slice(-3).map((p) => p.model.id),
    ];

    const taken: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const hits = (box: (typeof taken)[number]) =>
      taken.some((t) => box.x1 < t.x2 && box.x2 > t.x1 && box.y1 < t.y2 && box.y2 > t.y1);

    for (const id of new Set(wanted)) {
      const point = points.models.find((p) => p.model.id === id);
      if (!point) continue;
      const width = point.model.displayName.length * LABEL_CHAR_W;

      for (const spot of LABEL_SPOTS) {
        const x = point.cx + spot.dx;
        const y = point.cy + spot.dy;
        const x1 = spot.anchor === 'middle' ? x - width / 2 : spot.anchor === 'start' ? x : x - width;
        const box = { x1, y1: y - LABEL_H, x2: x1 + width, y2: y + 3 };
        // Inside the plot area, not merely inside the svg. The first version
        // bounded against the svg edge, which let a label for a cheap model
        // spill left into the axis gutter and print over the y-axis tick
        // numbers — a collision the model-versus-model check could not see,
        // because a tick is not a model.
        if (
          box.x1 < PAD.left ||
          box.x2 > WIDTH - PAD.right ||
          box.y1 < PAD.top ||
          box.y2 > HEIGHT - PAD.bottom
        ) {
          continue;
        }
        if (hits(box)) continue;
        taken.push(box);
        placements.set(id, { x, y, anchor: spot.anchor });
        break;
      }
    }
    return placements;
  }, [points, selectedIds]);

  // Rendering nothing is right when the catalog simply carries no capability
  // estimates. It is wrong when the reader's own filter is what emptied the
  // chart: a control that makes a whole panel vanish without saying so looks
  // like a fault, and the way back out is no longer on screen.
  if (!points) {
    if (countries.length === 0) return null;
    return (
      <div className="value-map" id="panel-valuemap">
        <h2 className="panel__title">Value map — blended $/1M tokens (log) vs capability</h2>
        <p className="state-message">
          No model from {countries.map(countryName).join(' or ')} carries a capability estimate, so there is
          nothing to plot. They are all in the table below.
        </p>
      </div>
    );
  }

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
                  onFocus={(event) => {
                    // Position from the dot's own box, not (0, 0). The tooltip
                    // renders only when `hover.x > 0`, so focusing a dot set the
                    // state and then displayed nothing — a sighted keyboard user
                    // tabbed through every dot and saw no name for any of them.
                    // The aria-label carried it all along, which is why this went
                    // unnoticed: a screen reader was never affected.
                    const box = event.currentTarget.getBoundingClientRect();
                    setHover({ model, x: box.left + box.width / 2, y: box.top });
                  }}
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
                {labelled.get(model.id) && (
                  <text
                    x={labelled.get(model.id)!.x}
                    y={labelled.get(model.id)!.y}
                    textAnchor={labelled.get(model.id)!.anchor}
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
        <b>Hover or tab to any dot</b> for its name, price and provider — only the extremes are labelled, to
        keep the chart readable. Filled dots are in your estimate; choose any dot to add or remove it. Blended
        price weights input 75% / output 25%.{' '}
        {points.unscored > 0 && (
          <>
            <b>{points.unscored}</b> of {points.scoped} models have no capability estimate and so are not
            plotted; every one of them is in the table below.
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

function CatalogTable({ catalog, selectedIds, onToggle, countries }: CompareViewProps) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'input', asc: true });
  const [showRetired, setShowRetired] = useState(false);

  /* The country filter is the outer of the two, and the "(N hidden)" count
     beside the retired checkbox is counted inside it. Measuring that against
     the whole catalog would report the country filter's work as the retired
     filter's, and offer a checkbox that cannot bring those rows back. */
  const inScope = useMemo(
    () => catalog.models.filter((model) => catalog.inCountries(model, countries)),
    [catalog, countries],
  );

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
    const visible = inScope.filter(
      (m) => showRetired || (m.status === 'current' && m.provenance.stale !== true),
    );
    return visible.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const comparison =
        typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb);
      return comparison * (sort.asc ? 1 : -1);
    });
  }, [catalog, inScope, sort, showRetired]);

  const hidden = inScope.length - rows.length;

  const header = (key: SortKey, label: string, alignLeft = false) => (
    <th
      className={alignLeft ? 'align-left' : undefined}
      aria-sort={sort.key === key ? (sort.asc ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => setSort((prev) => ({ key, asc: prev.key === key ? !prev.asc : true }))}
        title={`Sort by ${label}`}
      >
        {label}
        {/* Every sortable column carries a marker, not just the active one.
            With an arrow on the sorted column alone there was nothing to say
            the other five could be clicked at all — the affordance only
            appeared once you had already found it. */}
        <span className={`sort-mark${sort.key === key ? ' is-active' : ''}`} aria-hidden="true">
          {sort.key === key ? (sort.asc ? '▲' : '▼') : '⇅'}
        </span>
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
              {/* Not a sort button, so it needs the padding the other headers
                  get from theirs — without it the label sat flush left while the
                  checkboxes below were indented. */}
              <th className="align-left col-use">
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
                  <td className="align-left col-use">
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
                    {catalog.providerName(model)} <CountryTag country={provider?.country} />
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
            {rows.length === 0 && (
              <tr>
                <td className="align-left" colSpan={7}>
                  {countries.length > 0
                    ? `No models from ${countries.map(countryName).join(' or ')} are listed.`
                    : 'No models to list.'}
                </td>
              </tr>
            )}
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
