# PromptSpend Mobile Beta and QA

Status: active test protocol

Last reviewed: 2026-08-31

> **Current private-QA binaries.** iOS build 17 and Android versionCode 6 contain
> the August 26 QA fixes and Help Center. They do not contain the later header
> correction or August 31 review fixes. They are not approved public-release
> candidates; source validation cannot substitute for testing replacement binaries.

## Current installable baseline

- iOS: version 0.1.0, build 17, EAS build
  `2ce3cb87-aa5f-4fde-b58b-ed47348cefbe`.
- Android internal APK: version 0.1.0, versionCode 6, EAS build
  `d48de221-6a86-4f4c-9315-43cb6b803284`.
- Both use commit `5a935049e4843b9907eaba9ff4a721fe4398107a` and were built
  August 26. A read-only EAS query on August 31 confirmed both as FINISHED.
- iOS TestFlight VALID / IN_BETA_TESTING was recorded August 26. Apple-side
  processing was not rechecked August 31. EAS completion does not prove a
  successful installation or device sign-off.
- Android 6's EAS artifact expires September 9 at 21:16 UTC. September 5 belongs
  to superseded Android 4. No replacement artifact is created by this record.

These identify the last known baseline, not the eventual release candidate.
Every test record must name the exact installed build.

Per-build execution records:

- `docs/qa/IOS_TESTFLIGHT_BUILD_17.md`
- `docs/qa/ANDROID_GALAXY_A15_BUILD_6.md`
- `docs/MOBILE_NATIVE_QA_SCOPE.md` defines the bounded next-candidate smoke test.

Apple public-release and Google developer-platform work remain gated by the
account-verification process and separate explicit approvals. Build 17 was uploaded
to App Store Connect for private internal TestFlight QA only. The Android
baseline may be installed directly for private physical-device QA. Neither
action authorizes a Play Console upload, store review, or public distribution.

## Device matrix

Required before public submission:

- Current supported iPhone: portrait and landscape.
- Smaller/older supported iPhone if available: portrait and largest text.
- iPad: portrait and landscape, hardware keyboard where available.
- Purchased Samsung Galaxy A15 5G: portrait and landscape.
- At least one additional Android size/API through Play pre-launch testing or a
  reputable remote-device service; this supplements but does not replace the
  physical Android phone.

For every device record model, OS version, free storage, locale, text/display
size, light/dark setting, and assistive technology.

## P0 journeys

1. Clean install, launch, complete and skip onboarding, relaunch.
2. Load current pricing; verify freshness, source date, and degraded messaging.
3. Estimate with known token counts.
4. Estimate by pasting system, user, and response text separately; confirm each
   private-text notice and derived count.
5. Compare one, two, and four models; reject a fifth without losing state.
6. Filter the Estimate picker, Compare picker, Compare catalog/Value Map, and
   Data & Alerts model picker by one and multiple countries. Combine country
   filters with search, restore All, and confirm hidden selections remain saved.
7. Exercise caching, reasoning, batch, scale, turns, conversation growth, and
   long-context warnings against known engine fixtures.
8. Save, rename, duplicate, restore, delete, and undo a scenario.
9. Share estimate, comparison, scenario link, CSV, receipt image, and receipt
   text to at least Messages, Mail/Gmail, Files/Drive, and one third-party target.
10. Search for a model and command; complete Guided Tour and confirm every step
    navigates, scrolls, spotlights, and announces the surface it describes; test
    Back, Exit, Finish, Reduce Motion, and replay; change appearance.
11. Read every Learn lesson and use the private token lab.
12. In Data & Alerts, complete email subscribe and double opt-in; request and
    verify a management code; update cadence/scope/models; exercise an invalid
    and expired code; unsubscribe and confirm deletion. Then open every source,
    support, privacy, API, MCP, VS Code, and Open VSX link and cancel each
    browser/share handoff safely.

## Resilience cases

- First launch with working network.
- Network lost after a successful refresh with cache age under 24 hours.
- Cache exactly 24 hours old and older than 24 hours.
- Leave the app foregrounded across expiry; calculations and price sharing
  must stop at the deadline without requiring navigation or a manual refresh.
- Type a numeric change and tap Apply, Save, Share, CSV, or Receipt without
  first dismissing the keyboard; the action must use the visible accepted input
  or explain why the draft cannot be used.
- Simulate full/read-only storage and corrupt saved state; no action may report
  a durable save, rename, or deletion that the device did not acknowledge.
- Device clock behind the cache timestamp.
- Corrupt or partially written cache file.
- Pricing returns HTTP error, timeout, malformed JSON, invalid schema, and a
  valid catalog with missing health evidence.
- Slow network, background/foreground during fetch, interrupted share, denied
  browser handoff, full/read-only storage, low-memory relaunch, and airplane
  mode recovery.

Automated catalog tests cover the decision rules. Physical QA must confirm the
user sees a stable, actionable error rather than a blank or stale estimate.

## Privacy sentinel

Use a unique, harmless sentinel phrase in every pasted field. After the full
journey, verify it is absent from:

- saved scenario storage and catalog cache;
- shared text, scenario URL, CSV, receipt image metadata, and temporary filename;
- console output, native logs, alerts, error messages, crash metadata, and
  network request URL/body/header capture;
- app relaunch, Search, recent items, keyboard-visible UI, and OS backups where
  inspectable.

A single sentinel leak is a release blocker.

## Accessibility and presentation

Run the complete `MOBILE_ACCESSIBILITY.md` script. In addition:

- no primary control below 44 points on iOS or 48 dp on Android;
- no horizontal clipping at largest practical text/display size;
- the complete Data & Alerts tab label remains readable without truncation;
- keyboard focus remains visible and modal focus returns to its opener;
- values are spoken with labels and not as unexplained punctuation;
- selected, warning, savings, freshness, and error states remain clear in
  grayscale and without relying on accent color;
- ticker pauses, touch navigation remains available, and Reduce Motion stops
  automatic changes;
- screenshots and share previews remain readable in light and dark modes.

## Defect template

**Title:** `[Platform][Build][Severity] concise failed outcome`

- Build/version:
- Device and OS:
- Orientation, appearance, accent/canvas, text/display size:
- Assistive technology:
- Network state:
- Preconditions:
- Steps:
- Expected:
- Actual:
- Reproduction rate:
- Screenshot/video/log with private data removed:
- Privacy or cost-correctness impact:
- Workaround:

Severity:

- P0: privacy leak, wrong cost without warning, data loss, security issue, or
  primary journey impossible. Release blocked.
- P1: repeatable major failure with no reasonable workaround. Release blocked.
- P2: material defect with a safe workaround. Owner decides after documented
  risk review.
- P3: cosmetic or low-impact improvement. May be scheduled after launch.

## Exit criteria

- All P0 journeys pass on every required physical device.
- Zero open P0 or P1 defects; every accepted P2 has explicit owner approval.
- Cost parity and privacy sentinel suites pass 100%.
- No crash, hang, clipped primary action, or inaccessible modal in the matrix.
- Store screenshots are captured from the approved release candidate.
- App Privacy, Data Safety, content ratings, and accessibility claims are
  reconciled to the exact binary and evidence.
