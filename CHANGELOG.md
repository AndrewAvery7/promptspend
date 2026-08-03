# Changelog

Notable changes to the application. Changes to the **data** — prices moving,
models arriving, rows being flagged — are recorded separately and automatically
in [docs/pricing-changelog.md](docs/pricing-changelog.md), because they happen
on their own schedule and are not releases.

## Unreleased

Two threads. The first is the repository being honest about itself — a corrupted
README that had already shipped, a promo that could have drifted from the
product, and two numbers that were wrong on the page while being right in the
code.

The second is new reach for the same data. The catalog now answers inside a
coding agent as well as on a web page, and every surface it reaches carries the
same paperwork: a source, a confirmation date, and a mark on the prices nobody
has adjudicated. That is the only claim here a competitor cannot match by
shipping a package next week.

### Added

- **A promo video, built from the real interface.** The two sibling repositories
  draw their promos in PIL because they are command-line tools with nothing to
  film. This one has an interface, and the rule here is that a claim on screen
  must be true of the code — so every screen in the video is a genuine Playwright
  screenshot of the built site, showing real prices from the committed catalog,
  in the site's own three typefaces. `tools/make-promo.py --check` fails if a
  captured model has been renamed or retired, or if rates have moved far enough
  that the saving shown on screen is no longer what the engine would compute:
  the screenshots stay current because they are captured, so the risk is the
  hand-written captions rotting around them. See [docs/PROMO.md](docs/PROMO.md).
  It opens on a title card because GitHub's inline player takes its thumbnail
  from frame 0 and offers no `poster` a README can set — the hero clip begins
  near-black, so the front page showed an empty rectangle until someone pressed
  play.
- **`npm run check:encoding`**, in `verify`. Fails on a UTF-8 BOM, on invalid
  UTF-8, and on double-encoding. Detection is a round-trip rather than a list of
  suspicious characters, because a pattern list both misses real cases and flags
  innocent text.
- **An MCP server** (`mcp/`, `@promptspend/mcp`) for Claude Code, Cursor and
  Windsurf. The category already has one, with more tools and data this project
  does not hold — so this does not compete on breadth. It competes on the one
  thing the competing server's own documentation does not offer: every price it
  returns carries its source and the date it was last confirmed, and disputed
  prices are marked rather than quietly resolved. That matters more to a model
  than to a person, because a model handed a bare figure repeats it with
  whatever confidence the sentence implied.

  `estimate_cost` is the tool a price lookup structurally cannot provide: it
  runs **this repository's cost engine**, imported rather than reimplemented, so
  it accounts for compounding conversation history, cache writes, long-context
  tiers and reasoning tokens — and cannot report a figure that disagrees with the
  calculator. A test compares against `compareModels` directly rather than
  trusting the import still exists.

  Because MCP tool definitions load into context on _every_ turn, the server's
  own overhead is measured, budgeted at 900, checked in CI and published:
  **~700 tokens**. The README figure is asserted against the actual manifest.
  See [mcp/README.md](mcp/README.md).

- **`verify / mcp`** in CI: typecheck, 21 tests, the footprint budget, a bundle,
  and a startup gate that spawns the built binary and speaks MCP to it. That last
  one exists because it caught three faults everything upstream called fine —
  `tsc` does not rewrite `paths`, Node's ESM loader needs the `.js` extensions
  `moduleResolution: bundler` lets the source omit, and a shebang banner landed on
  line 2 of a file that already had one. Vitest resolves the first two itself, so
  only running the artifact could find them.
- **A browser suite**, gating CI as `verify / e2e`. Playwright at four viewports
  — 320, 390, 768 and 1280 — with touch emulation on the narrow three, because
  the 44px target rules live behind `@media (pointer: coarse)` and without it the
  run silently checks the desktop stylesheet on a narrow screen. It runs against
  the **built** site, since the 159 generated pages only exist after
  `build:pages`. 0.2.0 called this "the next investment"; this is it arriving.
  The remaining half — axe and screenshot diffing — is still open, and named in
  [docs/DEFERRED.md](docs/DEFERRED.md).
- **The README badges are held to the numbers that produce them.** `check:budget`
  asserts the payload badge against the gzipped bundle, and `validate:catalog`
  asserts the model and provider badges against the catalog. Three hand-written
  figures had already gone stale — the test total, the bundle size, and counts
  that move every morning the sync adds a row — so the scripts that know the real
  number are now the things that keep the README honest. The test-count badge
  stays manual: the only thing that knows it is a test run, and having the suite
  assert its own total is circular.

### Changed

- The site, the developer hub and `llms.txt` now say what makes this different
  rather than leaving a reader to infer it. Data & Alerts gains a **Use it where
  you work** panel, placed above the trust ladder deliberately: the ladder argues
  the numbers are believable, and this is the payoff — the same numbers, with the
  same paperwork, in an editor.
- The promo video gains a scene for it and runs 1:53. Same rules as the rest of
  the film: real figures, the site's own typefaces, no mockups, and the honest
  comparison is a price beside a price-with-its-paperwork rather than a
  competitor's name.
- **A vendor-verification pass, taking first-party coverage from 16 of 70 rows
  to 43.** `verifiedUrl` — the link to the page that was actually read — goes
  from 17 rows to 44. Anthropic's, OpenAI's, Google's, xAI's and DeepSeek's own
  pricing pages were read on 2026-08-03 and compared against the published
  catalog; **all 27 figures matched the feed exactly**, which is worth stating
  rather than burying, since it is evidence the automated source has been
  accurate for these models.

  The entries record **provenance only — no `pricing` block**. That is the
  point: a hand-written price wins every future conflict and therefore freezes,
  so writing one down when nothing needed changing would trade a
  self-correcting number for a stale one. The rate keeps flowing from the feed;
  what is added is the evidence.

  What could not be verified is named rather than quietly rounded up. Mistral
  Large 3 and Medium 3.5, Command A, every Kimi and MiniMax row and GLM-5-Code
  do not appear on their vendors' own pricing pages at all; Gemini 3 Pro
  Preview, Grok 2/3/4/4.1-fast and DeepSeek R1/V3/V3.2 are missing from the
  pages that carry their siblings. Aggregators have numbers for all of them,
  which is exactly the source this catalog refuses. Those rows stay labelled
  `litellm`. See [docs/DEFERRED.md](docs/DEFERRED.md).

### Fixed

- **Every model in the published catalog claimed its price changed the same
  morning.** All 70 rows carried `provenance.lastChanged: 2026-08-02`, including
  the twelve whose `lastVerified` is pinned by a hand-written override to the
  day before, and including models the pricing changelog records no 08-02 change
  for at all. Two faults, one visible symptom. `mergeCatalog` fell back to
  today's date whenever the published row carried no `lastChanged` — which was
  every row, the first time the run met a catalog written before the field
  existed — so the migration stamped the entire catalog instead of leaving the
  history it did not know. And it decided "changed" with its own comparison of
  `input` and `output`, while the changelog compared all thirteen pricing
  fields: a cached-input or long-context move was reported as a **Price** change
  and simultaneously left `lastChanged` on the old date. The date is now carried
  forward untouched unless `pricingChanged` — the changelog's own comparison,
  exported from `scripts/lib/diff.ts` so a second opinion cannot form — says the
  model's rates moved, and a row published without the field keeps none rather
  than being given a date that asserts a change nobody made. This is the field
  the whole project rests on: one that reads "changed today" for everything
  carries less information than an empty column, and it reads as confidence.
- **The published catalog still carried those dates, and the fix would have
  preserved them forever.** Stamping correctly from now on does not unstamp what
  already shipped: `mergeCatalog` carries `lastChanged` forward untouched when
  rates hold, so all 70 fabricated dates would have persisted until each model
  independently moved. `provenance.lastChanged` is therefore removed from every
  published row. The pricing changelog is the evidence, and it is unambiguous:
  of the 43 **Price** lines recorded to date, all 43 are a field going from
  absent to a value — a rate gaining coverage, not a vendor changing one — and
  the 70 **Added** lines are the cold start. No genuine price movement has ever
  been observed, so no date can honestly be backfilled; the field starts
  accumulating from the next real move. The catalog fingerprint is unchanged at
  `4a97d95b2d1e26c0`, which is the proof that no price, source or verification
  date was touched — `catalogHash` deliberately excludes `lastChanged`.
- **`pricesLastChanged()` fell back to the build date, so the display layer told
  the same lie independently.** With no model carrying a date it returned
  `generatedAt` — meaning the header, the footer, the Data & Alerts panel and
  the `PRICES CHANGED` pill on the results panel would have announced a fresh
  price change every morning the site was rebuilt, regardless of the catalog.
  Removing the bad data alone would not have fixed it; it would have moved it.
  The method now returns `null`, and each of the five surfaces states plainly
  that no change has been recorded, in the register that surface uses.
- **Nothing was checking that the provenance dates were possible.** `lastChanged`
  after `lastVerified` says a price moved after the last time anyone looked at
  it. Twelve rows shipped in exactly that state. The schema validator could not
  catch it — both fields are individually valid dates and only their
  relationship is impossible — so `validate:catalog` now asserts it directly and
  fails the build with the offending ids. Verified by reinstating the shipped
  contradiction and confirming a non-zero exit.
- **The documentation described a field that no longer appears.** The README's
  catalog example, the developer hub's worked `curl` and its prose all presented
  `provenance.lastChanged` as something a reader would get back — the hub going
  as far as printing an example response, directly under the command that
  returns something different. All three now mark it optional and say what its
  absence means: no change on record, never unknown freshness, since
  `lastVerified` answers that and is always present. `docs/ARCHITECTURE.md`
  records the invariant and both lessons; `docs/TROUBLESHOOTING.md` explains the
  empty field to anyone who lands there thinking it is broken. The OpenAPI
  schema needed nothing — it already required only `source` and `lastVerified`.
- **`docs/TESTING.md` contradicted itself about browser coverage.** One section
  documents the Playwright suite in detail; another still said those same
  guarantees were "not currently held by a test" and that Playwright "is the
  next investment". The second was written before the suite landed and was never
  revisited. Accessibility is the gap that actually remains — nothing runs axe —
  and the section now says that instead.
- **The model pages claimed the tokens were in stock.** Every generated `Offer`
  carried `availability: https://schema.org/InStock`, which asserts holding
  stock for sale — false in every particular, since the rate is the vendor's and
  the page links to the vendor's own page to prove it. Removed. It was also the
  strongest signal inviting Google to grade a price reference as a shop, which
  is how a catalogue that sells nothing came to be sent a Search Console report
  asking for a shipping policy and a returns policy.

  Four of the five fields those reports asked for stay missing on purpose.
  `aggregateRating` and `review` do not exist because nobody rates a price list,
  and inventing them is the specific thing Google calls a manual-action offence.
  `shippingDetails` and `hasMerchantReturnPolicy` describe a transaction that
  never happens. `image` would mean attaching a photograph of something else to
  an API endpoint. The markup is already valid for what these pages are —
  Google's own split puts editorial pages "where people can't directly purchase
  the product" under product snippets, which need only `name` plus one of
  `review`, `aggregateRating` or `offers`. `docs/PAGES.md` records which
  warnings are permanent so the next person to receive one does not "fix" it.

- **The MCP readme's worked example was not the response the server returns.**
  It was labelled as what an agent receives for `gpt-5` and showed that model as
  `source: vendor` with a `verified_url`, while the published catalog had it as
  `litellm` with neither — aspirational when written, and made mostly true only
  by the verification pass above, which is the wrong reason for an example to
  become correct. It is now pasted from a live `get_price` call against the
  published package, including the `upstream_stale` field the hand-written
  version omitted, with a line noting that the date will age and the shape will
  not. Same defect and same fix as the developer hub. The npm readme is only
  replaced on publish, so the corrected example needed a release to reach the
  package page at all.
- **0.1.2 shipped announcing itself as 0.1.1.** `SERVER_INFO.version` in
  `schema.ts` is a literal and nothing read `package.json`, so bumping the
  package left it behind — and `--version`, plus the `serverInfo` an MCP client
  reads during the handshake, both reported the older number. Every gate passed,
  because not one of them compared the two. A server misreporting its own
  version is the same defect this project exists to catch, one level up, and a
  client that trusts `serverInfo` has no way to notice. **0.1.3** corrects it and
  adds the test that makes the drift impossible, verified by reinstating the
  mismatch and confirming a red suite.
- ESLint no longer walks `.claude`. A git worktree lands there as a complete
  second copy of the repository, and the path-scoped override that gives the
  service worker its globals matches `public/sw.js` but not
  `.claude/worktrees/<branch>/public/sw.js` — so a checked-out branch failed the
  lint with twenty-one undefined-global errors in a file that is fine where it
  actually lives.
- **A long install command in the new panel pushed the page sideways at 320px.**
  Grid children default to `min-width: auto`, so the column refused to shrink
  below one unbreakable token and widened the whole data grid. The browser suite
  named the health panel as the offender, which was true and misleading — it was
  a victim of a sibling that would not narrow.
- **README.md was mojibake on the public repository page.** A Windows read/write
  pair that disagreed about encoding: PowerShell 5.1 reads an un-BOMed file as
  the system ANSI codepage while `Out-File` writes UTF-8 with a BOM, so every
  non-ASCII character went one layer deep and the pipeline diagram became noise.
  Nothing caught it — the result is valid UTF-8 and valid markdown, and Prettier
  obligingly re-padded the tables around the now-wider cells.
- **The logo sat off-centre.** `assets/logo.png` had 9px of padding on the left
  and 167 on the right, so `align="center"` centred a canvas whose artwork did
  not fill it. A fixed canvas is a guess about text metrics, and the font lookup
  walks a fallback list, so the error differed per machine. Both the README logo
  and the video's end card are now cropped to what was actually drawn.
- The README's call to action pointed at the `github.io` address, which 301s to
  `promptspend.com`. Three such links now go direct.

### Removed

- The pre-publication audit report, its `.docx` duplicate and the response to it.
  Three files under the project's former name describing a state it has left,
  linked from nowhere. The one claim in them not recorded elsewhere — three
  OpenAI prices verified against the vendor page — is already in the catalog as
  `source: vendor` with the date and the URL, which is where the API serves it
  from. Git history keeps the documents.

## 0.5.0 - 2026-08-02

The catalog stops being only a calculator and becomes something other software
can depend on: 159 pages a search engine can read, and an API a program can call.

### Added

- **159 crawlable pages**, built from the catalog after every deploy: one per
  model, one per provider, a curated set of head-to-heads, and three index
  tables. Each carries its own rate card, three monthly bills costed by the same
  engine as the calculator, its rank in the catalog, cheaper alternatives and its
  provenance. The app is one URL whose views are client state, which is right for
  a tool and useless for search — nobody types "LLM cost estimator" into Google.
  See [docs/PAGES.md](docs/PAGES.md).
- **A public pricing API at `promptspend.dev`** — keyless, CORS-open, read-only,
  OpenAPI 3.1 described, with a developer hub documenting it. JSON and CSV, edge
  cached, freshness on every response. A separate Worker with **no database, no
  KV and no secrets**: it reads one public file and serves it in several shapes.
  See [docs/API.md](docs/API.md).
- **IndexNow**, fired from the existing price-change workflow, submitting exactly
  the pages a reader would now see differently. Bing, Yandex, Seznam and Naver
  consume it; Google does not, which is stated rather than implied.

### Changed

- `check:seo` now covers every generated page: unique titles and descriptions,
  a self-referencing absolute canonical, valid structured data, a policy with no
  `unsafe-inline`, a sitemap entry, and that **every internal link resolves to a
  file that exists**. That last one catches the failure with no symptom — the
  page renders perfectly and the link is dead.
- `sitemap.xml` moved out of `vite.config.ts` into `scripts/build-pages.ts`. It
  has to list the generated pages, and the Vite config has no idea they exist.
- The footer links to the model index, the provider index, the comparisons and
  the pricing API, so nothing depends on the sitemap being the only way in.

- Contact address is `info@promptspend.com`; `hello@` has been retired.
- Five major dependency bumps, including vitest 3 → 4 — the repository had been
  running two majors of one test runner. The React Compiler rules that arrived
  with `eslint-plugin-react-hooks` 7 found four real problems, all fixed.
- `main` is protected against force-pushes and deletion, configured so the daily
  pricing sync can still commit.
- The catalog stays feed-driven by decision: a model the feed does not carry is
  not hand-added, because that price would freeze with nothing able to correct
  it. See `$coverage` in `data/pricing-overrides.json`.

### Fixed

- **The pricing API served its own stale copy back to itself.** `caches.default`
  and the cache behind `fetch()` are the same cache, keyed by URL, so storing the
  catalog under its own origin URL overwrote the entry the next fetch would read.
  It "revalidated" every five minutes by re-reading its own day-old copy and
  re-stamping the timestamp — freshness looked perfect and the body never moved.
  Found in production, eighteen minutes adrift.
- **`robots.txt` on the hub told agents not to call the API it documents.**
  `Disallow: /v1/` was meant to keep thin JSON out of search results, but
  robots.txt governs _fetching_ and assistants apply it to user-initiated
  requests. `X-Robots-Tag: noindex` does that job without making the data
  unfetchable.
- Twelve fixes found by clicking through the live site: the CHECK popover was
  clipped by its scrolling container _and_ dismissed by reaching for that
  container's scrollbar; the Atom feed link opened raw XML in the same tab and
  now copies the address instead; nine display names that had become page
  titles; ticker spacing; the CHEAPEST flag now shares the corner the price
  delta uses; every sortable column carries a marker, not just the sorted one;
  the alerts panel is two evenly-weighted columns.

### Notes

- The generated pages ship **no JavaScript**. The only `<script>` is the JSON-LD
  data block, admitted to the policy by its exact SHA-256 rather than by
  `'unsafe-inline'`, with the hash computed over the string actually emitted.
- Comparison pages are curated, not combinatorial: 2,346 pairs exist, 75 are
  worth a page. Both models current, different providers, within 3× on blended
  rate. Reaching the ceiling is logged — a page set that quietly shrank looks
  exactly like one that is complete.

## 0.4.0 - 2026-08-02

**TokenTally is now PromptSpend**, on `promptspend.com`, with the developer
surfaces on `promptspend.dev`. The rename is mechanical; the interesting part is
that a domain move is the cheapest moment to fix discoverability, and the most
expensive one to get wrong.

### Changed

- Renamed throughout: wordmark, package names, the repository
  (`AndrewAvery7/promptspend` — GitHub redirects the old path), the Cloudflare
  Worker, and the D1 database.
- `localStorage` keys moved from `tt.*` to `ps.*`, **with a migration**. Renaming
  them outright would silently reset everyone's theme, which reads as a bug
  rather than a rebrand.
- The `List-Id` header is now domain-scoped (`alerts.promptspend.com`) as RFC
  2919 asks. Mail clients group and filter on it, so a bare label was wrong.

### Added

- **Open Graph images.** There were none, so every share of this site has
  rendered as a bare link. The card also had to be copied into `public/` —
  `assets/` is repository documentation and is never served, so the image
  existed but no crawler could ever fetch it.
- Canonical link, `og:url`, `twitter:image`, and `WebApplication` structured
  data — all absolute, all generated from one `SITE_URL` value.
- Generated `robots.txt`, `sitemap.xml` and the Pages `CNAME`. A committed
  sitemap carrying a stale domain is worse than none: it actively tells Google
  to index somewhere the site no longer is.
- `npm run check:seo`, which asserts all of the above against the **built**
  artifact. Everything it checks fails invisibly — the page still renders, the
  build still passes, and the traffic simply never arrives.
- [docs/DOMAINS.md](docs/DOMAINS.md): the architecture, the cutover runbook, the
  rollback, and an inventory of every remaining place a hostname appears.

### Removed

- The KV binding. Nothing ever read it. An unused binding is a claim about what
  the Worker can reach, and that claim should be true.

### Fixed

- The `package.json` description carried a double-encoded em-dash, from an
  earlier edit made with PowerShell's `Get-Content`/`Set-Content` — which reads
  as ANSI without an explicit encoding and re-encodes UTF-8 into mojibake.

## 0.3.0 - 2026-08-02

Price alerts, in both the forms `0.2.0` described as planned. The Data & Alerts
view previously carried two cards reading "PLANNED — NOT BUILT YET"; they are
now working features, and the rule that put those labels there — never render a
control that cannot do what it appears to offer — is what governs their
behaviour when a deployment has no API configured.

This adds a server to a project that did not have one. That is a real change to
what the site is, so the privacy and security documents were rewritten rather
than appended to.

### Added

- **Browser push.** A notification when a price moves, for the whole catalog or
  just the models you follow. Nothing personal is stored: a push subscription is
  an opaque URL the browser issues.
- **Email alerts**, weekly digest or instant, with double opt-in, RFC 8058
  one-click unsubscribe, and preference management from a signed link.
- **The alerts API** (`worker/`) — a Cloudflare Worker on D1 and KV, deployed
  separately from the site with its own tests and its own package.
- **RFC 8291 push encryption, written out** rather than imported. The mainstream
  library targets Node's crypto module and will not run unmodified on Workers,
  and a dependency that can read every notification body is one worth not
  having. Verified byte for byte against the worked example in RFC 8291 §5 —
  the only test here measured against an external authority instead of our own
  expectations, because a round-trip test passes just as happily when both
  halves share a misreading of the spec.
- **A generated Content Security Policy.** The API origin now appears in
  `connect-src`, so the policy is built from the same configured value the
  client reads. A hand-maintained meta tag would have drifted the first time
  either moved, producing a site that silently could not reach its own backend.
- **A weekly digest that sends even in a quiet week**, because a digest which
  only arrives when something happened is indistinguishable from one that has
  quietly broken.
- Installable-app manifest and icons — on iOS, web push only works for a site
  added to the Home Screen, so this is part of the feature rather than polish.

### Changed

- **README and SECURITY.md now describe a project with a backend.** Both stated
  "no server that receives anything", which stopped being true. Rule two of this
  project is that a claim must be true of the code; correcting the claim is the
  fix.
- Notification is triggered by a push to `main` that changes the published
  catalog, not by the sync job. A change that trips a sanity rule goes to a pull
  request first, so notifying from the sync job would have announced numbers
  that were still unmerged — and missed the ones a human reviewed and merged.
- `BASE_PATH` handling no longer treats an empty string as unset. GitHub Actions
  passes an undefined variable as `""`, which `??` does not catch, and which
  would have built every asset path relative to nothing.

### Security

- Push endpoints are restricted to the hosts that actually issue them. Without
  that allowlist the endpoint field is a server-side request forgery primitive:
  an attacker registers an internal URL and the worker POSTs to it, from
  Cloudflare's network, on every price change.
- Email link tokens are scoped to one purpose each. An unsubscribe link travels
  through forwards, archives and mail scanners; if it also authorised preference
  changes, every one of those copies would be a credential.
- `GET /v1/email/unsubscribe` asks rather than acts, because scanners prefetch
  links. One-click unsubscribe from a mail client is unaffected — RFC 8058 sends
  a POST.
- `/v1/notify` is authenticated by an HMAC over the exact body plus a timestamp,
  so a captured call is useless after five minutes and useless for any other
  payload.
- Deliveries are claimed by primary key before anything is sent, so two
  concurrent fan-outs cannot both notify the same subscriber.

## 0.2.0 - 2026-08-02

A pre-publication audit of `0.1.0` produced 29 findings. Twenty-seven were real
and are fixed here; one was a misreading of a vendor pricing table and is
documented rather than acted on; one is delivered in part with the remainder
named. The theme running through all of it: a calculator's failure mode is not
being late, it is being **confidently wrong**, so every place the code was more
certain than its evidence now says what it actually knows.

### Added

- **Long-context tiers.** OpenAI bills the entire request at 2× input and 1.5×
  output above 272K input tokens. Modelled per request rather than per
  conversation, so a long chat can cross the threshold partway through and the
  turns either side are priced differently — which is what actually happens.
- **Cache writes.** Both OpenAI and Anthropic charge 1.25× the input rate to
  write a cache entry. Counting only the cheaper reads reports a saving the
  invoice will not contain, so writes are billed and savings are reported net.
- **Scenario warnings.** A request that will not fit the model's context window,
  or a response past its output ceiling, is now flagged instead of being priced
  as though it would work.
- **A health manifest** at `public/data/sync-status.json`, written on every run
  whether it succeeded or not: attempted and succeeded timestamps, per-source
  status and revision, row counts and a catalog fingerprint. The UI reads it to
  show **prices last changed** and **sources last checked** as two separate
  facts.
- **Source links everywhere.** Every catalog row links to the vendor page its
  number came from; hand-verified rows carry `verifiedUrl` and a date.
- **An error boundary**, so a rendering failure shows an explanation and a way
  back rather than a white page.
- **`src/lib/contrast.test.ts`**, which reads `tokens.css` and fails the build if
  any accent, on any theme and canvas, drops below 4.5:1 on a surface it can
  appear on.
- **A bundle budget** (`npm run check:budget`): the initial payload must stay
  under 100 KB gzip and the tokenizer must remain a separate lazy chunk.
- `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue and pull-request templates,
  Dependabot, and `.editorconfig`.

### Fixed

- **A permitted URL could blank the application.** `costPico` threw a
  `RangeError` above the safe-integer range, during render, with nothing to
  catch it — from parameters the URL decoder itself accepted. It now finishes in
  `BigInt` past that range, and pricing per turn keeps the arithmetic exact at
  the decoder's limits anyway.
- **Sharing a pasted prompt shared the wrong numbers.** The URL carried whatever
  the sliders last said while the screen showed the pasted counts, and the toast
  claimed it restored every input. Derived counts are now written back into the
  scenario, `px=` records which fields came from text, and the restored page says
  so. The prompt text still never enters a URL.
- **The sync diff compared two fields.** A run that changed a cache rate, a
  context window, a tokenizer or a review flag reported "no changes", and the
  workflow discarded the file it had just produced. Every field is now compared,
  split into price / metadata / review-state, with a content hash.
- **One bad fetch could have emptied the catalog.** A truncated upstream response
  would have removed most models as a _clean_ diff — committed to `main` and
  deployed without review. Nothing published is deleted now: a model missing
  upstream is kept and marked `stale`, and retirement is a deliberate edit.
- **Deployment did not depend on CI.** Both workflows started independently on a
  push, so a commit could deploy with failing tests. They now share one reusable
  verify workflow, and deploy publishes the artifact that workflow produced.
- **The headline "price spread" compared unlike things** — the priciest _output_
  rate over the cheapest _input_ rate. Both sides are now the blended rate, and
  both numbers are printed so the multiple can be checked.
- **Mobile had document-level horizontal overflow** from `min-width: auto` on
  flex and grid children. Zero overflow now from 320px up.
- **The value map was pointer-only.** Every point is a real focusable button with
  Enter/Space handling, and the catalog table can select a model directly.
- Focus is restored when the command palette closes; the guided tour no longer
  steals arrow keys from sliders and honours `prefers-reduced-motion` in
  JavaScript as well as CSS; `title`-only help is replaced with real disclosures.
- CSV export escapes properly and neutralises spreadsheet formulas.
- The initial commit's author metadata was rewritten to the public noreply
  identity before any remote existed.

### Changed

- **Caching is off by default**, and where a provider publishes no cached rate,
  cached tokens are billed at the **full** input rate rather than an invented 90%
  discount. The control moved out of a collapsed "Advanced" section onto the
  panel.
- **Unscored models are no longer plotted** on the value map at a default of 70.
  They are not plotted at all, and the caption says how many that is.
- **`gpt-5.6` is marked as the alias for `gpt-5.6-sol`** that OpenAI documents it
  to be, so one purchasable model is no longer presented as two.
- **Alert controls that did nothing are gone.** Browser push and email digest are
  described as planned; the email field that could not subscribe anyone was
  removed.
- The flagged-row copy now describes the merge rule the pipeline actually uses.
- Fonts are self-hosted, so the page makes **no third-party requests at all**; a
  CSP and referrer policy are declared, and production sourcemaps are off.
- Every GitHub Action is pinned to a commit SHA, with Dependabot to keep the
  pins current.
- Catalog schema bumped to **v2** (`cacheWrite`, `longContext`, `aliasOf`,
  `provenance.verifiedUrl`, `lastChanged`, `stale`), and validation deepened to
  enums, date formats, integer bounds and cross-field sanity.
- 242 tests, up from 120, with a regression test for every defect above.
  Coverage thresholds are enforced in CI at 90% on the engine and the pipeline.

### Known gaps

- No browser end-to-end suite, no automated accessibility pass, no
  visual-regression snapshots. The responsive and touch-target guarantees were
  verified by hand at 320, 360, 390, 430, 768, 1024 and 1280 px rather than by a
  test that keeps them true. Playwright plus axe is the next investment.
- Regional and data-residency premiums, fast/priority tiers, server-side tool
  fees and negotiated discounts are not modelled. The boundary is stated on
  screen, in the CSV export and in the README rather than left implicit.

## 0.1.0 - 2026-08-01

First working build.

### Added

- The cost engine: compounding conversation history, per-model tokenizers,
  promotional pricing windows, batch discounts, reasoning multipliers, and
  integer money arithmetic so the parts of a breakdown always sum to the total.
- The daily pricing pipeline: family-level capture patterns, an explicit trust
  ladder, cross-source disagreement flagging, and a public changelog.
- Four views — Estimate, Compare, Learn, Data & Alerts — with a guided tour, a
  command palette, light and dark themes, and a colour-vision-validated chart
  palette.
- 120 tests across the engine, tokenizer, pipeline, palette and components.
