# Accounts: the plan

**Status: a plan, not a build.** The owner decided on 2026-10-06 to plan for user
accounts. Nothing below is implemented, and the site still promises "no
accounts". That promise changes in the same release that ships the first sign-in,
not before.

## What accounts are for

Only things a reader cannot do today without one:

| Feature                          | Why it needs an account                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Saved scenarios across devices   | Today a scenario lives in a link or on one phone; an account lets both see it |
| One place to manage price alerts | Today each email and browser subscription is managed separately, by link      |
| Shared team workspaces (later)   | A team comparing models needs one list it can all edit                        |
| Higher API limits (later, maybe) | Only if the free API ever needs a limit; it has none today                    |

If none of these is being built, accounts are not needed. Each phase below ships
with a feature that uses it.

## How people sign in

**Email link first, no passwords.** The alerts service already confirms email
addresses, rate-limits by hashed IP, and checks for bots with Turnstile. A
sign-in link reuses all of that and means PromptSpend never stores a password,
so a database leak can never expose one.

"Sign in with Google" or "with Apple" can follow if people ask. If the iPhone app
offers any third-party sign-in, Apple's guideline 4.8 also requires a
privacy-focused option such as Sign in with Apple; email links alone do not
trigger it. Check the current guideline wording before building that phase.

## Where sign-in must live

**On `promptspend.com`, not `api.promptspend.dev`.** The website and the
alerts API are on different sites (`.com` and `.dev`). A login cookie set by
`.dev` would be a third-party cookie on the `.com` page, which Safari blocks
outright and other browsers are phasing out. So the sign-in and account routes
must answer under the `.com` domain, for example a Cloudflare Worker route at
`promptspend.com/account/*`, with the cookie scoped there.

The session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, holding a random
token whose hash is stored server-side, never the token itself. A login cookie
is "strictly necessary", so it does not need the analytics consent banner.

The apps keep a token in the phone's secure storage instead of a cookie.

## Data

New tables in the existing alerts database (Cloudflare D1):

- `users`: id, email, created, last sign-in. Nothing else.
- `sessions`: token hash, user id, created, expires, device label.
- `login_codes`: one-time sign-in link hashes, expiring in 15 minutes.
- `saved_scenarios`: user id, name, the same numeric scenario the share link
  already encodes. **Never prompt text**: the promise that pasted text stays on
  the device survives accounts.

An existing alert subscription with the same email is linked to the account on
first sign-in, with the user's confirmation.

## Duties that come with accounts

- **Delete everything on request, in the product.** Apple requires apps that let
  people create an account to let them delete it from inside the app
  (guideline 5.1.1(v)). Google Play requires an account-deletion link reachable
  from outside the app too. One "Delete account" action, on the website and in
  both apps, removes the user, sessions, saved scenarios and linked alerts.
- **Export on request.** A download of everything held about the account.
- **Store declarations change.** The App Store privacy label and the Google Play
  data-safety form must list email as linked to the user's identity for app
  functionality, and the store review notes must stop saying "no account".
- **Privacy policy and footer change** in the same release: what is stored,
  for how long, who processes it (Cloudflare), and how to delete it.
- **Security**: sign-in links are single use and short-lived; tokens are stored
  hashed; rate limits and Turnstile on every sign-in request; sign-out
  everywhere; a written plan for what to do if the database is ever exposed.

## Phases

1. **Web accounts for saved scenarios.** Sign-in by email link on the website,
   scenarios saved and listed, delete and export. The footer and privacy policy
   change in this release.
2. **App sign-in.** The same account in the iPhone and Android apps, with
   in-app deletion; store declarations updated and the apps resubmitted.
3. **Alerts under the account**, then **teams**, each only when wanted.

Each phase is large: it adds a server route on the `.com` domain, new tables,
new pages, new tests (including deletion actually deleting) and store review
for phase 2.

## Decisions to make before phase 1

- Which feature launches accounts (saved scenarios is the proposal).
- Email-link only, or a Google/Apple option from the start.
- How long an unused account is kept before it is deleted automatically.
