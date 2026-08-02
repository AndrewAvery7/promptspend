import type { Catalog } from '@/lib/pricing/catalog';
import { PRICING_SCOPE, REPO_URL } from '@/config';

export function DataView({ catalog }: { catalog: Catalog }) {
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
                <span className="health-grid__value mono">{catalog.pricesLastChanged()}</span>
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
            {/* Two of these were enabled controls that did nothing but explain
                they did nothing, and one of them collected an email address it
                could not subscribe. A planned feature is described, not
                simulated. */}
            <div className="alert-grid">
              <article className="alert-option">
                <h4>
                  <FeedIcon />
                  Commit feed
                </h4>
                <p>
                  Every change to the catalog is a commit to one file, and GitHub publishes an Atom feed of
                  those. Point a reader at it and you hear about a price change the morning it lands.
                </p>
                <a className="alert-tag" href={`${REPO_URL}/commits/main/public/data/pricing.json.atom`}>
                  AVAILABLE NOW ↗
                </a>
              </article>

              <article className="alert-option">
                <h4>
                  <GitHubIcon />
                  Watch the repository
                </h4>
                <p>
                  Watch <code>token-tally</code> for pull requests and you will see every pricing change a
                  human had to review before it went live.
                </p>
                <a className="alert-tag" href={REPO_URL}>
                  AVAILABLE NOW ↗
                </a>
              </article>

              <article className="alert-option alert-option--planned">
                <h4>
                  <BellIcon />
                  Browser push
                </h4>
                <p>
                  Watch specific models and get a push the moment one changes — no email, no phone number,
                  nothing personal stored.
                </p>
                <span className="alert-tag alert-tag--planned">PLANNED — NOT BUILT YET</span>
              </article>

              <article className="alert-option alert-option--planned">
                <h4>
                  <MailIcon />
                  Email digest
                </h4>
                <p>
                  A weekly “what changed in LLM pricing”, or instant alerts for the models you follow. Double
                  opt-in, one-click out.
                </p>
                <span className="alert-tag alert-tag--planned">PLANNED — NOT BUILT YET</span>
              </article>
            </div>
            <p className="privacy-note">
              The two planned options are described here so you know where this is going, and marked so you
              are not invited to enter an address into a form that cannot subscribe it. No SMS is planned:
              per-message costs and phone-number collection do not fit a free, privacy-first tool, and push
              already covers “tell me instantly, on my phone”. There is no analytics on this site.
            </p>
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
function BellIcon() {
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
      <path d="M12 2a7 7 0 0 0-7 7c0 5-2 6-2 6h18s-2-1-2-6a7 7 0 0 0-7-7zM10.5 20a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}
function MailIcon() {
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
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 6L2 7" />
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
