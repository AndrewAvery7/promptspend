# iPhone and iPad QA — iOS build 22 attempt

Status: failed before producing an installable binary; no TestFlight upload.

## Candidate and evidence

- App: PromptSpend 0.1.0; requested build 22.
- EAS build: `ec50765a-6cdd-4f0d-b9e2-3f5f4879d043`.
- Source: `a4a26e07b6368055a46dd2b36da8be1aee900447` (`origin/main`).
- Profile: production / store, intended for private TestFlight QA.
- [Authenticated EAS record](https://expo.dev/accounts/crestwood-holdings/projects/promptspend-app/builds/ec50765a-6cdd-4f0d-b9e2-3f5f4879d043).
- EAS result: `ERRORED` at the Xcode build step; no IPA was produced.

## Root cause

The existing Apple provisioning profile for `com.promptspend.app` does not
contain the Associated Domains capability or the
`com.apple.developer.associated-domains` entitlement. The source intentionally
declares `applinks:promptspend.com` for restorable scenario links, and the
release contract requires that configuration. Removing it would hide or break
planned universal-link behavior, so this is not being “fixed” by weakening the
app configuration.

The required remediation is Apple-account/signing work: after the individual
to organization migration completes, enable Associated Domains for the App ID,
regenerate the EAS iOS provisioning profile, and rebuild. Until then, iOS
build 17 remains the last installable TestFlight binary but is not a current
source QA candidate.

No Apple submission, App Review submission, or public release was performed.
