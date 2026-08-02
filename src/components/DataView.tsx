import type { Catalog } from '@/lib/pricing/catalog';
import { REPO_URL } from '@/config';

export function DataView({ catalog, onToast }: { catalog: Catalog; onToast: (message: string) => void }) {
  const flagged = catalog.models.filter((model) => model.provenance.needsReview);
  const vendorVerified = catalog.models.filter((model) => model.provenance.source === 'vendor');

  return (
    <section aria-labelledby="data-heading">
      <p className="eyebrow">Data &amp; Alerts</p>
      <h1 className="headline" id="data-heading">
        Every number shows its work.
      </h1>
      <p className="subhead">
        A price you cannot trace is a price you cannot trust. Every model carries its source and the date it
        was last confirmed, every change lands in a public changelog — and you can have that changelog come to
        you.
      </p>

      <div className="data-grid">
        <section className="panel span-2" aria-labelledby="alerts-title">
          <div className="panel__head">
            <h2 className="panel__title" id="alerts-title">
              Price alerts — hear it first
            </h2>
          </div>
          <div className="panel__body">
            <div className="alert-grid">
              <article className="alert-option">
                <h4>
                  <FeedIcon />
                  RSS / Atom feed
                </h4>
                <p>Every price change and new model, in your reader the morning it lands.</p>
                <a className="alert-tag" href={`${REPO_URL}/commits/main/public/data/pricing.json.atom`}>
                  LIVE AT LAUNCH
                </a>
              </article>

              <article className="alert-option">
                <h4>
                  <BellIcon />
                  Browser push
                </h4>
                <p>
                  Watch specific models and get a push the moment one changes. No email, no phone number —
                  nothing personal is stored.
                </p>
                <button
                  type="button"
                  className="action-button"
                  onClick={() =>
                    onToast('Push alerts ship with the alerts milestone — the RSS feed works today')
                  }
                >
                  Enable push
                </button>
              </article>

              <article className="alert-option">
                <h4>
                  <MailIcon />
                  Email digest
                </h4>
                <p>
                  A weekly “what changed in LLM pricing”, or instant alerts for the models you follow. Double
                  opt-in, one-click out.
                </p>
                <form
                  className="email-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onToast('Email alerts ship with the alerts milestone — subscribe to the feed meanwhile');
                  }}
                >
                  <label className="visually-hidden" htmlFor="alert-email">
                    Email address for price alerts
                  </label>
                  <input id="alert-email" type="email" placeholder="you@example.com" required />
                  <button type="submit" className="action-button" style={{ marginTop: 0 }}>
                    Notify me
                  </button>
                </form>
              </article>

              <article className="alert-option">
                <h4>
                  <GitHubIcon />
                  GitHub Watch
                </h4>
                <p>
                  Notable changes are published as releases — watch the repository and get notified where you
                  already work.
                </p>
                <a className="alert-tag" href={REPO_URL}>
                  LIVE AT LAUNCH
                </a>
              </article>
            </div>
            <p className="privacy-note">
              No SMS: per-message costs and phone-number collection do not fit a free, privacy-first tool, and
              browser push already covers “tell me instantly, on my phone”. The email list would store your
              address and the models you follow, and nothing else. There is no analytics on this site.
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
                  <b>OpenRouter</b> — an independent cross-check, never a source of record. A disagreement
                  beyond 20% flags the model instead of publishing quietly.
                </div>
              </li>
              <li>
                <div>
                  <b>Sanity rules</b> — schema validation, non-negative rates, and any single-day move beyond
                  50% held back for a human to approve.
                </div>
              </li>
            </ol>
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
            <p style={{ marginTop: 10 }}>
              Flagged models are still shown with the more conservative source, and the badge follows them
              everywhere. Missing a model?{' '}
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
