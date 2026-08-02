# Security policy

TokenTally is a static site with no backend, no accounts and no database. That
removes most of the usual attack surface, but two things are still worth
reporting carefully.

## Supported versions

The deployed site is built from `main`. There are no release branches and no
back-ported fixes: `main` is the supported version.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting — **Security → Report a
vulnerability** on the repository — rather than opening a public issue. If that
is unavailable to you, open an issue saying only that you have a security report
and asking for a contact route; do not include details in it.

Expect an acknowledgement within a few days. This is a small project maintained
in spare time, so please allow a reasonable window before disclosing publicly.

## What is in scope

- **Wrong prices, and anything that could make them wrong.** The pipeline
  publishes third-party data as fact. A way to get a bad number past the sanity
  rules, the schema validation or the review gate is the most serious class of
  bug this project has, even though it is not a "vulnerability" in the usual
  sense.
- **Anything that could transmit a pasted prompt.** Prompt text is the only
  sensitive data the page ever holds. It is never sent anywhere, and the
  Content Security Policy in `index.html` restricts `connect-src` to `'self'`
  to keep that true even if a dependency is compromised.
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

There is no analytics, no cookie, no account and no server that receives
anything. Pasted prompt text stays in the tab: it is tokenised locally, is
deliberately excluded from the shareable URL, and is held in a bounded in-memory
cache that is cleared when the scenario is reset and discarded when the tab
closes. `localStorage` holds two things: whether the welcome banner was
dismissed, and your theme and accent choice.
