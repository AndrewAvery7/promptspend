import { useEffect, useMemo, useState } from 'react';
import type { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { LEARN_MODULES } from '@/content/learn';
import { countTokens, estimateForModel, type TokenCount } from '@/lib/tokenize';
import { formatCount } from '@/lib/engine/format';
import { MAX_PASTE_CHARS } from '@/state/useEstimator';

const SAMPLE =
  'Compare the cost of running this prompt on GPT-5.4, Claude Sonnet 5, and DeepSeek V3.2 at one million requests per month.';

export function LearnView({ catalog }: { catalog: Catalog }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section aria-labelledby="learn-heading">
      <p className="eyebrow">Learn</p>
      <h1 className="headline" id="learn-heading">
        Seven lessons that pay for themselves.
      </h1>
      <p className="subhead">
        Each one is a single idea, the number that proves it, and what to do about it — whether you are a
        developer, a product manager, a founder or a student.
      </p>

      <div className="learn-grid">
        <TokenLab catalog={catalog} />
        {LEARN_MODULES.map((module) => {
          const expanded = open === module.id;
          return (
            <button
              type="button"
              className="learn-card"
              key={module.id}
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : module.id)}
            >
              <span className="learn-card__num">{module.number}</span>
              <h3>{module.title}</h3>
              <p>{module.teaser}</p>
              {expanded && (
                <div className="learn-card__body">
                  {module.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                  ))}
                </div>
              )}
              <div className="learn-card__meta">
                <span>{module.minutes} min</span>
                <span>{module.kind}</span>
                <span>{expanded ? 'click to collapse' : 'click to read'}</span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="learn-further">
        Further reading:{' '}
        <a href="https://promptspend.com/writing/what-llm-cost-calculators-get-wrong/">
          What LLM Cost Calculators Get Wrong
        </a>{' '}
        — nine ways the number on screen can disagree with the invoice, and how this one tries not to.{' '}
        <a href="https://promptspend.com/writing/2026-08-price-movement-report/">
          August 2026 Price Movement Report
        </a>{' '}
        — every price change our sync recorded last month, led by DeepSeek's overnight repricing of V4.
      </p>
    </section>
  );
}

/**
 * The interactive proof of lesson 01: paste anything and watch three model
 * families disagree about how many tokens it is.
 */
function TokenLab({ catalog }: { catalog: Catalog }) {
  const [text, setText] = useState(SAMPLE);

  const samples = useMemo(() => pickSampleModels(catalog), [catalog]);

  /**
   * Two counts per model, and only one of them is state.
   *
   * The estimate is cheap arithmetic, so it is *derived* on every keystroke and
   * the number never stalls. The real tokenizer is expensive — running it per
   * character re-encoded the whole sample on every key — so it waits for a
   * pause in typing, and only its result needs to survive a render.
   *
   * The measurement carries the text it was taken from. Without that, a fresh
   * keystroke would keep showing the previous text's exact count until the new
   * one landed: a precise number for a string that is no longer on screen.
   */
  const estimates = useMemo(
    () => Object.fromEntries(samples.map((model) => [model.id, estimateForModel(text, model)])),
    [samples, text],
  );
  const [measured, setMeasured] = useState<{ text: string; counts: Record<string, TokenCount> }>({
    text: '',
    counts: {},
  });

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all(
        samples.map(async (model) => {
          const result = await countTokens(text, model);
          if (!cancelled) {
            setMeasured((prev) => ({
              text,
              counts: { ...(prev.text === text ? prev.counts : {}), [model.id]: result },
            }));
          }
        }),
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, samples]);

  return (
    <div className="token-lab">
      <h3>Try it: the same text is a different token count on every model</h3>
      <p className="token-lab__sub">
        Type or paste below. Tokenizers split text differently, so the “same” prompt is a different size — and
        a different price — before the rates even come into it. Try a sentence of Chinese.
      </p>
      <label className="visually-hidden" htmlFor="token-lab-input">
        Sample text to tokenize
      </label>
      <textarea
        id="token-lab-input"
        value={text}
        maxLength={MAX_PASTE_CHARS}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="token-grid">
        {samples.map((model) => {
          const count =
            (measured.text === text ? measured.counts[model.id] : undefined) ?? estimates[model.id];
          const method = count?.method ?? 'estimate';
          return (
            <div className="token-cell" key={model.id}>
              <div className="token-cell__count mono">
                {method === 'estimate' ? '≈ ' : ''}
                {count ? formatCount(count.tokens) : '—'}
              </div>
              <div className="token-cell__family">{model.displayName}</div>
              <div className={`token-cell__method method--${method}`}>{count?.note ?? ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One model from three different tokenizer families, for contrast. */
function pickSampleModels(catalog: Catalog): Model[] {
  const preferred = ['gpt-5.4', 'claude-sonnet-5', 'deepseek-deepseek-v3.2'];
  const chosen = preferred.map((id) => catalog.get(id)).filter((m): m is Model => m !== undefined);
  if (chosen.length === 3) return chosen;

  const seen = new Set<string>();
  const fallback: Model[] = [];
  for (const model of catalog.models) {
    const key = model.tokenizer.kind === 'tiktoken' ? 'tiktoken' : model.providerId;
    if (seen.has(key)) continue;
    seen.add(key);
    fallback.push(model);
    if (fallback.length === 3) break;
  }
  return fallback;
}
