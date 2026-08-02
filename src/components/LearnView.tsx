import { useEffect, useState } from 'react';
import type { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { LEARN_MODULES } from '@/content/learn';
import { countTokens, estimateForModel, type TokenCount } from '@/lib/tokenize';
import { formatCount } from '@/lib/engine/format';

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
    </section>
  );
}

/**
 * The interactive proof of lesson 01: paste anything and watch three model
 * families disagree about how many tokens it is.
 */
function TokenLab({ catalog }: { catalog: Catalog }) {
  const [text, setText] = useState(SAMPLE);

  const samples = pickSampleModels(catalog);
  const [counts, setCounts] = useState<Record<string, TokenCount>>({});

  useEffect(() => {
    let cancelled = false;
    // Show a synchronous estimate immediately, then upgrade to the real count
    // for any family whose tokenizer we can run in the browser.
    setCounts(Object.fromEntries(samples.map((model) => [model.id, estimateForModel(text, model)])));
    void Promise.all(
      samples.map(async (model) => {
        const result = await countTokens(text, model);
        if (!cancelled) setCounts((prev) => ({ ...prev, [model.id]: result }));
      }),
    );
    return () => {
      cancelled = true;
    };
    // `samples` is derived from the catalog and stable for a given catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, catalog]);

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
      <textarea id="token-lab-input" value={text} onChange={(event) => setText(event.target.value)} />
      <div className="token-grid">
        {samples.map((model) => {
          const count = counts[model.id];
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
