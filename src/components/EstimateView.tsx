import type { Catalog } from '@/lib/pricing/catalog';
import { formatCount, formatMoney, formatTokens } from '@/lib/engine/format';
import { MAX_MODELS } from '@/lib/url/scenario';
import { fieldTokenCount, type FieldKey, type useEstimator } from '@/state/useEstimator';
import { AssumptionList, CostCards, InsightList } from './CostCards';

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
    note: 'Sent with every request. Keep it lean — or cache it (see Advanced).',
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
  const conversationsPerMonth = scenario.conversationsPerDay * 30;

  return (
    <section aria-labelledby="estimate-heading">
      <p className="eyebrow">Estimate · prices never stale</p>
      <h1 className="headline" id="estimate-heading">
        Know the tab <em>before</em> you build.
      </h1>
      <p className="subhead">
        Paste your real prompt or sketch the workload, pick up to four models, and see every model&apos;s bill
        side by side — at your scale, with prices synced daily.
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

      <div className="workspace">
        <div>
          {/* 1 — models */}
          <section className="panel" id="panel-models" aria-labelledby="models-title">
            <div className="panel__head">
              <h2 className="panel__title" id="models-title">
                1 · Models
                <span
                  className="hint"
                  title="Same task, wildly different bills. Comparing before you build is the highest-leverage cost decision there is."
                >
                  ?
                </span>
              </h2>
            </div>
            <div className="panel__body">
              <input
                className="search-input"
                type="search"
                value={search}
                placeholder={`Search ${catalog.models.length} models · ${catalog.providers.length} providers…`}
                aria-label="Search models"
                onChange={(event) => onSearch(event.target.value)}
              />
              <div className="model-list" role="group" aria-label="Available models">
                {groups.map((group) => (
                  <div key={group.provider.id}>
                    <div className="model-group">
                      <span>{group.provider.name}</span>
                      <span>{group.provider.country}</span>
                    </div>
                    {group.models.map((model) => {
                      const checked = scenario.modelIds.includes(model.id);
                      return (
                        <label className="model-row" key={model.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const result = estimator.toggleModel(model.id);
                              if (!result.ok && result.reason) onToast(result.reason);
                            }}
                          />
                          <span className="model-row__name">{model.displayName}</span>
                          {model.pricing.intro && <span className="badge badge--intro">INTRO</span>}
                          {model.provenance.needsReview && (
                            <span className="badge badge--review" title={model.provenance.reviewNote}>
                              CHECK
                            </span>
                          )}
                          <span className="model-row__rate">
                            ${model.pricing.input} / ${model.pricing.output}
                          </span>
                        </label>
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
                <span
                  className="hint"
                  title="Describe a single typical exchange. Scale, comparison and margin all multiply out from this."
                >
                  ?
                </span>
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
                  model&apos;s cost update live as you type.
                </span>
              </p>

              {(Object.keys(FIELD_COPY) as FieldKey[]).map((key) => {
                const copy = FIELD_COPY[key];
                const state = fields[key];
                const count = fieldTokenCount(state, scenario[copy.scenarioKey], primaryModel);
                return (
                  <div className="field" key={key}>
                    <div className="field__label">
                      <label htmlFor={`field-${key}`}>{copy.label}</label>
                      <span className="field__controls">
                        <span
                          className={`field__value mono${count.estimated ? ' field__value--estimate' : ''}`}
                        >
                          {count.estimated ? '≈ ' : ''}
                          {formatTokens(count.tokens)}
                          {count.estimated ? ' · est' : ''}
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
                            aria-pressed={state.mode === 'paste'}
                            onClick={() => estimator.setFieldMode(key, 'paste')}
                          >
                            Paste text
                          </button>
                        </span>
                      </span>
                    </div>
                    {state.mode === 'slider' ? (
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
                        placeholder={copy.placeholder}
                        onChange={(event) => estimator.setFieldText(key, event.target.value)}
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

              <details className="advanced">
                <summary>Advanced assumptions</summary>
                <div className="check-row">
                  <input
                    id="cache-toggle"
                    type="checkbox"
                    checked={scenario.cachedInputShare > 0}
                    onChange={(event) =>
                      estimator.updateNumber('cachedInputShare', event.target.checked ? 0.6 : 0)
                    }
                  />
                  <div>
                    <label htmlFor="cache-toggle">
                      Assume <b>60%</b> of input is served from prompt cache{' '}
                      <span className="tag-assumption">ASSUMPTION</span>
                    </label>
                    <p className="field__note">
                      Realistic for a chat app with a stable system prompt. Uses each provider&apos;s
                      published cached rate where one exists.
                    </p>
                  </div>
                </div>
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
                <span
                  className="hint"
                  title="A cost that looks free per request can be a five-figure line item per month."
                >
                  ?
                </span>
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
                <span className="sync-chip">
                  PRICES SYNCED ✓ {catalog.generatedAt.toISOString().slice(0, 10)}
                </span>
              </h2>
            </div>
            <CostCards
              rows={rows}
              catalog={catalog}
              cacheEnabled={scenario.cachedInputShare > 0}
              conversationsPerMonth={conversationsPerMonth}
            />
            {rows.length > 1 && <SavingsCallout rows={rows} />}
          </section>

          <section className="panel" aria-labelledby="insights-title">
            <div className="panel__head">
              <h2 className="panel__title" id="insights-title">
                Why these numbers
                <span
                  className="hint"
                  title="Live diagnosis of your scenario — which dial is actually driving the bill."
                >
                  ?
                </span>
              </h2>
            </div>
            <InsightList insights={insights} />
            <AssumptionList rows={rows} />
          </section>

          <div className="actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(window.location.href)
                  .then(() => onToast('Scenario link copied — it restores every input'))
                  .catch(() => onToast('Copy the address bar to share this scenario'));
              }}
            >
              Share scenario
            </button>
            <button type="button" className="button" onClick={() => downloadCsv(rows, onToast)}>
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

function downloadCsv(rows: ReturnType<typeof useEstimator>['rows'], onToast: (message: string) => void) {
  if (rows.length === 0) return;
  const header = [
    'model',
    'provider_id',
    'input_per_1m',
    'output_per_1m',
    'input_tokens_per_conversation',
    'output_tokens_per_conversation',
    'cost_per_conversation',
    'cost_per_month',
    'cost_per_year',
    'cost_per_user',
    'margin',
  ];
  const lines = rows.map((row) =>
    [
      `"${row.model.displayName}"`,
      row.model.providerId,
      row.model.pricing.input,
      row.model.pricing.output,
      Math.round(row.breakdown.inputTokens),
      Math.round(row.breakdown.outputTokens),
      row.scaled.perConversation.toFixed(6),
      row.scaled.perMonth.toFixed(2),
      row.scaled.perYear.toFixed(2),
      row.scaled.costPerUser.toFixed(4),
      row.scaled.margin === null ? '' : row.scaled.margin.toFixed(4),
    ].join(','),
  );

  const blob = new Blob([`${header.join(',')}\n${lines.join('\n')}\n`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tokentally-estimate.csv';
  link.click();
  URL.revokeObjectURL(url);
  onToast('CSV downloaded');
}
