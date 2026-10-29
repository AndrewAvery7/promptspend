# Security policy

PromptSpend is a static site with no accounts and no login. Nothing a visitor types or
pastes into the calculator is sent anywhere, which removes most of the usual attack surface. The pages
load from these remote origins: `https://launchnest.io`, for one badge image
(`img-src` only); `https://static.cloudflareinsights.com`, the Cloudflare Web
Analytics beacon (`script-src`), which reports only to the site's own
`/cdn-cgi/rum`, and reports a page's address without its query string or
fragment; Google Analytics 4 is paused (since 2026-10-29), so no Google origin is named, and while it runs `gtag.js` comes from `https://www.googletagmanager.com` and reports to `https://www.google-analytics.com`, `https://region1.google-analytics.com` and `https://region1.analytics.google.com`. Where the
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
counts visits one way, and Google Analytics is paused.

- **Google Analytics 4 is paused** (owner decision 2026-10-29; it ran 2026-10-24 to 2026-10-29). No Google Analytics account exists for the website to report to, so `GOOGLE_ANALYTICS_ENABLED` in `src/lib/analytics/config.ts` is `false`: nothing from Google loads, no notice shows, the page policies name no Google host (`npm run check:csp` fails if one reappears), and an earlier visitor's `_ga` cookies are cleared on their next visit. The code and its tests stay in place. When it runs it sets the cookies `_ga` and `_ga_08GFGLY4VD`, loads only on promptspend.com, and sends `page_location` and `page_referrer` cut down to origin and path (no query string, no fragment), the page title, and fixed settings, with Google's automatic page view, Google signals and ad personalization off, and nothing a visitor types, pastes or enters in a form (`src/lib/analytics/ga.ts`, with tests).
- **Cloudflare Web Analytics**: a cookieless beacon, injected by Cloudflare,
  that reports page address, referrer, country and timings to the site's own
  `/cdn-cgi/rum`. The policy admits its script origin
  (`static.cloudflareinsights.com`) but keeps `connect-src` closed to it.

When Google Analytics returns, what the privacy page says will rest on settings in the new account rather than in this repository, so they are recorded here: event data retention **2 months**; Google signals **off**; and under the web stream's Enhanced measurement, **"Page changes based on browser history events" off** (the calculator rewrites its own address as the scenario changes, and Google's automatic page view for that would report the full address, query string included), with **Form interactions** and **Site search** off too; no User-ID or user-provided data collection, and no Google Ads or BigQuery link. "Granular location and device data collection" decides how precise the location the privacy page describes is. If any of these is changed, change the privacy page in the same breath.

While Google Analytics is paused, `connect-src` admits no analytics host. When it runs, it admits Google Analytics' collection hosts, and that costs something: a script that got onto the page could post data to an analytics account of its own there. The hosts are named one by one (no wildcard) and `npm run check:csp` fails on any origin it does not list. Pasted prompt text
stays in the tab: it is tokenised locally, is deliberately excluded from the
shareable URL, and is held in a bounded in-memory cache that is cleared when
the scenario is reset and discarded when the tab closes. `localStorage` holds
only interface choices: theme, accent and background, whether the welcome and
apps banners were dismissed. An earlier answer to the analytics notice may remain; it does nothing now.

If — and only if — you subscribe to price alerts, the alerts database holds:

- **Browser push:** the opaque endpoint URL the browser issued and its two
  encryption keys, plus the models you follow. Nothing that identifies a person.
- **Email:** your address, the models you follow, your cadence, and the date you
  subscribed. Consent is recorded as a salted hash of the IP, never the address
  itself. No name, no opens, no clicks. Cloudflare hosts the database and
  sends the mail; no other company receives the record.

Unsubscribing deletes the row and the follow list rather than flagging them.
Addresses that never confirm are deleted within a week.
