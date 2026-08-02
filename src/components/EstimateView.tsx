import type { Catalog } from '@/lib/pricing/catalog';
import { PRICING_SCOPE } from '@/config';
import { csvDocument } from '@/lib/engine/csv';
import { formatCount, formatMoney, formatTokens } from '@/lib/engine/format';
import { SUGGESTED_CACHE_SHARE } from '@/lib/engine/cost';
import { MAX_MODELS } from '@/lib/url/scenario';
import { MAX_PASTE_CHARS, type FieldKey, type useEstimator } from '@/state/useEstimator';
import { AssumptionList, CostCards, InsightList, WarningList } from './CostCards';
import { HelpTip, ReviewBadge } from './Disclosure';
import { CountryTag } from './Flag';

type Estimator = ReturnType<typeof useEstimator>;

interface EstimateViewProps {
  catalog: Catalog;
  estimator: Estimator;
  search: string;
  onSearch: (value: string) => void;
  onToast: (message: string) => void;
  showWelcome: boolean;
  onStartTour: () => void;
  onDismissWelcome: () => void;
}

const FIELD_COPY: Record<
  FieldKey,
  {
    label: string;
    scenarioKey: 'systemTokens' | 'userTokens' | 'outputTokens';
    max: number;
    step: number;
    note?: string;
    placeholder: string;
  }
> = {
  system: {
    label: 'System prompt',
    scenarioKey: 'systemTokens',
    max: 16000,
    step: 100,
    note: 'Sent with every request. Keep it lean — or cache it.',
    placeholder: 'Paste your actual system prompt — the token count updates live…',
  },
  user: {
    label: 'User message',
    scenarioKey: 'userTokens',
    max: 16000,
    step: 50,
    placeholder: 'Paste a typical user message…',
  },
  output: {
    label: 'Model response',
    scenarioKey: 'outputTokens',
    max: 32000,
    step: 50,
    note: 'Output usually costs 3–5× input. This is the dial that moves your bill most.',
    placeholder: 'Paste a sample response, if you have one…',
  },
};

export function EstimateView({
  catalog,
  estimator,
  search,
  onSearch,
  onToast,
  showWelcome,
  onStartTour,
  onDismissWelcome,
}: EstimateViewProps) {
  const { scenario, fields, rows, insights } = estimator;
  const groups = catalog.byProvider(search);
  const primaryModel = catalog.get(scenario.modelIds[0] ?? '');
  const primaryTokens = primaryModel ? estimator.tokensForModel(primaryModel) : null;
  const conversationsPerMonth = scenario.conversationsPerDay * 30;
  const cacheOn = scenario.cachedInputShare > 0;

  return (
    <section aria-labelledby="estimate-heading">
      <p className="eyebrow">Estimate</p>
      <h1 className="headline" id="estimate-heading">
        Know the tab <em>before</em> you build.
      </h1>
      <p className="subhead">
        Paste your real prompt or sketch the workload, pick up to four models, and see every model&apos;s bill
        side by side — at your scale, from prices re-checked every morning.
      </p>

      {showWelcome && (
        <div className="welcome">
          <span>
            <b>First time here?</b> The 60-second guided tour walks you from prompt to side-by-side costs —
            and explains why the numbers behave the way they do.
          </span>
          <button type="button" className="welcome__start" onClick={onStartTour}>
            Take the tour
          </button>
          <button
            type="button"
            className="welcome__dismiss"
            aria-label="Dismiss the tour invitation"
            onClick={onDismissWelcome}
          >
            ✕
          </button>
        </div>
      )}

      {estimator.restoredFromPaste && (
        <p className="note note--info" role="status">
          <span>
            <b>Restored from a shared link.</b> Some of these token counts were measured from a pasted prompt.
            The counts travelled; the prompt text did not — it is never put in a URL.
          </span>
        </p>
      )}

      <div className="workspace">
        <div className="workspace__inputs">
          {/* 1 — models */}
          <section className="panel" id="panel-models" aria-labelledby="models-title">
            <div className="panel__head">
              <h2 className="panel__title" id="models-title">
                1 · Models
                <HelpTip label="Models">
                  Same task, wildly different bills. Comparing before you build is the highest-leverage cost
                  decision there is.
                </HelpTip>
              </h2>
            </div>
            <div className="panel__body">
              <input
                className="search-input"
                type="search"
                value={search}
                placeholder={`Search ${catalog.primaryModels.length} models · ${catalog.providers.length} providers…`}
                aria-label="Search models"
                onChange={(event) => onSearch(event.target.value)}
              />
              <div className="model-list" role="group" aria-label="Available models">
                {groups.map((group) => (
                  <div key={group.provider.id}>
                    <div className="model-group">
                      <span>{group.provider.name}</span>
                      <CountryTag country={group.provider.country} />
                    </div>
                    {group.models.map((model) => {
                      const checked = scenario.modelIds.includes(model.id);
                      return (
                        <div className="model-row" key={model.id}>
                          <label className="model-row__main">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const result = estimator.toggleModel(model.id);
                                if (!result.ok && result.reason) onToast(result.reason);
                              }}
                            />
                            <span className="model-row__name">{model.displayName}</span>
                          </label>
                          <span className="model-row__tags">
                            {model.pricing.intro && <span className="badge badge--intro">INTRO</span>}
                            {/* Status belongs where the choice is made, not only in
                                the catalog table — picking a retired model by
                                accident is an expensive mistake to discover later. */}
                            {model.status !== 'current' && (
                              <span className="pill pill--status">{model.status}</span>
                            )}
                            {model.provenance.stale && <span className="pill pill--status">unlisted</span>}
                            {model.provenance.needsReview && (
                              <ReviewBadge
                                note={model.provenance.reviewNote}
                                verifiedUrl={
                                  model.provenance.verifiedUrl ?? catalog.provider(model)?.pricingUrl
                                }
                              />
                            )}
                            <span className="model-row__rate mono">
                              ${model.pricing.input} / ${model.pricing.output}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {groups.length === 0 && <p className="state-message">No models match “{search}”.</p>}
              </div>
              <p className="selection-count">
                <b>{scenario.modelIds.length}</b> of {MAX_MODELS} selected — every selection gets its own cost
                card
              </p>
            </div>
          </section>

          {/* 2 — workload */}
          <section className="panel" id="panel-workload" aria-labelledby="workload-title">
            <div className="panel__head">
              <h2 className="panel__title" id="workload-title">
                2 · One interaction
                <HelpTip label="One interaction">
                  Describe a single typical exchange. Scale, comparison and margin all multiply out from this.
                </HelpTip>
              </h2>
            </div>
            <div className="panel__body">
              <p className="note">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--info)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" />
                </svg>
                <span>
                  <b>Two ways to fill this in:</b> drag the <b>sliders</b> to sketch rough sizes, or switch a
                  field to <b>Paste text</b> and drop in your real prompt — the token count and every
                  model&apos;s cost update live as you type. Pasted text stays in your browser.
                </span>
              </p>

              {(Object.keys(FIELD_COPY) as FieldKey[]).map((key) => {
                const copy = FIELD_COPY[key];
                const state = fields[key];
                const pasted = state.mode === 'paste';
                const tokens = pasted ? (primaryTokens?.[key] ?? 0) : scenario[copy.scenarioKey];
                const estimated = pasted && primaryTokens?.method !== 'exact';
                return (
                  <div className="field" key={key}>
                    <div className="field__label">
                      <label htmlFor={`field-${key}`}>{copy.label}</label>
                      <span className="field__controls">
                        <span className={`field__value mono${estimated ? ' field__value--estimate' : ''}`}>
                          {estimated ? '≈ ' : ''}
                          {formatTokens(tokens)}
                          {pasted ? (estimated ? ' · est' : ' · raw text') : ''}
                        </span>
                        <span className="mode-switch" role="group" aria-label={`${copy.label} input mode`}>
                          <button
                            type="button"
                            aria-pressed={state.mode === 'slider'}
                            onClick={() => estimator.setFieldMode(key, 'slider')}
                          >
                            Slider
                          </button>
                          <button
                            type="button"
                            aria-pressed={pasted}
                            onClick={() => estimator.setFieldMode(key, 'paste')}
                          >
                            Paste text
                          </button>
                        </span>
                      </span>
                    </div>
                    {!pasted ? (
                      <input
                        id={`field-${key}`}
                        type="range"
                        min={0}
                        max={copy.max}
                        step={copy.step}
                        value={scenario[copy.scenarioKey]}
                        onChange={(event) =>
                          estimator.updateNumber(copy.scenarioKey, Number(event.target.value))
                        }
                      />
                    ) : (
                      <textarea
                        id={`field-${key}`}
                        value={state.text}
                        maxLength={MAX_PASTE_CHARS}
                        placeholder={copy.placeholder}
                        onChange={(event) => {
                          const result = estimator.setFieldText(key, event.target.value);
                          if (!result.ok && result.reason) onToast(result.reason);
                        }}
                      />
                    )}
                    {copy.note && <p className="field__note">{copy.note}</p>}
                  </div>
                );
              })}

              <div className="field">
                <div className="field__label">
                  <label htmlFor="field-turns">Turns per conversation</label>
                  <span className="field__value mono">{scenario.turns}</span>
                </div>
                <input
                  id="field-turns"
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={scenario.turns}
                  onChange={(event) => estimator.updateNumber('turns', Number(event.target.value))}
                />
                <p className="field__note">Every turn re-sends the history — cost compounds.</p>
              </div>

              {/* Caching is off by default and lives here, in plain sight, rather
                  than switched on inside a collapsed "Advanced" section. A
                  discount the visitor never agreed to does not belong in the
                  first number they see. */}
              <div className="check-row check-row--prominent">
                <input
                  id="cache-toggle"
                  type="checkbox"
                  checked={cacheOn}
                  onChange={(event) =>
                    estimator.updateNumber(
                      'cachedInputShare',
                      event.target.checked ? SUGGESTED_CACHE_SHARE : 0,
                    )
                  }
                />
                <div>
                  <label htmlFor="cache-toggle">
                    Assume prompt caching <span className="tag-assumption">OFF BY DEFAULT</span>
                  </label>
                  <p className="field__note">
                    Turns on a {Math.round(SUGGESTED_CACHE_SHARE * 100)}% cache-hit assumption, uses each
                    provider&apos;s published cached and cache-write rates, and charges full price where a
                    provider publishes neither. Realistic for a chat app with a stable system prompt — but it
                    is an assumption about <em>your</em> traffic, so you make it, not us.
                  </p>
                  {cacheOn && (
                    <div className="field" style={{ marginTop: 10 }}>
                      <div className="field__label">
                        <label htmlFor="field-cache-share">Cache-hit share</label>
                        <span className="field__value mono">
                          {Math.round(scenario.cachedInputShare * 100)}%
                        </span>
                      </div>
                      <input
                        id="field-cache-share"
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={scenario.cachedInputShare}
                        onChange={(event) =>
                          estimator.updateNumber('cachedInputShare', Number(event.target.value))
                        }
                      />
                    </div>
                  )}
                </div>
              </div>

              <details className="advanced">
                <summary>Advanced assumptions</summary>
                <div className="check-row">
                  <input
                    id="batch-toggle"
                    type="checkbox"
                    checked={scenario.useBatchApi}
                    onChange={(event) => estimator.update('useBatchApi', event.target.checked)}
                  />
                  <div>
                    <label htmlFor="batch-toggle">Use the batch API where the provider offers one</label>
                    <p className="field__note">Typically ~50% off, for work that tolerates delay.</p>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <div className="field__label">
                    <label htmlFor="field-reasoning">Reasoning-token multiplier</label>
                    <span className="field__value mono">{scenario.reasoningMultiplier.toFixed(1)}×</span>
                  </div>
                  <input
                    id="field-reasoning"
                    type="range"
                    min={1}
                    max={5}
                    step={0.5}
                    value={scenario.reasoningMultiplier}
                    onChange={(event) => estimator.update('reasoningMultiplier', Number(event.target.value))}
                  />
                  <p className="field__note">
                    Thinking models bill hidden reasoning as output. Raise this to model that.
                  </p>
                </div>
              </details>
            </div>
          </section>

          {/* 3 — scale */}
          <section className="panel" id="panel-scale" aria-labelledby="scale-title">
            <div className="panel__head">
              <h2 className="panel__title" id="scale-title">
                3 · Scale &amp; revenue
                <HelpTip label="Scale and revenue">
                  A cost that looks free per request can be a five-figure line item per month.
                </HelpTip>
              </h2>
            </div>
            <div className="panel__body">
              <div className="field">
                <div className="field__label">
                  <label htmlFor="field-conv">Conversations per day</label>
                  <span className="field__value mono">{formatCount(scenario.conversationsPerDay)}</span>
                </div>
                <input
                  id="field-conv"
                  type="range"
                  min={10}
                  max={50000}
                  step={10}
                  value={scenario.conversationsPerDay}
                  onChange={(event) =>
                    estimator.updateNumber('conversationsPerDay', Number(event.target.value))
                  }
                />
              </div>
              <div className="grid-2">
                <div className="field">
                  <div className="field__label">
                    <label htmlFor="field-users">Monthly active users</label>
                  </div>
                  <input
                    id="field-users"
                    className="number-input"
                    type="number"
                    min={1}
                    value={scenario.monthlyActiveUsers}
                    onChange={(event) =>
                      estimator.updateNumber('monthlyActiveUsers', Number(event.target.value))
                    }
                  />
                </div>
                <div className="field">
                  <div className="field__label">
                    <label htmlFor="field-revenue">Revenue / user / mo ($)</label>
                  </div>
                  <input
                    id="field-revenue"
                    className="number-input"
                    type="number"
                    min={0}
                    step={0.5}
                    value={scenario.revenuePerUserPerMonth}
                    onChange={(event) =>
                      estimator.updateNumber('revenuePerUserPerMonth', Number(event.target.value))
                    }
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* results */}
        <div className="workspace__results" id="panel-results">
          <section className="panel" aria-labelledby="results-title">
            <div className="panel__head">
              <h2 className="panel__title" id="results-title">
                Your models, side by side
                <span className="sync-chip">PRICES CHANGED {catalog.pricesLastChanged()}</span>
              </h2>
            </div>
            <CostCards
              rows={rows}
              catalog={catalog}
              cacheEnabled={cacheOn}
              conversationsPerMonth={conversationsPerMonth}
            />
            {rows.length > 1 && <SavingsCallout rows={rows} />}
          </section>

          <section className="panel" aria-labelledby="insights-title">
            <div className="panel__head">
              <h2 className="panel__title" id="insights-title">
                Why these numbers
                <HelpTip label="Why these numbers">
                  Live diagnosis of your scenario — which dial is actually driving the bill.
                </HelpTip>
              </h2>
            </div>
            <WarningList rows={rows} />
            <InsightList insights={insights} />
            <AssumptionList rows={rows} scope={PRICING_SCOPE} />
          </section>

          <div className="actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(window.location.href)
                  .then(() =>
                    onToast(
                      scenario.pastedFields.length > 0
                        ? 'Link copied — token counts travel, your prompt text does not'
                        : 'Scenario link copied',
                    ),
                  )
                  .catch(() => onToast('Copy the address bar to share this scenario'));
              }}
            >
              Share scenario
            </button>
            <button
              type="button"
              className="button"
              onClick={() => downloadCsv(rows, catalog, scenario.cachedInputShare, onToast)}
            >
              Export CSV
            </button>
            <button type="button" className="button" onClick={estimator.reset}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SavingsCallout({ rows }: { rows: ReturnType<typeof useEstimator>['rows'] }) {
  const cheapest = rows[0];
  const priciest = rows[rows.length - 1];
  if (!cheapest || !priciest || cheapest === priciest) return null;
  const annual = (priciest.scaled.perMonth - cheapest.scaled.perMonth) * 12;
  if (annual <= 0) return null;

  return (
    <div className="callout">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--save)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 22V2M7 7l5-5 5 5" />
      </svg>
      <span>
        Switching this workload from <b>{priciest.model.displayName}</b> to{' '}
        <b>{cheapest.model.displayName}</b> saves <b>{formatMoney(annual)}/year</b>. Testing whether the
        cheaper model clears your quality bar costs pennies.
      </span>
    </div>
  );
}

/**
 * The export carries everything needed to reproduce the number, not just the
 * number. A figure a colleague cannot re-derive is a figure they cannot argue
 * with, which is worse than useless in a budget conversation.
 */
function downloadCsv(
  rows: ReturnType<typeof useEstimator>['rows'],
  catalog: Catalog,
  cachedShare: number,
  onToast: (message: string) => void,
) {
  if (rows.length === 0) return;

  const assumptions = [...new Set(rows.flatMap((row) => row.breakdown.assumptions))];
  const warnings = [...new Set(rows.flatMap((row) => row.breakdown.warnings))];

  const preamble: unknown[][] = [
    ['TokenTally estimate'],
    ['exported', new Date().toISOString()],
    ['prices last changed', catalog.pricesLastChanged()],
    ['sources last checked', catalog.sourcesLastChecked() ?? 'unknown'],
    ['scope', PRICING_SCOPE],
    ['cache-hit share assumed', `${Math.round(cachedShare * 100)}%`],
    ...assumptions.map((text) => ['assumption', text]),
    ...warnings.map((text) => ['warning', text]),
    [],
  ];

  const header = [
    'model',
    'model_id',
    'provider',
    'status',
    'source',
    'last_verified',
    'vendor_url',
    'flagged_for_review',
    'tokenizer',
    'input_per_1m',
    'output_per_1m',
    'cached_input_per_1m',
    'cache_write_per_1m',
    'input_tokens_per_conversation',
    'output_tokens_per_conversation',
    'peak_request_tokens',
    'long_context_turns',
    'cost_per_conversation',
    'cost_per_month',
    'cost_per_year',
    'cost_per_user',
    'margin',
  ];

  const body = rows.map((row) => {
    const { model, breakdown, scaled } = row;
    return [
      model.displayName,
      model.id,
      catalog.providerName(model),
      model.status,
      model.provenance.source,
      model.provenance.lastVerified,
      model.provenance.verifiedUrl ?? catalog.provider(model)?.pricingUrl ?? '',
      model.provenance.needsReview ? 'yes' : 'no',
      model.tokenizer.kind === 'tiktoken' ? `exact:${model.tokenizer.encoding}` : 'estimated:ratio',
      model.pricing.input,
      model.pricing.output,
      model.pricing.cachedInput ?? '',
      model.pricing.cacheWrite ?? '',
      Math.round(breakdown.inputTokens),
      Math.round(breakdown.outputTokens),
      Math.round(breakdown.peakRequestTokens),
      breakdown.longContextTurns,
      scaled.perConversation.toFixed(6),
      scaled.perMonth.toFixed(2),
      scaled.perYear.toFixed(2),
      scaled.costPerUser.toFixed(4),
      scaled.margin === null ? '' : scaled.margin.toFixed(4),
    ];
  });

  const blob = new Blob([csvDocument([...preamble, header, ...body])], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tokentally-estimate.csv';
  link.click();
  URL.revokeObjectURL(url);
  onToast('CSV downloaded — assumptions and sources included');
}
