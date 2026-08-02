# Domains

PromptSpend owns two domains, and they do different jobs. This document is the
architecture, the cutover runbook, and the reasoning behind both.

---

## The architecture

| Host                  | Serves                      | Why                                                                          |
| --------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `promptspend.com`     | The app                     | Canonical. Every link, every share, every search result points here.         |
| `www.promptspend.com` | 301 → apex                  | One canonical host; two would split link equity.                             |
| `api.promptspend.dev` | The alerts API (`worker/`)  | Keeps API traffic and its CORS surface off the marketing domain.             |
| `promptspend.dev`     | Developer hub — **planned** | The public pricing API and its documentation. Until it exists, 301 → `.com`. |

### Why `.dev` is not simply a redirect

A redirect is the safe answer and it earns nothing. The most valuable asset this
project has is not the calculator — it is **a machine-readable LLM pricing
catalog that re-checks itself every morning and shows its sources**. Nothing
else free does that reliably.

Published as a documented, versioned, CORS-open JSON API, that catalog becomes
something other developers depend on: they link to it from blog posts, README
files and answers. Those are real editorial backlinks from technical sites,
which is the single strongest organic ranking signal there is and the hardest
one to buy. A redirect produces none of them.

`.dev` is also on the HSTS preload list — HTTPS is enforced by the browser
before the first request — which is exactly what you want for an API and
irrelevant for marketing pages.

**The rule that must not be broken:** `promptspend.dev` never hosts a copy of
the `.com` content. Two hosts serving the same words compete with each other and
split the ranking. Distinct purpose, distinct content, canonical tags pointing
at themselves, and cross-links between them.

---

## Cutover runbook

Order matters. Flipping the site variables before DNS resolves will publish a
site that 404s its own JavaScript and a canonical tag pointing nowhere.

### 1. Add both zones to Cloudflare — _yours to do_

The deploy token has `zone (read)` and cannot create zones, and the nameserver
change has to happen at the registrar regardless.

1. Cloudflare dashboard → **Add a site** → `promptspend.com` → Free plan.
   Cloudflare scans and imports whatever DNS exists, including the TXT record
   GitHub used for verification. **Check that record survived the import.**
2. Repeat for `promptspend.dev`.
3. Cloudflare shows two nameservers. Set them at the registrar, replacing what
   is there.
4. Wait for the zone to read **Active** — usually minutes, occasionally hours.

### 2. DNS records for the site

On `promptspend.com`:

| Type  | Name  | Value                    | Proxy        |
| ----- | ----- | ------------------------ | ------------ |
| A     | `@`   | `185.199.108.153`        | **DNS only** |
| A     | `@`   | `185.199.109.153`        | **DNS only** |
| A     | `@`   | `185.199.110.153`        | **DNS only** |
| A     | `@`   | `185.199.111.153`        | **DNS only** |
| AAAA  | `@`   | `2606:50c0:8000::153`    | **DNS only** |
| AAAA  | `@`   | `2606:50c0:8001::153`    | **DNS only** |
| AAAA  | `@`   | `2606:50c0:8002::153`    | **DNS only** |
| AAAA  | `@`   | `2606:50c0:8003::153`    | **DNS only** |
| CNAME | `www` | `andrewavery7.github.io` | **DNS only** |

> **Grey cloud, not orange.** Proxying GitHub Pages through Cloudflare breaks
> the certificate challenge GitHub uses, and produces redirect loops when
> Cloudflare's TLS mode and GitHub's HTTPS enforcement disagree. Every other
> site on this account is already DNS-only for the same reason.

Verify before continuing:

```bash
dig +short promptspend.com A
```

### 3. Point GitHub Pages at the domain

Repository → **Settings → Secrets and variables → Actions → Variables**:

| Variable    | Value                     |
| ----------- | ------------------------- |
| `SITE_URL`  | `https://promptspend.com` |
| `BASE_PATH` | `/`                       |

Then **Settings → Pages → Custom domain** → `promptspend.com` → wait for the
check → tick **Enforce HTTPS**.

The `CNAME` file Pages needs is emitted into the build artifact automatically
once `SITE_URL` names a non-`github.io` host — see `seoAssets` in
`vite.config.ts`. Nothing is committed by hand.

Push anything to `main` (or re-run the deploy workflow) to rebuild with the new
values. Confirm with:

```bash
curl -s https://promptspend.com/ | grep -o '<link rel="canonical"[^>]*>'
```

### 4. Move the alerts API to `api.promptspend.dev`

In `worker/wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "api.promptspend.dev", "custom_domain": true }],
"vars": {
  "SITE_ORIGIN": "https://promptspend.com",
  "SITE_BASE_PATH": "/",
  "ALLOWED_ORIGINS": "https://promptspend.com,https://www.promptspend.com,http://localhost:5173",
  ...
}
```

```bash
cd worker && npx wrangler deploy
```

Then set the repository variable `ALERTS_API` to `https://api.promptspend.dev`
and redeploy the site. That value feeds both the client and the generated
`connect-src`, so the Content Security Policy follows automatically.

### 5. Redirect the `.dev` apex

Until the developer hub exists, a bare `promptspend.dev` should not 404.
Cloudflare → `promptspend.dev` → **Rules → Redirect Rules**: incoming requests
matching hostname `promptspend.dev` → 301 → `https://promptspend.com` with path
and query preserved. Free, and replaced later by the real thing.

### 6. Email

Email Sending requires the domain to use Cloudflare DNS, which step 1 arranged.

1. **Compute → Email Service → Email Sending → Onboard Domain** →
   `promptspend.com`. This adds SPF, DKIM, DMARC and the `cf-bounce` MX records.
2. Create an API token with **Email Sending: Edit**.
3. `cd worker && npx wrangler secret put EMAIL_API_TOKEN`
4. In `wrangler.jsonc`: `"EMAIL_TRANSPORT": "cloudflare"` and
   `"EMAIL_FROM": "alerts@promptspend.com"`, then deploy.

Send from `.com`, not `.dev`. Recipients recognise it, and the sending
reputation you build belongs to the domain people actually see.

### 7. Turnstile

Not optional once email is live — see [ALERTS.md](ALERTS.md#5-turn-on-turnstile).

### 8. Tell search engines

1. [Google Search Console](https://search.google.com/search-console) → add
   `promptspend.com` as a **Domain** property (verified by a TXT record, which
   is now easy since DNS is on Cloudflare).
2. Submit `https://promptspend.com/sitemap.xml`.
3. Same in [Bing Webmaster Tools](https://www.bing.com/webmasters) — it also
   feeds ChatGPT's browsing, which matters for a developer tool.
4. Leave the old GitHub Pages URL alone. GitHub redirects
   `andrewavery7.github.io/token-tally/` → the renamed repo → the custom domain,
   so the handful of existing links keep working.

---

## Rollback

Every step is reversible without data loss.

- **Site:** clear the `SITE_URL` and `BASE_PATH` variables and redeploy. The
  `CNAME` file stops being emitted and Pages falls back to `github.io`.
- **API:** remove `routes` from `wrangler.jsonc` and deploy; the
  `workers.dev` hostname never goes away.
- **Email:** set `EMAIL_TRANSPORT` back to `console`. Flows keep working and log
  instead of sending.

---

## Inventory

Everything currently naming a host, so nothing is missed:

| Where                   | Setting                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| Repo variable           | `SITE_URL`                                                                 |
| Repo variable           | `BASE_PATH`                                                                |
| Repo variable           | `ALERTS_API`                                                               |
| `worker/wrangler.jsonc` | `routes`, `SITE_ORIGIN`, `SITE_BASE_PATH`, `ALLOWED_ORIGINS`, `EMAIL_FROM` |
| `worker/src/fanout.ts`  | `List-Id` (`alerts.promptspend.com`)                                       |
| `.env.local`            | `VITE_ALERTS_API` for local development                                    |

The site's canonical link, Open Graph tags, structured data, `robots.txt`,
`sitemap.xml` and `CNAME` are all **generated** from `SITE_URL`. They are not in
this table because they cannot drift.
