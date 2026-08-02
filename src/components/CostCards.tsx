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
            {/* Both verdicts sit in the same corner. They are the same kind of
                fact — how this card compares with the cheapest — so having one
                float top-right and the other sit inline next to the name made
                a row of cards read as two different layouts. */}
            {row.isCheapest ? (
              rows.length > 1 && <span className="badge badge--cheapest cost-card__flag">CHEAPEST</span>
            ) : (
              <div className="cost-card__delta">
                <span className="visually-hidden">Extra spend versus the cheapest option: </span>+
                {formatMoney(row.deltaPerMonth)}/mo
              </div>
            )}
            <div className="cost-card__head">
              <span className="cost-card__name">{model.displayName}</span>
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
              {cacheEnabled && breakdown.cacheSavings !== 0 && (
                <span className={breakdown.cacheSavings > 0 ? 'value--save' : 'value--cost'}>
                  {/* Net of cache writes. Showing the read saving alone would
                      report a discount the invoice does not contain. */}
                  CACHE {breakdown.cacheSavings > 0 ? '−' : '+'}
                  {formatMoney(Math.abs(breakdown.cacheSavings) * conversationsPerMonth)}/mo
                </span>
              )}
              {breakdown.longContextTurns > 0 && (
                <span className="value--cost">LONG CONTEXT {breakdown.longContextTurns} turns</span>
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
export function AssumptionList({ rows, scope }: { rows: ComparisonRow[]; scope?: string }) {
  const assumptions = [...new Set(rows.flatMap((row) => row.breakdown.assumptions))];
  if (assumptions.length === 0 && !scope) return null;
  return (
    <div className="panel__body assumption-list">
      <strong>Assumptions in these numbers</strong>
      <ul>
        {assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
        {/* The edge of the model, stated in the same place as the assumptions
            inside it. "What this does not cover" is part of what a number
            means. */}
        {scope && <li className="assumption-list__scope">{scope}</li>}
      </ul>
    </div>
  );
}

/**
 * Warnings are not assumptions. An assumption is a choice the estimate made; a
 * warning is a sign the scenario itself could not happen — a request past the
 * context window, a response past the output ceiling. Those need to interrupt,
 * not sit in a list.
 */
export function WarningList({ rows }: { rows: ComparisonRow[] }) {
  const warnings = [...new Set(rows.flatMap((row) => row.breakdown.warnings))];
  if (warnings.length === 0) return null;
  return (
    <div className="panel__body warning-list" role="alert">
      <strong>This scenario would not run as described</strong>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
