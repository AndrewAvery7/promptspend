import { useEffect, useMemo, useRef, useState } from 'react';
import { HEALTH_URL, PRICING_SCOPE, PRICING_URL } from '@/config';
import { loadCatalog, type Catalog } from '@/lib/pricing/catalog';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Ticker } from '@/components/Ticker';
import { useAppearance } from '@/state/useAppearance';
import { ReceiptObject } from './ReceiptObject';
import { ShareReceiptBuilder, dispatchReceiptEvent } from './ShareReceiptBuilder';
import { RECEIPT_INSTRUCTIONS_URL, RECEIPT_SPEC_URL, renderReceiptInstructions } from './receiptSpec';

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
    dispatchReceiptEvent(copied ? 'instructions_copied' : 'instructions_copy_failed');
    setCopyState(copied ? 'copied' : 'failed');
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 3200);
  };

  return (
    <>
      <a className="receipt-skip-link" href="#receipt-main">
        Skip to main content
      </a>
      {/* The same freshness strip the calculator runs above its header. The
          calculator waits for the catalog before it renders anything, so it can
          mount the tape directly; this page renders straight away, so an empty
          lane holds the strip's height until the figures arrive rather than
          letting the whole page jump down when they do. */}
      {catalogState.status === 'ready' ? (
        <Ticker catalog={catalogState.catalog} />
      ) : __PS_TICKER_HTML__ ? (
        // The tape as it stood at build time, drawn from the same component, so
        // it is on screen with the rest of the page and not a beat after it.
        <div dangerouslySetInnerHTML={{ __html: __PS_TICKER_HTML__ }} />
      ) : (
        <div className="ticker" aria-hidden="true">
          <div className="ticker__lane ticker__lane--idle">
            <span className="ticker__item">&nbsp;</span>
          </div>
        </div>
      )}
      {/* The calculator's own header, whole: the same six links, search, Apps,
          Guided tour, appearance controls and freshness line (Andrew,
          2026-10-24; first the nav, 2026-09-05). Its views are links into the
          calculator, which honours `/#compare` and the others. */}
      <SiteHeader
        base={import.meta.env.BASE_URL}
        current="receipt"
        appearance={appearance}
        catalog={catalogState.status === 'ready' ? catalogState.catalog : null}
        freshness={
          catalogState.status === 'ready'
            ? {
                pricesChangedOn: catalogState.catalog.pricesLastChanged(),
                sourcesCheckedOn: catalogState.catalog.sourcesLastChecked(),
                degraded: catalogState.catalog.health?.outcome === 'degraded',
              }
            : __PS_FRESHNESS__
        }
      />

      <main id="receipt-main">
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

        <section className="receipt-section receipt-video" aria-labelledby="video-title">
          <div className="receipt-section__heading">
            <div>
              <p className="receipt-eyebrow">SEVENTY SECONDS</p>
              <h2 id="video-title">Watch it run on a real conversation.</h2>
            </div>
          </div>
          <p className="receipt-video__intro">
            A real Claude conversation, the Receipt pasted in, and the reply it gave, line by line. Every
            figure on screen is the assistant&apos;s own; nothing is mocked.
          </p>
          <video
            className="receipt-video__player"
            controls
            preload="none"
            playsInline
            width={1920}
            height={1080}
            poster={`${import.meta.env.BASE_URL}receipt/video-poster.png`}
          >
            <source src={`${import.meta.env.BASE_URL}receipt/promptspend-receipt.mp4`} type="video/mp4" />
            <track
              kind="captions"
              srcLang="en"
              label="English"
              src={`${import.meta.env.BASE_URL}receipt/promptspend-receipt.en.vtt`}
              default
            />
            Your browser cannot play this video. Download it: promptspend.com/receipt/promptspend-receipt.mp4
          </video>
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

        <ShareReceiptBuilder />

        <section className="receipt-section receipt-section--split" aria-labelledby="examples-title">
          <div>
            <p className="receipt-eyebrow">PROMPTSPEND IT</p>
            <h2 id="examples-title">A cost check, wherever the work already is.</h2>
            <p>
              “PromptSpend It” means bringing a visible, temporary cost-audit request into the
              conversation—not handing control to a hidden agent.
            </p>
          </div>
          <div className="receipt-examples">
            <p>
              <b>Long research thread?</b> PromptSpend the accumulated context.
            </p>
            <p>
              <b>Choosing a model?</b> PromptSpend the same evidenced workload before you switch.
            </p>
            <p>
              <b>Sharing a surprising result?</b> Export the reviewed receipt, with the estimate caveat
              intact.
            </p>
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
              The instruction applies to one response. Anything you paste still remains in that
              assistant&apos;s conversation under its provider&apos;s normal privacy and retention settings.
            </p>
            <p>
              {PRICING_SCOPE} Current list price does not prove equal capability, output quality, or total
              operating cost.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter
        catalog={catalogState.status === 'ready' ? catalogState.catalog : null}
        theme={appearance.theme}
      />
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
