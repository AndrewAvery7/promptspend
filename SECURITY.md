# Security policy

PromptSpend is a static site with no accounts and no login. Nothing a visitor types or
pastes into the calculator is sent anywhere, which removes most of the usual attack surface. The pages
load from these remote origins: `https://launchnest.io`, for one badge image
(`img-src` only); `https://static.cloudflareinsights.com`, the Cloudflare Web
Analytics beacon (`script-src`), which reports only to the site's own
`/cdn-cgi/rum`, and reports a page's address without its query string or
fragment; and Google Analytics 4 (since 2026-10-29): `gtag.js` from
`https://www.googletagmanager.com` (`script-src`, and also `connect-src`
and `img-src`), reporting to
`https://www.google-analytics.com`, `https://region1.google-analytics.com`,
`https://region1.analytics.google.com`, and, for Google signals and ad
personalization, `https://stats.g.doubleclick.net`,
`https://googleads.g.doubleclick.net` and `https://www.google.com`
(`connect-src` and `img-src`). Where the
alerts API is configured, Turnstile's `https://challenges.cloudflare.com` is
admitted too.

There are three servers, all Cloudflare Workers, and only one of them holds
personal data:

- **The opt-in price-alerts API** in [`worker/`](worker), on a D1 database
  holding email subscribers and push subscriptions. Small and deliberately
  boring, but it is a backend that stores personal data and can send mail, so it
  is squarely in scope.
- **The public pricing API** in [`api/`](api), serving `promptspend.dev`,
  including the hosted MCP endpoint `POST /mcp`. It is stateless and keyless —
  it holds no data and has no accounts — but it re-serves prices to callers who
  cannot see the catalog behind it, which puts it inside the blast radius of the
  first item below. `/mcp` accepts JSON-RPC tool calls (model names and workload
  numbers) from anyone, answers them from the public catalog, and stores
  nothing; it is the one part of this server that takes a request body.
- **The apps' update server** in [`updates/`](updates), serving
  `updates.promptspend.dev`: signed app updates for the iPhone and Android
  apps. It keeps no record of who asks: its request logging is switched off
  (see the privacy policy, "App updates").

Two more surfaces re-serve those prices without being servers at all: the npm
MCP package ([`mcp/`](mcp), which runs on its user's machine) and the VS Code
extension ([`vscode/`](vscode)). Neither stores anything and neither accepts
input from anyone but its own user, but a
wrong price reaching either is the same class of bug as a wrong price on the
site, and reports about them belong here.

## Supported versions

The deployed site is built from `main`. There are no release branches and no
back-ported fixes: `main` is the supported version.

## Reporting a vulnerability

Either route works, whichever you prefer:

- **security@promptspend.com**
- GitHub's private vulnerability reporting — **Security → Report a
  vulnerability** on the repository

Please do not open a public issue with details in it.

Expect an acknowledgement within a few days. This is a small project maintained
in spare time, so please allow a reasonable window before disclosing publicly.

## What is in scope

- **Wrong prices, and anything that could make them wrong.** The pipeline
  publishes third-party data as fact. A way to get a bad number past the sanity
  rules, the schema validation or the review gate is the most serious class of
  bug this project has, even though it is not a "vulnerability" in the usual
  sense.
- **Anything that could transmit a pasted prompt.** Prompt text is the only
  sensitive data the page ever holds. It is never sent anywhere. The Content
  Security Policy is generated at build time (`vite.config.ts`) and opens
  `connect-src` only for the alerts API origin and Turnstile's
  `challenges.cloudflare.com`, so a compromised dependency has nowhere of its
  own to send it.
- **The alerts API.** Specifically: forging or replaying a `/v1/notify` call;
  using a confirm, unsubscribe or preferences token for a purpose or a
  subscriber it was not issued for; subscribing an address somebody does not
  control; reading another subscriber's address or followed models; getting the
  worker to make a request to a host that is not a real push service; and any
  way to make it send mail beyond the rate limit and Turnstile check. Details
  and rationale are in [docs/ALERTS.md](docs/ALERTS.md).
- **Supply chain**: a dependency, a GitHub Action, or the LiteLLM/OpenRouter
  feeds being used to reach the deployed site. Actions are pinned to commit
  SHAs; the pricing feeds are treated as untrusted input and cannot publish
  without passing validation.
- **Export safety**: the CSV export escapes and formula-neutralises every field
  (`src/lib/engine/csv.ts`). A way past that is in scope.

## What is out of scope

- Denial of service against GitHub Pages.
- Missing headers that GitHub Pages does not allow a static site to set. The
  CSP and referrer policy are declared in `<meta>` tags for that reason; if you
  know a way to set real headers there, that is a welcome issue rather than a
  vulnerability report.
- Findings that depend on an attacker already controlling the visitor's browser
  or machine.

## Data handling

The website (not the apps, the VS Code extension, the MCP server or the API)
counts visits two ways.

- **Google Analytics 4** (owner decision 2026-10-06; live 2026-10-24, paused, back on 2026-10-29 with a new property) sets the
  cookies `_ga` and `_ga_P27XJ53BH9`. It runs on promptspend.com only, loads
  for every visitor with a dismissible notice (or, with the one-line switch
  `ANALYTICS_REQUIRES_CONSENT` in `src/lib/analytics/config.ts`, only after
  _Accept_), and not at all when the visitor turned it off or the browser sends
  Global Privacy Control. Since 2026-10-29 Google's advertising and
  measurement features are on (owner decision). PromptSpend's code sends `page_location` and
  `page_referrer` whole, query string and fragment included, minus the
  alert-link key named in `PRIVATE_ADDRESS_PARAMS` (`alerts`), which
  `src/main.tsx` also takes out of the address bar before Google Analytics
  starts (`src/lib/alerts/link-token.ts`). Google signals and ad
  personalization are on and every consent type is granted. Pasted text is
  never passed to it (`src/lib/analytics/ga.ts`, with tests).
- **Cloudflare Web Analytics**: a cookieless beacon, injected by Cloudflare,
  that reports page address, referrer, country and timings to the site's own
  `/cdn-cgi/rum`. The policy admits its script origin
  (`static.cloudflareinsights.com`) but keeps `connect-src` closed to it.

Some of what the privacy page says rests on settings in the Google Analytics
account rather than in this repository, so they are recorded here: event and
user data retention **14 months**, with reset on new activity **on**; Google
signals **on**; ads personalization allowed in **all regions**; granular
location and device data collection **on**; all four account data-sharing options
**on**, including "Google products and services" (Google's
controller-to-controller terms accepted by the owner on 2026-10-29); the Google tag's cookie settings left at
Google's defaults (cookies last up to two years); every Enhanced measurement
option **on**, including page changes based on browser history events, site
search and form interactions; user-provided data collection **on**, with
**automatically detected** user-provided data on (Google's tag hashes an email
address typed into the price-alert form and sends it); no User-ID (the site has
no accounts); data redaction **on** for email addresses and for the query name
`alerts` (a third guard behind `PRIVATE_ADDRESS_PARAMS`); and no Google
Ads or BigQuery link. If
any of these is changed, change the privacy page in the same breath.

What that costs: `connect-src` now admits Google Analytics' collection hosts,
so a script that got onto the page could post data to an analytics account of
its own there. The hosts are named one by one (no wildcard) and
`npm run check:csp` fails on any origin it does not list. Pasted prompt text
stays in the tab: it is tokenised locally, is deliberately excluded from the
shareable URL, and is held in a bounded in-memory cache that is cleared when
the scenario is reset and discarded when the tab closes. `localStorage` holds
only interface choices: theme, accent and background, whether the welcome and
apps banners were dismissed, and the answer to the analytics notice.

If — and only if — you subscribe to price alerts, the alerts database holds:

- **Browser push:** the opaque endpoint URL the browser issued and its two
  encryption keys, plus the models you follow. Nothing that identifies a person.
- **Email:** your address, the models you follow, your cadence, and the date you
  subscribed. Consent is recorded as a salted hash of the IP, never the address
  itself. No name, no opens, no clicks. Cloudflare hosts the database and
  sends the mail; no other company receives the record.

Unsubscribing deletes the row and the follow list rather than flagging them.
Addresses that never confirm are deleted within a week.
