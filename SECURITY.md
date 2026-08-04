# Security policy

PromptSpend is a static site with no accounts and no login. The calculator itself
sends nothing anywhere, which removes most of the usual attack surface.

There are two servers, both Cloudflare Workers, and only one of them holds
anything:

- **The opt-in price-alerts API** in [`worker/`](worker), on a D1 database
  holding email subscribers and push subscriptions. Small and deliberately
  boring, but it is a backend that stores personal data and can send mail, so it
  is squarely in scope.
- **The public pricing API** in [`api/`](api), serving `promptspend.dev`. It is
  stateless, keyless and read-only — it holds no data and has no accounts — but
  it re-serves prices to callers who cannot see the catalog behind it, which
  puts it inside the blast radius of the first item below.

Two more surfaces re-serve those prices without being servers at all: the MCP
server ([`mcp/`](mcp)) and the VS Code extension ([`vscode/`](vscode)). Neither
stores anything and neither accepts input from anyone but its own user, but a
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
  `connect-src` for the alerts API origin and nothing else, so a compromised
  dependency still has nowhere to send it.
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

There is no analytics and no cookie. Pasted prompt text stays in the tab: it is
tokenised locally, is deliberately excluded from the shareable URL, and is held
in a bounded in-memory cache that is cleared when the scenario is reset and
discarded when the tab closes. `localStorage` holds two things: whether the
welcome banner was dismissed, and your theme and accent choice.

If — and only if — you subscribe to price alerts, the alerts database holds:

- **Browser push:** the opaque endpoint URL the browser issued and its two
  encryption keys, plus the models you follow. Nothing that identifies a person.
- **Email:** your address, the models you follow, your cadence, and the date you
  subscribed. Consent is recorded as a salted hash of the IP, never the address
  itself. No name, no opens, no clicks, no third-party processor.

Unsubscribing deletes the row and the follow list rather than flagging them.
Addresses that never confirm are deleted within a week.
