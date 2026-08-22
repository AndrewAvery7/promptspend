# PromptSpend Mobile Beta and QA

Status: active test protocol

Last reviewed: 2026-08-22

> **Current private-QA binaries.** iOS build 15 and Android versionCode 4 contain
> the complete August 22 country-filter release from the same merged source
> revision. All earlier binaries are historical and must not be recorded as
> current QA evidence.

## Current installable baseline

- iOS TestFlight candidate: version 0.1.0, build 15, EAS build
  `7416e483-86aa-49fd-a343-5eaed1e2d25e`, built from commit
  `f944544f34ba14ff97f934cccc5afcd86a8fcf8e`. Verified IPA SHA-256:
  `A4363B711FDB4C89CAD3BD6DD6843BDDCA6EE9EA80C43918ED5E627E980752AE`.
  EAS submission `b2a12bc1-c792-4931-85a0-237992505a04` successfully uploaded
  the binary to App Store Connect; install only after TestFlight displays build 15.
- Android internal APK baseline: version 0.1.0, versionCode 4, EAS build
  `c21e5975-fb91-4dac-b064-0b56f90a8a98`, built from commit
  `f944544f34ba14ff97f934cccc5afcd86a8fcf8e`. Verified APK SHA-256:
  `9D893EB7FE7C45741423698F781957BF7EC9F6332D7638A61A35201B3A22CCFC`.

These identify the last known baseline, not the eventual release candidate.
Every test record must name the exact installed build.

Per-build execution records:

- `docs/qa/IOS_TESTFLIGHT_BUILD_15.md`
- `docs/qa/ANDROID_GALAXY_A15_BUILD_4.md`

Apple public-release and Google developer-platform work remain gated by the
account/D-U-N-S process and separate explicit approvals. Build 15 was uploaded
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
