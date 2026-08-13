# PromptSpend Mobile Beta and QA

Status: active test protocol

Last reviewed: 2026-08-13

## Current installable baseline

- iOS TestFlight baseline: version 0.1.0, build 11, EAS build
  `3cf0273e-33a3-4b62-8c6d-1ba49a48d3bc`.
- Android internal APK baseline: version 0.1.0, versionCode 3, EAS build
  `d63cdad4-73bf-45ac-b871-a286b0de415b`, built from merge commit
  `189030acaa7377f955af16123803bd457fccddc6`. Verified APK SHA-256:
  `0ADD371BBA3DDBA61DE13C7967CF2F2F9FA4D7BBF7144F8B3D8AE43B88290452`.

These identify the last known baseline, not the eventual release candidate.
Every test record must name the exact installed build.

Apple and Google developer-platform work is paused pending the account/D-U-N-S
process and a separate explicit approval. The Android baseline may be installed
directly for private physical-device QA; this does not authorize a Play Console
upload, testing-track release, store review, or public distribution.

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
6. Exercise caching, reasoning, batch, scale, turns, conversation growth, and
   long-context warnings against known engine fixtures.
7. Save, rename, duplicate, restore, delete, and undo a scenario.
8. Share estimate, comparison, scenario link, CSV, receipt image, and receipt
   text to at least Messages, Mail/Gmail, Files/Drive, and one third-party target.
9. Search for a model and command; complete Guided Tour; change appearance.
10. Read every Learn lesson and use the private token lab.
11. Open every Data & Alerts, source, support, privacy, API, MCP, VS Code, and
    Open VSX link; cancel each browser/share handoff safely.

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
