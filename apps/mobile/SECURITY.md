# Mobile dependency security notes

Last reviewed: September 6, 2026
<!-- audit-fingerprint: 0021a497e019 (3 findings: 3 moderate, 0 high, 0 critical) -->

## Current scaffold audit

Re-derived September 5, 2026 against the September 1 lockfile (commit ca8d2e4,
"clear expo-doctor patch drift"): Expo 57.0.19, expo-router 57.0.18,
react-native-webview 13.16.1. `npm audit --package-lock-only --json` reports
3 findings (3 moderate, 0 high, 0 critical), all propagation from one leaf
advisory:

1. `decode-uri-component@0.2.2` (GHSA-vcc3-ghjq-m6fr, CWE-400/405/407): a
   malformed percent-encoded input can make decoding take exponential time.
   Reached through `expo-router > query-string@7.1.3 > decode-uri-component`,
   the chain expo-router uses to parse the query string of an incoming link.

The two leaf advisories in the August 16 triage (`image-size@1.2.1`,
`uuid@7.0.3`) are no longer present: `image-size` has left the dependency
graph and `uuid` resolves to 11.1.1.

Exposure. The app registers the `promptspend://` URL scheme, and two routes
read link query parameters (`data.tsx` reads `alerts`, `learn.tsx` reads
`help`). A deliberately malformed link could therefore slow or hang query
parsing in the app's own process. That requires the user to open a crafted
link, affects only that user's session, and exposes no data; it is a
nuisance-grade denial of service, not a breach path. Reachable in shipped
runtime behavior, so it is recorded here rather than dismissed, and it does not
meet the release-blocking bar below (not critical, no data exposure).

## Why `npm audit fix --force` is prohibited

npm's non-writing fix preview changes nothing, and its only proposed fix is a
semver-major downgrade of `expo-router` to 5.1.11, which does not match the
SDK 57 project and would replace the verified platform foundation with an
unsupported dependency combination. The same was true of the August findings.

Do not run `npm audit fix --force`.

## Required controls

- Keep Expo and React Native on versions accepted by `npx expo install --check` and `npx expo-doctor`.
- Do not feed untrusted or user-supplied images into the local Metro/build asset pipeline.
- Use only reviewed repository assets during development and CI.
- Re-run the full npm audit at each Expo patch update and before every beta/release build.
- Upgrade when Expo publishes an SDK 57-compatible `expo-router` whose `query-string` depends on a fixed `decode-uri-component` (above 0.4.2).
- Keep link handling to the two parameters read today; any new deep-link parameter re-opens this triage.
- Reassess immediately if the app later adds image import, document upload, or any server-side bundling of user content.
- Block release for any critical advisory or any advisory shown to be reachable in shipped runtime behavior.

This is a dated triage record derived from the September 1 lockfile, not a
permanent waiver. The dependency state must be re-derived whenever that
lockfile changes, and within 14 days of any release check.

## How this record stays current

The comment under "Last reviewed" is a fingerprint of the `npm audit` findings
this triage was written against. `scripts/audit-triage.mjs --refresh` re-runs
the audit; when the findings are unchanged it moves the date, and when they
are not it stops and prints them, because then a person has to re-read the
findings and rewrite this file, then run `--stamp` to record the new
fingerprint. The workflow `mobile-audit.yml` runs `--refresh` every Monday and
commits the date when it moved. The release check enforces the 14-day rule
when `RELEASE_CHECK=1`; on ordinary pushes it only warns.
