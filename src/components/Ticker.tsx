import type { Catalog } from '@/lib/pricing/catalog';
import { formatRate } from '@/lib/engine/format';

/**
 * The freshness strip. Everything on it is derived from the live catalog, so it
 * cannot drift away from the data underneath.
 */
export function Ticker({ catalog }: { catalog: Catalog }) {
  const items = buildItems(catalog);
  const lane = [...items, ...items];

  return (
    <div className="ticker" aria-label="Recent pricing highlights">
      <div className="ticker__lane">
        {lane.map((item, index) => (
          <span className="ticker__item" key={`${item.key}-${index}`} aria-hidden={index >= items.length}>
            {item.node}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildItems(catalog: Catalog): { key: string; node: React.ReactNode }[] {
  const items: { key: string; node: React.ReactNode }[] = [];
  const spread = catalog.outputSpread();

  const cheapestInput = [...catalog.models]
    .filter((m) => m.pricing.input > 0)
    .sort((a, b) => a.pricing.input - b.pricing.input)[0];

  if (cheapestInput) {
    items.push({
      key: 'cheapest',
      node: (
        <>
          CHEAPEST INPUT TODAY{' '}
          <span className="ticker__dim">
            {cheapestInput.displayName} {formatRate(cheapestInput.pricing.input)}/M
          </span>
        </>
      ),
    });
  }

  if (spread) {
    items.push({
      key: 'spread',
      node: (
        <>
          <span className="ticker__chg">PRICE SPREAD</span>{' '}
          <span className="ticker__dim">
            {Math.round(spread.multiple)}× ({spread.cheapest.displayName} input →{' '}
            {spread.priciest.displayName} output)
          </span>
        </>
      ),
    });
  }

  const newest = [...catalog.models]
    .filter((m) => m.releaseDate)
    .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
    .slice(0, 2);
  for (const model of newest) {
    items.push({
      key: `new-${model.id}`,
      node: (
        <>
          <span className="ticker__up">▲ TRACKED</span> {model.displayName}{' '}
          <span className="ticker__dim">
            {formatRate(model.pricing.input)}/{formatRate(model.pricing.output)} per 1M
          </span>
        </>
      ),
    });
  }

  const flagged = catalog.models.filter((m) => m.provenance.needsReview).length;
  if (flagged > 0) {
    items.push({
      key: 'flagged',
      node: (
        <>
          <span className="ticker__chg">Δ {flagged} FLAGGED</span>{' '}
          <span className="ticker__dim">sources disagree — see Data &amp; Alerts</span>
        </>
      ),
    });
  }

  items.push({
    key: 'coverage',
    node: (
      <>
        {catalog.models.length} MODELS · {catalog.providers.length} PROVIDERS{' '}
        <span className="ticker__dim">synced daily by GitHub Action</span>
      </>
    ),
  });

  items.push({
    key: 'alerts',
    node: (
      <>
        GET PRICE ALERTS <span className="ticker__dim">RSS · push · email → Data &amp; Alerts</span>
      </>
    ),
  });

  return items;
}
