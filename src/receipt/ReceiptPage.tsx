import { useEffect, useMemo, useRef, useState } from 'react';
import { HEALTH_URL, PRICING_SCOPE, PRICING_URL } from '@/config';
import { loadCatalog, type Catalog } from '@/lib/pricing/catalog';
import { useAppearance } from '@/state/useAppearance';
import { ReceiptObject } from './ReceiptObject';
import {
  PRICING_API_URL,
  RECEIPT_INSTRUCTIONS_URL,
  RECEIPT_SPEC_URL,
  renderReceiptInstructions,
} from './receiptSpec';

type CatalogState =
  { status: 'loading' } | { status: 'ready'; catalog: Catalog } | { status: 'error'; message: string };

type CopyState = 'idle' | 'copied' | 'failed';

export async function copyReceipt(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue to the visible-text fallback below.
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.className = 'receipt-copy-fallback';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

export function ReceiptPage() {
  const appearance = useAppearance();
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: 'loading' });
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimer = useRef<number | null>(null);
  const instructions = useMemo(() => renderReceiptInstructions(), []);

  useEffect(() => {
    let cancelled = false;
    loadCatalog(PRICING_URL, HEALTH_URL)
      .then((catalog) => {
        if (!cancelled) setCatalogState({ status: 'ready', catalog });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setCatalogState({
            status: 'error',
            message: cause instanceof Error ? cause.message : 'Pricing evidence could not be loaded.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    const copied = await copyReceipt(instructions);
    setCopyState(copied ? 'copied' : 'failed');
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 3200);
  };

  return (
    <>
      <header className="receipt-header">
        <a
          className="receipt-header__brand"
          href={import.meta.env.BASE_URL}
          aria-label="PromptSpend calculator"
        >
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="23" height="23" rx="6" stroke="currentColor" strokeWidth="2" />
            <path
              d="M7 9.5h12M7 13.5h8M7 17.5h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>
            Prompt<strong>Spend</strong>
          </span>
        </a>
        <nav aria-label="Receipt page">
          <a href={import.meta.env.BASE_URL}>Calculator</a>
          <a href={PRICING_API_URL}>Pricing API</a>
          <button
            type="button"
            className="receipt-header__theme"
            onClick={appearance.toggleTheme}
            aria-label={appearance.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {appearance.theme === 'light' ? 'Dark' : 'Light'} mode
          </button>
        </nav>
      </header>

      <main>
        <section className="receipt-hero" aria-labelledby="receipt-heading">
          <div className="receipt-hero__copy">
            <p className="receipt-eyebrow">PROMPTSPEND RECEIPT</p>
            <h1 id="receipt-heading">Your prompt has a price tag.</h1>
            <p className="receipt-hero__lead">
              Most AI won&apos;t tell you what it is. PromptSpend will. Copy this visible receipt into the
              conversation you want audited.
            </p>
            <ol className="receipt-steps">
              <li>
                <span>1</span>
                <p>
                  <b>Copy the receipt.</b> Read every instruction first—nothing is concealed.
                </p>
              </li>
              <li>
                <span>2</span>
                <p>
                  <b>Paste it after your conversation.</b> The assistant reviews only the visible exchange
                  before it.
                </p>
              </li>
              <li>
                <span>3</span>
                <p>
                  <b>Get an honest estimate.</b> Unknown model, hidden usage, or unavailable pricing stays
                  unknown.
                </p>
              </li>
            </ol>

            <CatalogStatus state={catalogState} />
          </div>

          <div className="receipt-hero__object">
            <ReceiptObject onCopy={() => void handleCopy()} copyState={copyState} />
            <p
              className={`receipt-copy-status${copyState === 'failed' ? ' receipt-copy-status--error' : ''}`}
              role={copyState === 'failed' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {copyState === 'copied' &&
                'Copied. Paste it into ChatGPT, Claude, Gemini, or another assistant.'}
              {copyState === 'failed' &&
                'Clipboard access failed. Select and copy the visible instructions below.'}
            </p>
          </div>
        </section>

        <section className="receipt-section receipt-section--split" aria-labelledby="audit-title">
          <div>
            <p className="receipt-eyebrow">ONE NARROW TASK</p>
            <h2 id="audit-title">What the AI will check</h2>
            <p>
              The Receipt reconstructs visible conversation workload, resolves the model only when evidence
              supports it, and uses current PromptSpend pricing. It returns a range when billed usage is not
              visible.
            </p>
          </div>
          <ul className="receipt-checks" role="list">
            <li>Visible turns and cumulative input/output token ranges</li>
            <li>Current-model cost or the exact limitation blocking it</li>
            <li>The two largest evidenced cost drivers</li>
            <li>Lower-cost candidates worth testing—not promises of equal quality</li>
          </ul>
        </section>

        <section className="receipt-section" aria-labelledby="instructions-title">
          <div className="receipt-section__heading">
            <div>
              <p className="receipt-eyebrow">NOTHING HIDDEN</p>
              <h2 id="instructions-title">The exact text you copy</h2>
            </div>
            <button type="button" className="receipt-secondary-copy" onClick={() => void handleCopy()}>
              {copyState === 'copied' ? 'Copied' : 'Copy instructions'}
            </button>
          </div>
          <p>
            This is the complete object. You can inspect, select, edit, or decline it before anything enters
            your AI conversation.
          </p>
          <pre className="receipt-instructions" tabIndex={0}>
            {instructions}
          </pre>
          <div className="receipt-machine-links">
            <a href={RECEIPT_SPEC_URL}>Machine-readable specification</a>
            <a href={RECEIPT_INSTRUCTIONS_URL}>Plain-text instructions</a>
          </div>
        </section>

        <section className="receipt-section receipt-limitations" aria-labelledby="limits-title">
          <div>
            <p className="receipt-eyebrow">THE HONEST EDGE</p>
            <h2 id="limits-title">Estimate, not invoice</h2>
          </div>
          <div>
            <p>
              Assistants normally cannot see hidden system prompts, provider-side tool or media charges, cache
              usage, or hidden reasoning tokens. The Receipt makes those exclusions explicit instead of
              inventing precision.
            </p>
            <p>
              {PRICING_SCOPE} Current list price does not prove equal capability, output quality, or total
              operating cost.
            </p>
          </div>
        </section>
      </main>

      <footer className="receipt-footer">
        <span>PromptSpend · open source · no accounts · no tracking</span>
        <a href="https://github.com/AndrewAvery7/promptspend">Source on GitHub</a>
      </footer>
    </>
  );
}

function CatalogStatus({ state }: { state: CatalogState }) {
  if (state.status === 'loading') {
    return (
      <p className="receipt-catalog-status" role="status">
        <span className="receipt-status-dot" /> Checking PromptSpend&apos;s current pricing evidence…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="receipt-catalog-status receipt-catalog-status--error" role="alert">
        <span className="receipt-status-dot" />
        <span>
          <b>Price source unavailable here.</b> {state.message} The Receipt still copies, but the assistant
          must not quote a dollar cost unless it can reach PromptSpend itself.
        </span>
      </div>
    );
  }

  const freshness = state.catalog.freshness();
  const checked = state.catalog.sourcesLastChecked();
  const flagged = state.catalog.primaryModels.filter((model) => model.provenance.needsReview).length;
  const stale = freshness.level === 'stale';

  return (
    <div className={`receipt-catalog-status${stale ? ' receipt-catalog-status--error' : ''}`} role="status">
      <span className="receipt-status-dot" />
      <span>
        <b>{stale ? 'Pricing evidence is stale.' : 'Pricing source ready.'}</b>{' '}
        {state.catalog.primaryModels.length} models · sources checked {checked ?? 'date unavailable'} ·{' '}
        {flagged} {flagged === 1 ? 'price needs' : 'prices need'} review.
      </span>
    </div>
  );
}
