# PromptSpend Mobile Release Runbook

Status: operational draft; production submission requires the go/no-go gate.

Last reviewed: 2026-09-07

## Release principle

Build once, test that exact artifact, and submit that exact artifact. Never fix
metadata by silently changing the binary, never reuse screenshots from a
different build, and never create a duplicate EAS submission merely because a
store is slow to process the first one.

## 1. Branch and data safety

From the repository root:

```powershell
git fetch origin
git status --short
git rev-list --left-right --count origin/main...HEAD
git merge-base --is-ancestor origin/main HEAD
```

The release branch must contain current `origin/main`. Preserve unrelated user
files, especially `docs/DEFERRED.md` and `referrers-2026-08-10.json`; they are
excluded from EAS archives and must never be staged as part of mobile work.

Use the public repository identity before committing:

```powershell
git config user.name AndrewAvery7
git config user.email 204509720+AndrewAvery7@users.noreply.github.com
```

Sweep staged content for personal filesystem paths, credentials, secrets,
private prompts, and unnecessary identity details.

## 2. Verify the candidate

Root workspace:

```powershell
npm.cmd run verify
```

Mobile workspace:

```powershell
Set-Location apps/mobile
npm.cmd ci
npm.cmd run test -- --ci
npm.cmd run typecheck
npm.cmd run lint
$env:RELEASE_CHECK = '1'; npm.cmd run check:release
node scripts/audit-triage.mjs --check
npx.cmd expo-doctor
npx.cmd expo export --platform all --output-dir .expo/release-export
npm.cmd audit
```

Triage audit findings under `apps/mobile/SECURITY.md`. Do not run forced audit
fixes that replace Expo or React Native with an incompatible version.

## 3. Verify public prerequisites

After the website release containing the policy pages deploys, confirm:

- `https://promptspend.com/privacy/` returns the current policy.
- `https://promptspend.com/support/` returns contact and troubleshooting help.
- both pages render in light and dark appearance, have valid CSP and canonical
  metadata, appear in the sitemap, and link to each other.
- `info@promptspend.com` and `security@promptspend.com` receive mail.

Do not enter reserved but non-live URLs into a store submission.

### 3a. Publish association files for shared Estimate links

The native app is limited to verified links under
`https://promptspend.com/estimate`. The URL contains model IDs, derived token
counts, scale, and visible pricing assumptions only; it never contains pasted
prompt or response text.

Obtain the exact Apple Team ID from the Apple Developer membership record and
the final SHA-256 certificate fingerprint from **Play App Signing** in Play
Console. Do not substitute a local debug, EAS preview, upload, or internal APK
certificate for the Play App Signing fingerprint.

Generate the two website files locally from the mobile workspace:

```powershell
Set-Location apps/mobile
$env:PROMPTSPEND_APPLE_TEAM_ID = "<APPLE_TEAM_ID>"
$env:PROMPTSPEND_ANDROID_SHA256 = "<PLAY_APP_SIGNING_SHA256_FINGERPRINT>"
npm.cmd run prepare:links
Remove-Item Env:PROMPTSPEND_APPLE_TEAM_ID
Remove-Item Env:PROMPTSPEND_ANDROID_SHA256
```

Review `public/.well-known/apple-app-site-association` and
`public/.well-known/assetlinks.json` before staging. Generation does not deploy
them. Deployment remains a separate owner-approved action.

After an approved website deployment, verify both files return HTTP 200 over
HTTPS, without redirects, with JSON content types, and with the exact production
app identifiers. Then test the shared link on installed and uninstalled iPhone,
iPad, and Galaxy devices; test cold and warm app states, Cancel and Open estimate,
malformed values, unrelated query parameters, and browser fallback. Do not claim
Universal Link or App Link support from configuration alone.

## 4. Build candidates

iOS production:

```powershell
npx.cmd eas-cli@latest build --platform ios --profile production
```

Android internal QA APK:

```powershell
npx.cmd eas-cli@latest build --platform android --profile preview
```

Android Play candidate AAB:

```powershell
npx.cmd eas-cli@latest build --platform android --profile production
```

Record EAS build ID, version, build number/versionCode, commit SHA, artifact URL,
credentials used, start/finish time, and checksum where available. A successful
cloud build is not QA approval.

## 5. Beta distribution

This section requires separate explicit owner approval for the exact Apple or
Google action. Creating an EAS binary does not authorize uploading it to
TestFlight, changing store records, distributing through Play, or starting review.

iOS:

```powershell
npx.cmd eas-cli@latest submit --platform ios --profile production --id <EAS_BUILD_ID>
```

Wait for the single submission to finish, then confirm the same build appears
in App Store Connect and TestFlight. Install from TestFlight, not the `.ipa`
URL, and execute `MOBILE_BETA_QA.md`.

Android: upload the candidate AAB to Play Console's internal track first. Play
Console confirmed the publisher as an Organization account on September 9, 2026. The account follows the production path Play Console exposes for that
organization; this does not waive PromptSpend's own physical-device, policy,
accessibility, pre-launch-report, or release-quality gates.

## 6. Store configuration

Copy metadata from `apps/mobile/store/metadata.en-US.json`. Complete:

- privacy policy and support URLs;
- App Privacy/Data Safety after final binary inspection;
- Apple age rating and Google IARC questionnaire;
- categories, availability, price, copyright, content rights, export
  compliance, contact details, and reviewer notes;
- phone and tablet screenshots from `STORE_SCREENSHOTS.md`;
- Google feature graphic and Play icon;
- Play app access, target audience, ads, news, government, financial, health,
  and other applicable App content declarations.

Accessibility store claims remain blank until their evidence rows pass.

## 7. Go/no-go

Go only when:

- the exact candidate passes the full physical matrix and privacy sentinel;
- no P0/P1 defect is open;
- website policy/support URLs are live and verified;
- screenshots match the binary;
- copy, privacy, rating, permissions, and account declarations agree with the
  final manifests and network trace;
- Google account type and required testing path are confirmed in Play Console;
- the owner confirms copyright holder, territories, pricing, and release mode.

Recommended first release mode: manual release on Apple after approval and a
staged/controlled production rollout on Google after Play approval. Do not use
automatic release until the owner has reviewed the final product pages.

## 8. Submission and monitoring

Submit one platform at a time. For this release, the owner selected Android
first while Apple's organization migration completes.
Capture the submission ID and store status. Respond to reviewer questions with
facts from the release package; do not add a capability claim merely to answer
a reviewer.

After availability:

- install from the public store on clean physical devices;
- re-run Estimate, Compare, sharing, policy/support links, and catalog refresh;
- monitor store crashes, reviews, support inbox, pricing freshness, alert
  service health, and policy notices;
- compare the public version/build to the approved record;
- retain the tested artifact and evidence package.

If a correctness, privacy, security, or primary-journey defect appears, stop or
pause rollout where the store permits, document the exact affected build, and
prepare a new incremented build. Do not overwrite history or change credentials
without evidence that credentials are the cause.
