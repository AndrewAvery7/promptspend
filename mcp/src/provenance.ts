/**
 * Provenance is the entire reason this server exists.
 *
 * Every other LLM-pricing MCP server returns a number. Ask any of them where
 * the number came from or when it was last confirmed and there is no answer —
 * the competing server's own documentation states only that pricing "is updated
 * regularly", with no verification date exposed per data point.
 *
 * That gap is the product. So provenance is not an optional field on some
 * responses here; it is attached by construction, in one place, and a test
 * asserts that no tool can return a price without it. If a future change makes
 * provenance optional, the differentiator is gone and the server is a worse
 * version of something that already exists.
 *
 * It matters more in an agent context than on a web page. A person reading a
 * price sees the surrounding interface and forms their own view of how much to
 * trust it. A model reading a bare number has nothing, and will relay it with
 * whatever confidence the phrasing implies. Handing it the date and the source
 * is what lets it say "as of 1 August, per OpenAI's pricing page" instead of
 * stating a number as though it were timeless.
 */
import type { Model } from '@/lib/pricing/types';

export interface ProvenanceBlock {
  source: 'vendor' | 'litellm' | 'openrouter';
  source_description: string;
  last_verified: string;
  last_changed?: string;
  verified_url?: string;
  disputed: boolean;
  dispute_note?: string;
  upstream_stale: boolean;
  /** Plain-language line an agent can relay verbatim. */
  confidence: string;
}

const SOURCE_TEXT: Record<ProvenanceBlock['source'], string> = {
  vendor: "Hand-verified against the provider's own published pricing page.",
  litellm: 'From the LiteLLM community catalog, cross-checked against OpenRouter.',
  openrouter:
    'From the OpenRouter API. Note that OpenRouter is a router, so this may be a resale price rather than the provider list price.',
};

/**
 * The sentence a model should be able to repeat without adding anything.
 *
 * Written as prose rather than left for the agent to compose, because the whole
 * value is lost if the model paraphrases "disputed" into "approximately".
 */
function confidenceLine(model: Model): string {
  const p = model.provenance;
  if (p.needsReview) {
    return (
      `DISPUTED — two sources disagree on this price and no human has adjudicated it. ` +
      `The figure shown is the primary feed's number, last confirmed ${p.lastVerified}. ` +
      `Treat it as indicative and say so.` +
      (p.reviewNote ? ` Detail: ${p.reviewNote}` : '')
    );
  }
  if (p.stale) {
    return (
      `The upstream source has stopped listing this model, so the price may be ` +
      `withdrawn. Last confirmed ${p.lastVerified}. The row is kept and marked ` +
      `rather than deleted.`
    );
  }
  if (p.source === 'vendor') {
    return `Confirmed against the provider's own pricing page on ${p.lastVerified}.`;
  }
  return `From an automated feed, last confirmed ${p.lastVerified}. Not hand-checked against the vendor page.`;
}

export function provenanceOf(model: Model): ProvenanceBlock {
  const p = model.provenance;
  const block: ProvenanceBlock = {
    source: p.source,
    source_description: SOURCE_TEXT[p.source],
    last_verified: p.lastVerified,
    disputed: p.needsReview === true,
    upstream_stale: p.stale === true,
    confidence: confidenceLine(model),
  };
  if (p.lastChanged) block.last_changed = p.lastChanged;
  if (p.verifiedUrl) block.verified_url = p.verifiedUrl;
  if (p.reviewNote) block.dispute_note = p.reviewNote;
  return block;
}
