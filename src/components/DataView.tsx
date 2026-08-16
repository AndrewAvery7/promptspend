import type { Catalog } from '@/lib/pricing/catalog';
import {
  DEVELOPER_HUB_URL,
  MCP_INSTALL_COMMAND,
  MCP_PACKAGE_URL,
  OPEN_VSX_URL,
  PRICING_SCOPE,
  REPO_URL,
  VSCODE_INSTALL_COMMAND,
  VSCODE_MARKETPLACE_URL,
} from '@/config';
import { AlertsPanel } from '@/components/AlertsPanel';
import { CopyButton } from './CopyButton';

/** GitHub's Atom feed of commits touching the published catalog. */
const FEED_URL = `${REPO_URL}/commits/main/public/data/pricing.json.atom`;

interface DataViewProps {
  catalog: Catalog;
  theme: 'light' | 'dark';
  onToast: (message: string) => void;
}

export function DataView({ catalog, theme, onToast }: DataViewProps) {
  const flagged = catalog.models.filter((model) => model.provenance.needsReview);
  const vendorVerified = catalog.models.filter((model) => model.provenance.source === 'vendor');
  const health = catalog.health;

  return (
    <section aria-labelledby="data-heading">
      <p className="eyebrow">Data &amp; Alerts</p>
      <h1 className="headline" id="data-heading">
        Every number shows its work.
      </h1>
      <p className="subhead">
        A price you cannot trace is a price you cannot trust. Every model carries its source, a link to the
        page that source came from, and the date it was last confirmed — and every change lands in a public
        changelog.
      </p>

      <div className="data-grid">
        <section className="panel span-2" aria-labelledby="health-title">
          <div className="panel__head">
            <h2 className="panel__title" id="health-title">
              Pipeline health
            </h2>
          </div>
          <div className="panel__body">
            {/* Two dates, because they answer two questions. A single "synced"
                date could not distinguish "prices are stable" from "the job
                stopped running a fortnight ago". */}
            <div className="health-grid">
              <div>
                <span className="health-grid__label">Prices last changed</span>
                <span className="health-grid__value mono">
                  {catalog.pricesLastChanged() ?? 'No price change recorded since tracking began'}
                </span>
              </div>
              <div>
                <span className="health-grid__label">Sources last checked cleanly</span>
                <span className="health-grid__value mono">
                  {catalog.sourcesLastChecked() ?? 'not published yet'}
                </span>
              </div>
              <div>
                <span className="health-grid__label">Last run</span>
                <span className="health-grid__value mono">
                  {health ? `${health.attemptedAt.slice(0, 10)} · ${health.outcome}` : 'unknown'}
                </span>
              </div>
              <div>
                <span className="health-grid__label">Models tracked</span>
                <span className="health-grid__value mono">
                  {catalog.primaryModels.length}
                  {catalog.models.length !== catalog.primaryModels.length
                    ? ` (+${catalog.models.length - catalog.primaryModels.length} aliases)`
                    : ''}
                </span>
              </div>
            </div>
            {health?.outcome === 'degraded' && (
              <p className="note note--warn" role="status">
                <span>
                  <b>The last run was degraded and published nothing.</b>{' '}
                  {health.problems.join('; ') || 'A source was unavailable.'} The prices above are the last
                  ones that passed every check.
                </span>
              </p>
            )}
            <p className="privacy-note">
              The full manifest — source revisions, row counts, catalog fingerprint — is a plain JSON file at{' '}
              <code>data/sync-status.json</code>, published on every run whether it succeeded or not.
            </p>
          </div>
        </section>

        <section className="panel span-2" aria-labelledby="alerts-title">
          <div className="panel__head">
            <h2 className="panel__title" id="alerts-title">
              Price alerts
            </h2>
          </div>
          <div className="panel__body">
            {/* The two zero-infrastructure options come first because they cost
                a reader nothing to adopt and cost us nothing to run: no address
                is stored and nothing can silently break. They are passed into
                the panel rather than placed beside it so all three short
                options stack in one column against the email form, which is
                three times their height on its own. */}
            <AlertsPanel catalog={catalog} theme={theme} onToast={onToast}>
              <article className="alert-option">
                <h4>
                  <FeedIcon />
                  Commit feed
                </h4>
                <p>
                  Every change to the catalog is a commit to one file, and GitHub publishes an Atom feed of
                  those. Paste this address into a feed reader — Feedly, NetNewsWire, Thunderbird, Inoreader —
                  and you hear about a price change the morning it lands.
                </p>
                {/* Copy, not open. Opening an Atom feed in a browser shows raw
                    XML, which reads as a page of rubbish and is nobody's goal:
                    the address is meant to be pasted into a reader. The link
                    survives for anyone who does want to look, labelled as what
                    it is rather than as an invitation. */}
                <div className="alert-actions">
                  <button
                    type="button"
                    className="alert-tag alert-tag--button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(FEED_URL)
                        .then(() => onToast('Feed address copied'))
                        .catch(() => onToast('Could not copy — the address is in the link beside this'));
                    }}
                  >
                    COPY FEED ADDRESS
                  </button>
                  <a
                    className="alert-link"
                    href={FEED_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Opens raw XML — this is for a feed reader, not for reading in a browser"
                  >
                    view raw XML ↗
                  </a>
                </div>
              </article>

              <article className="alert-option">
                <h4>
                  <GitHubIcon />
                  Watch the repository
                </h4>
                <p>
                  Watch <code>promptspend</code> for pull requests and you will see every pricing change a
                  human had to review before it went live.
                </p>
                <a className="alert-tag" href={REPO_URL} target="_blank" rel="noreferrer noopener">
                  OPEN ON GITHUB ↗
                </a>
              </article>
            </AlertsPanel>
          </div>
        </section>

        {/*
          The build-on-it panel.

          It sits above the trust ladder deliberately: the ladder explains why
          the numbers are believable, and this is the payoff — the same numbers,
          with the same paperwork, wherever you actually work. A price is only
          worth carrying provenance if the provenance travels with it.
        */}
        <section className="panel span-2" aria-labelledby="build-title">
          <div className="panel__head">
            {/* `tabIndex={-1}` so the hero's "How to install each" link can move
                focus here as well as scroll here. Scrolling alone would leave a
                keyboard user's focus on a button that is now off screen, and
                their next Tab would continue from a place they cannot see. */}
            <h2 className="panel__title" id="build-title" tabIndex={-1}>
              Use it where you work
            </h2>
          </div>
          <div className="panel__body">
            <p>
              Every price here carries its source and the date it was last confirmed. That does not stop at
              this page — the same record travels into your coding agent, through the API, and onto the line
              of code that names the model.
            </p>
            <div className="build-grid">
              <article>
                <h3>In a coding agent</h3>
                <p>
                  An MCP server for Claude Code, Cursor and Windsurf. Three tools; <code>estimate_cost</code>{' '}
                  runs <em>this</em> engine, so it cannot report a number that disagrees with the one above
                  it.
                </p>
                {/* `tabIndex` because this scrolls: `.build-grid pre` is
                    `overflow-x: auto`, and a scrollable box that cannot take
                    focus is one a keyboard user cannot scroll — the end of the
                    command is simply unreachable without a mouse. */}
                <div className="codeblock">
                  <pre className="mono" tabIndex={0}>
                    <code>{MCP_INSTALL_COMMAND}</code>
                  </pre>
                  <CopyButton value={MCP_INSTALL_COMMAND} label="install command" onToast={onToast} />
                </div>
                <p className="privacy-note">
                  Adds ~700 tokens of context per turn — measured, budgeted and published, because a pricing
                  tool that quietly taxes every message would be a poor joke.
                </p>
                {/* Every card ends with somewhere to go. The command suits
                    people who already know they want it; the link is for
                    everyone deciding. */}
                <p className="privacy-note">
                  <a href={MCP_PACKAGE_URL} target="_blank" rel="noreferrer noopener">
                    View on npm →
                  </a>
                </p>
              </article>
              <article>
                <h3>In your own code</h3>
                <p>
                  A free, keyless, CORS-open API. No account, no rate limit, no logging of who calls it. JSON,
                  CSV and OpenAPI 3.1.
                </p>
                {/* `tabIndex` because this scrolls: `.build-grid pre` is
                    `overflow-x: auto`, and a scrollable box that cannot take
                    focus is one a keyboard user cannot scroll — the end of the
                    command is simply unreachable without a mouse. */}
                <div className="codeblock">
                  <pre className="mono" tabIndex={0}>
                    <code>curl {DEVELOPER_HUB_URL}/v1/prices</code>
                  </pre>
                  {/* The sibling command gets one too. A copy button on one box
                      and not the box beside it reads as an oversight. */}
                  <CopyButton
                    value={`curl ${DEVELOPER_HUB_URL}/v1/prices`}
                    label="API command"
                    onToast={onToast}
                  />
                </div>
                <p className="privacy-note">
                  <a href={DEVELOPER_HUB_URL} target="_blank" rel="noreferrer noopener">
                    Developer hub →
                  </a>
                </p>
              </article>
              {/* The third card, and the one this panel's opening sentence had
                  been promising since before it existed: "the same record
                  travels through the API and into your editor", above two cards
                  that were an agent and an API. */}
              <article>
                <h3>In your editor</h3>
                <p>
                  A VS Code extension. The rate sits on the line of code that names the model, and a nearby{' '}
                  <code>max_tokens</code> becomes what one response can cost.
                </p>
                {/* `tabIndex` because this scrolls: `.build-grid pre` is
                    `overflow-x: auto`, and a scrollable box that cannot take
                    focus is one a keyboard user cannot scroll — the end of the
                    command is simply unreachable without a mouse. */}
                <div className="codeblock">
                  <pre className="mono" tabIndex={0}>
                    <code>{VSCODE_INSTALL_COMMAND}</code>
                  </pre>
                  <CopyButton value={VSCODE_INSTALL_COMMAND} label="install command" onToast={onToast} />
                </div>
                <p className="privacy-note">
                  <a href={VSCODE_MARKETPLACE_URL} target="_blank" rel="noreferrer noopener">
                    VS Code Marketplace →
                  </a>
                </p>
                <p className="privacy-note">
                  Or{' '}
                  <a href={OPEN_VSX_URL} target="_blank" rel="noreferrer noopener">
                    Open VSX
                  </a>{' '}
                  for Cursor, Windsurf and VSCodium.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="trust-title">
          <div className="panel__head">
            <h2 className="panel__title" id="trust-title">
              Trust ladder
            </h2>
          </div>
          <div className="panel__body">
            <ol className="trust-list">
              <li>
                <div>
                  <b>Vendor list prices</b> — hand-verified and stored in <code>pricing-overrides.json</code>.
                  They win every conflict. {vendorVerified.length} model
                  {vendorVerified.length === 1 ? '' : 's'} currently carry this mark.
                </div>
              </li>
              <li>
                <div>
                  <b>The LiteLLM community catalog</b> — thousands of models, updated within days of a
                  release. This is the automated daily feed.
                </div>
              </li>
              <li>
                <div>
                  <b>OpenRouter</b> — an independent cross-check, never a source of record. It resells
                  inference, so its prices legitimately differ from first-party list prices; a disagreement
                  beyond 20% therefore <em>flags</em> the model rather than changing it.
                </div>
              </li>
              <li>
                <div>
                  <b>Sanity rules</b> — schema validation, non-negative rates, a single-day move beyond 50%
                  held for a human, a floor on how many rows a source may return, and a cap on how much the
                  catalog may shrink in one run. A run that trips any of them publishes nothing.
                </div>
              </li>
            </ol>
            <p className="privacy-note">{PRICING_SCOPE}</p>
          </div>
        </section>

        <section className="panel" aria-labelledby="flagged-title">
          <div className="panel__head">
            <h2 className="panel__title" id="flagged-title">
              Flagged for review ({flagged.length})
            </h2>
          </div>
          <div className="panel__body sync-log">
            {flagged.length === 0 && <p>Nothing flagged — all sources agree today.</p>}
            {flagged.slice(0, 12).map((model) => (
              <div key={model.id}>
                <span className="sync-log__chg">Δ</span> {model.displayName}{' '}
                <span className="sync-log__date">— {model.provenance.reviewNote}</span>
              </div>
            ))}
            {/* This used to claim flagged rows were shown "with the more
                conservative source", which was simply not what the merge does:
                the primary feed's number stands unless a human overrides it.
                Describing the actual rule is worth more than a comforting one. */}
            <p style={{ marginTop: 10 }}>
              A flagged row is still shown at <b>the primary feed&apos;s number</b> — the cross-check raises a
              hand, it never overwrites. Both figures are in the note above, so you can see the range you are
              choosing inside, and the CHECK badge follows the model everywhere it appears. Rows we have
              confirmed against the vendor&apos;s own page are marked <code>vendor ✓</code> and are never
              flagged by the cross-check.
            </p>
            <p>
              Missing a model?{' '}
              <a href={`${REPO_URL}/issues/new?template=model-request.yml`}>Open a model request</a> — it
              takes about thirty seconds.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

function FeedIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}
