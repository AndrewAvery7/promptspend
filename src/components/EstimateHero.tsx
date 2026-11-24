import type { Catalog } from '@/lib/pricing/catalog';
import { Provenance } from './Provenance';
import { jumpTo } from './jumpTo';

/**
 * The top of the estimator: headline, the two calls to action and the
 * "where you work" aside.
 *
 * Its own component so the build can draw it into the homepage's HTML
 * (scripts/build-chrome-data.ts, `HomeShell`), and the page shows it before any
 * script has run: on a phone the headline used to wait for the app's code and
 * the price list, about 3 s on Google's phone test. The app shows the same
 * markup while it loads and then this component, so nothing moves. That is why
 * it takes `base` as a prop rather than importing `@/config`, which reads
 * `import.meta.env` and cannot be loaded by the build script.
 */
export function EstimateHero({
  base,
  catalog,
  onOpenData,
}: {
  /** The site's base path with its trailing slash (`/` on promptspend.com). */
  base: string;
  catalog: Catalog;
  onOpenData: () => void;
}) {
  return (
    <div className="hero">
      <div className="hero__copy">
        <p className="eyebrow">Estimate</p>
        <h1 className="headline" id="estimate-heading">
          Know your AI API bill <em className="headline__lean">before</em> you ship to production.
        </h1>
        <p className="subhead">
          Paste your real prompt or sketch the workload, pick up to four models, and see every model&apos;s
          bill side by side — at your scale, from prices re-checked every morning.
        </p>
        {/* The page's one filled button, and it is the estimate. It used to be
              the Receipt link in the aside, which audits a chat somebody has
              already had — a different product — so the loudest thing on the
              estimator's own page led away from the estimator.

              An anchor, so it still works before the script has run or if it
              fails; the click handler takes over to move focus as well as the
              scroll, and to skip the smooth scroll for reduced motion. The
              target is step 1's heading, which `.panel__title`'s
              scroll-margin keeps clear of the sticky header. */}
        <p className="hero__cta">
          <a
            className="button button--primary hero__estimate-cta"
            href="#panel-models"
            onClick={(event) => {
              if (jumpTo('models-title')) event.preventDefault();
            }}
          >
            Estimate my cost
          </a>
        </p>
        <p className="subhead hero__free-tiers">
          {/* Andrew's wording, 2026-11-11: the question stays plain text and only
                the answer is the link to the free-tier comparison. */}
          Which AI models should you try first?{' '}
          <a href={`${base}free-tiers/`}>See which LLMs have a free tier</a>.
        </p>
        <Provenance catalog={catalog} onOpenData={onOpenData} />
      </div>
      <aside className="hero__aside" aria-labelledby="hero-aside-title">
        <p className="hero__aside-eyebrow">Beyond the browser</p>
        <h2 className="hero__aside-title" id="hero-aside-title">
          The same numbers, where you work
        </h2>
        <p>The same prices, carrying the same source and confirmation date, are also here:</p>
        {/* A list of what exists, not a menu of commands.

              This box used to hold one install command — the MCP server's — which
              made it an advert for one of four things and a place to copy from
              for none of the others. Every install route now lives together on
              Data & Alerts, where there is room to give each a command, a link
              and the reason to pick it. The job here is to tell somebody who
              never leaves this page that the others exist at all.

              `role="list"` because `list-style: none` strips list semantics in
              Safari, and a list is worth announcing as one. */}
        <ul className="hero__aside-list" role="list">
          {/* First because it is the one route here that needs no editor,
                terminal or AI assistant — and it is the permanent way back to
                the apps once the launch banner has been dismissed. */}
          <li>
            <b>iPhone &amp; Android apps</b> — the estimator in your pocket,{' '}
            <a href={`${base}app/`}>free on both stores</a>
          </li>
          <li>
            <b>AI Cost Receipt</b> — bring current PromptSpend pricing into an existing AI conversation
          </li>
          <li>
            <b>MCP server</b> — for Claude Code, Cursor and Windsurf
          </li>
          <li>
            <b>VS&nbsp;Code extension</b> — the rate on the line of code that names the model
          </li>
          <li>
            <b>Open VSX</b> — the same extension, for Cursor, Windsurf and VSCodium
          </li>
          <li>
            <b>Pricing API</b> — keyless and CORS-open, as JSON or CSV
          </li>
        </ul>
        {/* Filled blue like "Estimate my cost" at Andrew's request
              (2026-11-11): the two columns read as a matched pair. The label
              says what the Receipt does in the visitor's words, since
              "PromptSpend this conversation" only made sense to someone who
              already knew. */}
        <a className="button button--primary hero__receipt-cta" href={`${base}receipt/`}>
          Price an AI chat you&apos;ve already had
        </a>
        <p className="hero__aside-note">
          <button type="button" className="linklike" onClick={onOpenData}>
            How to install each &rarr;
          </button>
        </p>
      </aside>
    </div>
  );
}
