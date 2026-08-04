# Deferred

Work that was proposed, considered and deliberately not done yet — with the
reason, so it is a decision rather than a gap somebody rediscovers.

Two of these are **waiting on search data**, and that wait is the point: keyword
work done against guesses is worth much less than the same work done against a
week of real impressions.

---

## Waiting on Search Console data

**Keyword research, then the next batch of pages.** The 159 generated pages went
live 2026-08-02. Search Console needs roughly a week to accumulate impressions
before any of it means anything. What to look for when it does:

- Queries already ranking 5–20. A page that nearly ranks needs editing, not a
  sibling — that is the cheapest traffic available.
- Queries with impressions and no matching page. That is the brief for the next
  batch.
- Which of the three page types earns clicks. Build more of what works rather
  than more of everything.

**Whether the page set is too thin anywhere.** Watch Indexing → Pages. An
indexed count below 160 is normal selectivity, not a fault — Google is
deliberately choosy with programmatically generated pages. Large counts under
_Duplicate, Google chose different canonical_ or _Crawled – currently not
indexed_ are the two signals that would mean a real content problem, and the
comparison pages are the likeliest culprits since they are the most template-like.

The weekly `promptspend-seo-review` scheduled task carries both.

---

## Considered and rejected, for now

**Per-model Open Graph images.** All 159 pages share one social card. Generating
159 at build time is real work for a modest gain, and there is no evidence yet
that these pages are shared enough for it to matter. Revisit only if referral
traffic from social says otherwise.

**A `vendorId` field on each catalog row.** The catalog's ids are not uniformly
the ids that appear in source code. Some are exactly what the vendor calls the
model — `gpt-5.6`, `claude-sonnet-5`, `o3` — and some carry the upstream feed's
routing prefix: `gemini-gemini-2.5-flash`, `deepseek-deepseek-v3.2`,
`xai-grok-4.5`, `zai-glm-5`, `moonshot-kimi-k2.6`.

Nobody writes the prefixed form. The VS Code extension has to match what is
written, so `vscode/src/vendor-ids.ts` strips known prefixes and a test fails the
build when the catalog grows a family nobody has classified — a loud failure
rather than the quiet one it replaced, which was matching OpenAI and Anthropic
and silently missing every other provider while looking like it worked.

The right home for this is the catalog itself: the sync pipeline knows the
upstream key it filtered on, so it could write the vendor-facing id beside it and
every consumer would stop guessing. Deferred because it is a schema change —
`SCHEMA_VERSION`, the validator, the sync pipeline and every reader — for a
problem one consumer currently solves with a list of eight prefixes and a test
that cannot go stale silently. Revisit when a second consumer needs it, or when
the prefix list stops being able to describe what the feed produces.

**Hand-adding models the feed does not carry.** Z.ai published GLM-5.2 and
GLM-5-Turbo while LiteLLM had neither. An override with a full `pricing` block
_can_ create a model the feed lacks — and that price then freezes, because no
feed row exists to correct it. Seeding from OpenRouter instead would publish a
reseller's price as the vendor's, which for these providers runs 20–50% adrift.
Missing a model for a few days costs less than publishing a number that is wrong
and cannot self-correct. See `$coverage` in `data/pricing-overrides.json`.

---

## Genuinely not started

**Visual-regression tests** — the last quarter of a pre-publication audit
finding that asked for automated accessibility and visual coverage. Playwright
landed 2026-08-02 and covers layout at four viewports; axe landed 2026-08-03 at
WCAG 2.1 A/AA and immediately found two real defects, both scrollable regions
no keyboard could reach. What remains is screenshot diffing — the class of
change that leaves a page accessible, correctly sized and semantically valid
while making it look wrong.

Deferred rather than done because a screenshot suite has a real running cost:
every intended visual change becomes a diff to review and a baseline to
re-approve, across four viewports and two themes. That is worth paying once the
design stops moving, and it has been moving weekly.

**Launch marketing.** Show HN, the developer communities, the newsletters that
cover LLM tooling. Now genuinely ready, which it was not before the pages, the
API, the MCP server and the VS Code extension existed — four surfaces that give
the same catalog four different ways to be found, and a story about provenance
that is easier to tell with all of them in place than with any one.

**A cost-diff GitHub Action.** A check that comments on a pull request when it
changes what an LLM call will cost — the extension's per-line reading, applied
to a diff. Deliberately waiting rather than rejected: it is the same scanning
and pricing work `vscode/` already does, and building the reusable half twice
would be the waste. Revisit once the extension's scanner has had real use and
its rough edges are known rather than guessed at. A reminder is set for
2026-08-25.

**The 27 rows still sourced from LiteLLM.** A verification pass on 2026-08-03
took vendor-sourced coverage from 16 of 70 to 43, and `verifiedUrl` from 17 to
44, by reading Anthropic's, OpenAI's, Google's, xAI's and DeepSeek's own pricing
pages. All 27 figures matched the feed exactly.

What remains is not laziness but absence: Mistral Large 3 and Medium 3.5,
Command A, every Kimi and MiniMax row, and GLM-5-Code **do not appear on their
vendors' own pricing pages at all**. Gemini 3 Pro Preview, Grok 2/3/4/4.1-fast
and DeepSeek R1/V3/V3.2 are missing from the pages that carry their siblings.
Aggregator sites have numbers for all of them, and that is precisely the source
this catalog refuses. These rows stay honestly labelled `litellm` until a
first-party page carries them.

A second attempt on 2026-08-03 went past the pricing pages to each vendor's
model documentation — `docs.mistral.ai` models overview, `docs.cohere.com/docs/models`,
Alibaba Model Studio's model list, Kimi's per-model pages and the AWS Bedrock
pricing page. **None publishes a per-token rate for the models in question.**
Two independent passes is enough to call this an upstream gap rather than a
search problem; do not spend a third on the same URLs. The realistic unlocks are
a vendor publishing a pricing page, or the model appearing in a source the
catalog already accepts.

**Six standing price flags.** DeepSeek R1 (gone from DeepSeek's current pricing
page, consistent with it being marked legacy here), MiniMax M2.5, Kimi K2.6 and
three DashScope rows. Their first-party pricing pages defeated an initial
attempt; the aggregator sites that do carry numbers are not a source this
catalog accepts. The weekly `promptspend-verify-price-flags` task retries.

**Tightening DMARC further.** `p=reject` is already the strong setting, so this
is close to done and low value.
