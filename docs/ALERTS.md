# Price alerts

Two delivery channels — Web Push and email — served by a Cloudflare Worker in
[`worker/`](../worker). This document covers how it fits together, how to switch
the custom domain on, and what to do when something misbehaves.

---

## What exists

| Piece           | Where                                                        | Notes                                             |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| Alerts API      | `worker/`                                                    | Cloudflare Worker, `promptspend-alerts`           |
| Subscriber data | D1 `promptspend-alerts`                                      | `5b28b2b1-1b5e-4209-a771-e5ec24ca32b1`            |
| Browser client  | `src/lib/alerts/`, `src/components/AlertsPanel.tsx`          |                                                   |
| Native client   | `apps/mobile/src/lib/emailAlerts.ts`, `EmailAlertCenter.tsx` | Native UI; isolated Turnstile WebView only        |
| Service worker  | `public/sw.js`                                               | Push display only — deliberately no offline cache |
| Change notifier | `scripts/notify-alerts.ts`                                   | Runs on push to `main`                            |

There is no KV binding. There was one, and nothing ever read it; an unused
binding is a claim about what this Worker can reach, and that claim should be
true.

Live at `https://api.promptspend.dev`, attached as a custom domain in
`worker/wrangler.jsonc` — see [DOMAINS.md](DOMAINS.md). The
`promptspend-alerts.crestwood.workers.dev` address still resolves and is not
used by anything.

### Endpoints

| Method       | Path                       | Purpose                                               |
| ------------ | -------------------------- | ----------------------------------------------------- |
| `GET`        | `/health`                  | Configuration and dependency check                    |
| `GET`        | `/v1/config`               | What the browser needs before offering either channel |
| `POST`       | `/v1/push/subscribe`       | Register or update a push subscription                |
| `POST`       | `/v1/push/unsubscribe`     | Forget one                                            |
| `POST`       | `/v1/push/test`            | Send one notification to the caller's own endpoint    |
| `POST`       | `/v1/email/subscribe`      | Start double opt-in                                   |
| `POST`       | `/v1/email/manage/request` | Send an enumeration-resistant, short-lived code       |
| `POST`       | `/v1/email/manage/verify`  | Exchange a valid one-time code for preferences        |
| `GET`        | `/v1/email/confirm`        | Activate a subscription                               |
| `GET`/`POST` | `/v1/email/unsubscribe`    | GET asks, POST acts (see below)                       |
| `GET`/`POST` | `/v1/preferences`          | Read and update, authenticated by a signed token      |
| `POST`       | `/v1/notify`               | HMAC-signed, called by CI when prices move            |

---

## Switching it on

The domain cutover — nameservers, DNS records, Worker route, repository
variables — is in **[DOMAINS.md](DOMAINS.md)**. The two steps below are
alerts-specific and are the last things to happen.

### Turn on email

Email Sending requires the sending domain to use Cloudflare DNS, which the
cutover arranges.

1. Cloudflare dashboard → **Compute → Email Service → Email Sending → Onboard
   Domain** → `promptspend.com`. This adds SPF, DKIM, DMARC and the `cf-bounce`
   MX records.
2. Create an API token with **Email Sending: Edit**.
3. `cd worker && npx wrangler secret put EMAIL_API_TOKEN`
4. In `wrangler.jsonc` set `"EMAIL_TRANSPORT": "cloudflare"` and
   `"EMAIL_FROM": "alerts@promptspend.com"`, then deploy.

**All four are done** — `wrangler.jsonc` carries `"EMAIL_TRANSPORT":
"cloudflare"` and `"EMAIL_FROM": "alerts@promptspend.com"`. The steps are kept as
the runbook for a redeployment or a second environment.

Before step 4, `EMAIL_TRANSPORT` is `console`: the flows all run and the messages
are logged rather than sent. `GET /v1/config` reports `emailEnabled` and the UI
says so plainly rather than offering a form that cannot work.

### Turn on Turnstile

Not optional in production. Without it, a script posting addresses to
`/v1/email/subscribe` sends a confirmation email for each one — burning the free
quota and the domain's sending reputation.

1. Cloudflare dashboard → **Turnstile → Add site**.
2. Put the site key in `wrangler.jsonc` as `TURNSTILE_SITE_KEY`.
3. `npx wrangler secret put TURNSTILE_SECRET_KEY`, then deploy.

Steps 1 and 2 are done — the site key is in `wrangler.jsonc`. Whether the secret
is set is not visible from this repository by design, and it is the secret that
switches enforcement on.

The secret being set is what switches enforcement on. The browser reads the site
key from `/v1/config`, so no front-end rebuild is needed.

The native app renders `public/mobile-turnstile.html` in an ephemeral WebView.
That page receives only the public site key and light/dark choice and returns a
Turnstile token; email addresses, selected models, scenarios, and prompt text
never enter the WebView. The Worker validates the mobile action server-side.

Apply `worker/migrations/0002_email_manage_codes.sql` before deploying the
native management endpoints. Codes expire after ten minutes, are stored only as
an HMAC bound to the subscriber id, work once, and are invalidated after five
failed attempts. Request responses are identical for active and unknown
addresses, and lookup/delivery runs after the response, so neither content nor
email-provider latency discloses list membership.

---

## Costs

Everything except email sits inside the Workers Paid allowances by a wide
margin. At 10,000 subscribers and 15 change events a month the worker uses
roughly 0.5% of the request allowance, 1% of CPU, and 0.0006% of D1 row reads.

Email is the only meter that bites: 3,000 messages a month are included, then
$0.35 per thousand. A weekly digest stays free to about 690 subscribers; 5,000
subscribers costs about $6.50 a month. Push has no variable cost at any scale —
delivery is handled by the browser vendors' own push services.

---

## Design decisions worth knowing

**Push encryption is written out rather than imported.** The mainstream
`web-push` library targets Node's crypto module and does not run unmodified on
Workers, and a dependency that can read every notification body is one worth not
having. `worker/src/push/encrypt.ts` implements RFC 8291 in about a hundred
lines of WebCrypto, and `encrypt.test.ts` checks its output byte for byte
against the worked example in RFC 8291 §5. That is the one test in this project
measured against an external authority rather than our own expectations — a
round-trip test passes just as happily when both halves share a misreading, and
the browser is the thing that actually has to open these messages.

**Tokens are purpose-scoped.** A confirm, unsubscribe or preferences link is an
HMAC over its own claims, with the purpose inside the signature. Without that,
the unsubscribe link in a footer would also be a credential for editing that
subscriber's settings — and unsubscribe links get forwarded, archived and
prefetched by mail scanners.

**GET does not unsubscribe.** Because scanners prefetch links, a GET renders a
confirmation button and the POST performs the action. RFC 8058 one-click
unsubscribe from the mail client is unaffected: it POSTs directly.

**Push endpoints are restricted to known hosts.** Without the allowlist in
`worker/src/lib/validate.ts`, the endpoint field is a server-side request
forgery primitive — an attacker registers an internal URL and the worker POSTs
to it from Cloudflare's network on every price change.

**Idempotency is a primary key, not a check.** Each (event, subscriber, channel)
is claimed by an `INSERT … ON CONFLICT DO NOTHING`, so two concurrent fan-outs
cannot both win. The event id is derived from the catalog hash, so a re-run of
the notify job is a no-op.

**Notification is triggered by a push to `main`, not by the sync job.** A change
that trips a sanity rule goes to a pull request first; notifying from the sync
job would have told people about numbers still sitting unmerged, and would have
missed changes a human reviewed and merged by hand.

**The weekly digest sends even in a quiet week.** A digest that only arrives
when something happened is indistinguishable from a digest that has quietly
broken, and being able to tell those apart is the whole point of this project.

---

## Operating notes

### Secrets

Generate with `cd worker && npx tsx scripts/keygen.ts`, or
`--out secrets.json` to write a file for `wrangler secret bulk` without the
values reaching the screen.

| Secret                 | Where                         | Notes                                       |
| ---------------------- | ----------------------------- | ------------------------------------------- |
| `VAPID_PUBLIC_KEY`     | Worker                        | Served publicly by `/v1/config` — by design |
| `VAPID_PRIVATE_KEY`    | Worker                        | **Not rotatable without cost** — see below  |
| `TOKEN_SECRET`         | Worker                        | Signs every email link                      |
| `NOTIFY_SECRET`        | Worker **and** Actions secret | Must match exactly                          |
| `EMAIL_API_TOKEN`      | Worker                        | Cloudflare token, Email Sending: Edit       |
| `TURNSTILE_SECRET_KEY` | Worker                        | Its presence enables enforcement            |

Rotating the VAPID pair invalidates **every push subscription already issued** —
the public key is baked into each one at subscribe time. Every subscriber goes
silently dead and has to opt in again. Rotating `TOKEN_SECRET` invalidates every
outstanding confirm, unsubscribe and preferences link, which is less severe but
means a live newsletter's unsubscribe buttons stop working.

### Redeploy after changing secrets

Wrangler's versioned deploys mean a newly-added secret is not visible to the
running version. Run `npx wrangler deploy` afterwards and confirm with
`/health` — `push`, `tokenSecret` and `notifySecret` should all read `true`.

### Diagnosing

```bash
cd worker && npx wrangler tail
```

`/health` distinguishes the three things that silently stop this working: a
missing secret, a mismatched VAPID pair, and an unreachable database. A
mismatched pair is the nastiest — it produces valid-looking JWTs that every push
service rejects, so it is checked explicitly rather than inferred.

### Scale ceiling

A fan-out is capped at 700 sends per invocation, comfortably inside the Worker
1000-subrequest limit, and reports a `deferred` count for anything beyond it.
Past roughly that many subscribers the right change is a Cloudflare Queue
between `/v1/notify` and the senders — worth building at the point the deferred
count stops being zero, and not before.

---

## Testing

```bash
cd worker && npm test
```

98 tests run inside workerd against a real D1, so the query layer
is exercised against genuine SQLite and the migrations are proved to apply. The
full subscribe → confirm → change preferences → unsubscribe lifecycle is
covered, as are signature rejection, replay rejection, CORS, and the SSRF
allowlist.

Not covered by automated tests: delivery to a real push service, and delivery of
a real email. Both cross a network boundary to a third party. `POST
/v1/push/test` exists so a person can prove the first one in a browser; the
second is proved by subscribing once after step 4 above.
