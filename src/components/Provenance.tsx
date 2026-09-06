import { useEffect, useState } from 'react';
import type { Catalog } from '@/lib/pricing/catalog';

interface ProvenanceProps {
  catalog: Catalog;
  onOpenData: () => void;
}

/**
 * Where each price was read — the hero's evidence block.
 *
 * The four figures that used to sit here as a row of numerals said nothing
 * about how they related. This turns them into one statement: this many
 * models, and here is the split between rows read against the vendor's own
 * page and rows read from a public feed, with the review flags said out loud.
 * It is the project's pitch drawn rather than listed (Andrew, 2026-09-05).
 *
 * Every figure is derived from the catalog on screen. The bar's proportions
 * are computed here, never written down, so a morning that changes the split
 * changes the picture.
 */
export function Provenance({ catalog, onOpenData }: ProvenanceProps) {
  const models = catalog.primaryModels.length;
  const providers = catalog.providers.length;
  const vendor = catalog.vendorVerifiedCount();
  const feed = catalog.feedSourcedCount();
  const flagged = catalog.flaggedForReviewCount();
  const checked = catalog.sourcesLastChecked();
  const vendorPct = models > 0 ? Math.round((vendor / models) * 100) : 0;
  const feedPct = models > 0 ? 100 - vendorPct : 0;

  // The bar grows in on the first paint. Reduced-motion readers get it at
  // full width at once; the global reduced-motion rule zeroes the transition.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setGrown(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <section className="prov" aria-labelledby="prov-title">
      <div className="prov__head">
        <div className="prov__lead">
          <span className="prov__big">{models}</span>
          <span className="prov__lead-text">
            <b>models tracked</b> across {providers} providers
          </span>
        </div>
        <p className="prov__eyebrow" id="prov-title">
          Where each price was read
        </p>
      </div>

      <div
        className="prov__bar"
        role="img"
        aria-label={`${vendor} of ${models} prices read against the vendor's own page, ${feed} read from a public price feed`}
      >
        <span className="prov__seg prov__seg--vendor" style={{ width: grown ? `${vendorPct}%` : '0%' }} />
        <span className="prov__seg prov__seg--feed" style={{ width: grown ? `${feedPct}%` : '0%' }} />
      </div>

      <dl className="prov__legend">
        <div className="prov__key prov__key--vendor">
          <dt>
            <b>{vendor}</b> read against the vendor&apos;s own page
          </dt>
          <dd>{vendorPct}%</dd>
        </div>
        <div className="prov__key prov__key--feed">
          <dt>
            <b>{feed}</b> read from a public price feed
          </dt>
          <dd>{feedPct}%</dd>
        </div>
      </dl>

      {/* `role="list"` because `list-style: none` strips list semantics in Safari. */}
      <ul className="prov__facts" role="list">
        <li className="prov__fact--warn">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <span>
            <b>{flagged}</b> prices flagged for review today. Two sources disagree, and the row says so.
          </span>
        </li>
        <li>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span>
            <b>0</b> accounts, trackers or cookies.
          </span>
        </li>
        <li>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 3v6h-6" />
          </svg>
          <span>Re-checked every morning{checked ? `, last on ${checked}.` : '.'}</span>
        </li>
      </ul>

      <p className="prov__more">
        <button type="button" className="linklike" onClick={onOpenData}>
          See how every price is checked &rarr;
        </button>
      </p>
    </section>
  );
}
