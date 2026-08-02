# The public pricing API

`promptspend.dev` is the developer hub: a keyless, CORS-open JSON API over the
pricing catalog, plus the documentation for it. This file is the architecture,
the runbook for switching it on, and the reasoning behind both.

The code is `api/` — a Cloudflare Worker with **no D1, no KV, no secrets and no
bindings of any kind.** It reads one public file and serves it back in several
shapes. Anything it cannot reach is something it cannot leak.

---

## Why this and not a redirect

The most valuable thing this project owns is not the calculator. It is a
machine-readable LLM pricing catalog that re-checks itself every morning and
shows its sources. Nothing else free does that reliably.

Published as a documented, versioned, keyless API, that catalog becomes
something other developers depend on — and link to, from README files, blog
posts and answers. Editorial links from technical sites are the strongest
organic ranking signal there is and the hardest one to buy. A 301 to
`promptspend.com` earned none of them.

**The rule that must not be broken:** `.dev` never hosts a copy of the `.com`
content. Two hosts serving the same words compete with each other and split the
ranking. Distinct purpose, distinct content, canonical tags pointing at
themselves, cross-links between them.

---

## Endpoints

| Endpoint             | Returns                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `GET /`              | The developer hub (HTML)                                           |
| `GET /v1/models`     | Every model in full                                                |
| `GET /v1/models/:id` | One model; 404 if unknown                                          |
| `GET /v1/providers`  | Every provider, with a model count                                 |
| `GET /v1/prices`     | Flat rows — the numbers only                                       |
| `GET /v1/prices.csv` | The same rows as CSV, RFC 4180                                     |
| `GET /v1/health`     | Whether a valid catalog is readable, and how many rows are flagged |
| `GET /openapi.json`  | OpenAPI 3.1, with the server URL taken from the request            |
| `GET /llms.txt`      | The same index in the form an agent reads first                    |
| `GET /robots.txt`    | Index the hub, stay out of `/v1/`                                  |

`/v1/models`, `/v1/prices` and `/v1/prices.csv` accept `?provider=`, `?status=`
and `?aliases=include`. Routing aliases are excluded by default so one
purchasable model is never counted twice.

### Deliberate choices worth not undoing

- **`Access-Control-Allow-Origin: *`**, where the alerts API allowlists origins.
  The difference is what is at stake: that API accepts an email address, so a
  page anywhere on the web must not be able to submit one on a visitor's behalf.
  This one is read-only and serves data that is already public. Being callable
  from any page is not a weakness of the design, it _is_ the design.
- **No key.** A key would create an account system, a support burden and a
  database, to gate data that is published at a URL anybody can read.
- **An unknown endpoint 404s before the catalog is read.** A typo in a URL
  should not be able to report 503 because the origin happened to be down.
- **The OpenAPI `servers` URL comes from the request**, so a `workers.dev`
  preview or `wrangler dev` never hands a generated client a production URL.

---

## Where the data comes from

The catalog is **fetched from `promptspend.com` at request time**, not bundled
into the Worker.

Bundling would be faster and would mean the API is only as fresh as its last
deploy. Prices change on a daily cron that has nothing to do with this Worker,
so a bundled copy would need a deploy every morning to stay true — and the
failure mode of forgetting is an API confidently serving last week's numbers.

Fetching costs one origin request per edge location per five minutes.

There is deliberately **no bundled fallback**. A snapshot baked in at deploy time
could be months old, and "here are some prices, they might be from March" is
worse than an honest 503. What there is instead: a cached copy retained for a
day and served with `X-PromptSpend-Stale: true` if the origin cannot be reached.
Stale and dated beats absent; stale and undated does not.

Every fetched catalog is run through `validateCatalog` — the same rules the site
enforces at load — before anything is served. An API that will serve whatever
its upstream hands it has no more integrity than that upstream.

---

## Going live

The Worker is written, tested and deploys with one command. Three things have to
happen in Cloudflare first, and **the first one is not optional**.

### 1. Narrow the existing redirect rule — _yours to do_

`promptspend.dev` currently 301s to `promptspend.com` via a Redirect Rule.
**Rules run before Workers**, so while that rule matches the apex, this Worker
will never see a request.

Cloudflare → `promptspend.dev` → **Rules → Redirect Rules** → edit the existing
rule:

- Change the expression from hostname **equals `promptspend.dev`** to hostname
  **equals `www.promptspend.dev`**
- Change the target to `https://promptspend.dev` (preserving path and query)

That single edit frees the apex and keeps `www` from dead-ending. Do not delete
the rule outright unless you also delete the `www` DNS record.

### 2. Deploy

```bash
cd api && npx wrangler deploy
```

`wrangler.jsonc` declares `promptspend.dev` as a custom domain, so the deploy
creates the DNS record and the certificate itself.

### 3. Check

```bash
curl -s https://promptspend.dev/v1/health
curl -sI https://promptspend.dev/ | grep -i content-security-policy
```

`/v1/health` should report `ok: true`, a `generatedAt` matching the site, and a
`needsReview` count. If it reports 503, the origin fetch failed — check that
`https://promptspend.com/data/pricing.json` is reachable.

### 4. Tell the search engines about the hub

Add `promptspend.dev` to Google Search Console and Bing Webmaster Tools as its
own property. It is a separate site with separate content, and it will not
inherit anything from the `.com` property.

---

## Rollback

Reversible without data loss, because there is no data.

- **Take it down:** widen the Redirect Rule back to hostname equals
  `promptspend.dev`. Rules run first, so the Worker stops receiving traffic
  immediately and nothing needs to be deleted.
- **Undeploy:** `npx wrangler delete` in `api/`. The DNS record Cloudflare
  created for the custom domain goes with it.

---

## A note on the two API hostnames

`api.promptspend.dev` is the **alerts** API — push subscriptions, email
preferences, the notify webhook. It is origin-restricted and holds a database.

`promptspend.dev` is this one — public, keyless, read-only, no database.

The naming reads backwards, and it is not worth fixing: `api.promptspend.dev` is
baked into the deployed site's configuration, its Content Security Policy and
every existing push subscription, and renaming it would invalidate all three to
buy nothing but a tidier hostname.
