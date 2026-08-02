import type { ComparisonRow } from '@/lib/engine/cost';
import type { Catalog } from '@/lib/pricing/catalog';
import { formatMoney, formatPercent, formatRate, renderEmphasis } from '@/lib/engine/format';
import type { Insight } from '@/lib/engine/insights';

interface CostCardsProps {
  rows: ComparisonRow[];
  catalog: Catalog;
  cacheEnabled: boolean;
  conversationsPerMonth: number;
}

/** Every selected model, side by side, cheapest first. */
export function CostCards({ rows, catalog, cacheEnabled, conversationsPerMonth }: CostCardsProps) {
  if (rows.length === 0) {
    return (
      <div className="panel__body">
        <p className="subhead">Select at least one model to see what it would cost.</p>
      </div>
    );
  }

  return (
    <div className="card-grid">
      {rows.map((row) => {
        const { breakdown, scaled, model } = row;
        const inputShare = breakdown.total > 0 ? (breakdown.inputCost / breakdown.total) * 100 : 50;
        const intro = model.pricing.intro;
        return (
          <article
            key={model.id}
            className={`cost-card${row.isCheapest && rows.length > 1 ? ' cost-card--cheapest' : ''}`}
          >
            {!row.isCheapest && (
              <div className="cost-card__delta" title="Extra spend versus the cheapest option">
                +{formatMoney(row.deltaPerMonth)}/mo
              </div>
            )}
            <div className="cost-card__head">
              <span className="cost-card__name">{model.displayName}</span>
              {row.isCheapest && rows.length > 1 && <span className="badge badge--cheapest">CHEAPEST</span>}
            </div>
            <div className="cost-card__provider">
              {catalog.providerName(model)} · {formatRate(model.pricing.input)}/M in ·{' '}
              {formatRate(model.pricing.output)}/M out
              {intro ? ' · intro pricing' : ''}
            </div>

            <div className="cost-card__total mono">
              {formatMoney(scaled.perMonth)}
              <small>/mo</small>
            </div>
            <div className="cost-card__sub">
              {formatMoney(scaled.perConversation)}/conversation · {formatMoney(scaled.perYear)}/year
            </div>

            <div
              className="split-bar"
              role="img"
              aria-label={`Input ${Math.round(inputShare)} percent, output ${Math.round(100 - inputShare)} percent of cost`}
            >
              <div className="split-bar__in" style={{ width: `${inputShare}%` }} />
              <div className="split-bar__out" style={{ width: `${100 - inputShare}%` }} />
            </div>
            <div className="cost-card__legend">
              <span>
                <i style={{ background: 'var(--c-in)' }} />
                IN {formatMoney(breakdown.inputCost * conversationsPerMonth)}/mo
              </span>
              <span>
                <i style={{ background: 'var(--c-out)' }} />
                OUT {formatMoney(breakdown.outputCost * conversationsPerMonth)}/mo
              </span>
              {cacheEnabled && breakdown.cacheSavings > 0 && (
                <span className="value--save">
                  CACHE −{formatMoney(breakdown.cacheSavings * conversationsPerMonth)}/mo
                </span>
              )}
            </div>

            <div className="cost-card__foot">
              <span>
                cost/user <b>{formatMoney(scaled.costPerUser)}</b>
              </span>
              <span>
                margin{' '}
                <b className={scaled.margin !== null && scaled.margin < 0 ? 'value--cost' : 'value--save'}>
                  {scaled.margin !== null ? formatPercent(scaled.margin) : '—'}
                </b>
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** "Why these numbers" — live diagnosis of the current scenario. */
export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="panel__body">
      {insights.map((insight) => (
        <div className="insight-row" key={insight.id}>
          <span className="insight-row__marker" aria-hidden="true">
            ▸
          </span>
          <span>
            {renderEmphasis(insight.text).map((part, index) =>
              part.emphasis === 'strong' ? (
                <b key={index}>{part.text}</b>
              ) : part.emphasis === 'em' ? (
                <em key={index}>{part.text}</em>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Every assumption baked into the numbers, listed where it cannot be missed. */
export function AssumptionList({ rows }: { rows: ComparisonRow[] }) {
  const assumptions = [...new Set(rows.flatMap((row) => row.breakdown.assumptions))];
  if (assumptions.length === 0) return null;
  return (
    <div className="panel__body assumption-list">
      <strong>Assumptions in these numbers</strong>
      <ul>
        {assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
    </div>
  );
}
