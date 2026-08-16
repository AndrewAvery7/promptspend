# Mobile source hardening - 2026-08-13

Status: automated gates passed; physical-device evidence pending

> **Historical evidence.** This document records the August 13 source and the
> test totals that were true on that date. It predates the native Alert Center
> and the August 16 full-system audit. It must not be used as current
> release-candidate evidence; see `CLAUDE_AUDIT_DISPOSITION_2026-08-16.md`.

## Scope and release boundary

This record covers source changes on `mobile/android-device-qa` in draft PR
[#66](https://github.com/AndrewAvery7/promptspend/pull/66). It does not describe
the already-built Android versionCode 3 APK or iOS build 11. A new binary is
required before these changes can be tested on a physical device.

No EAS cloud build, App Store Connect action, TestFlight distribution, Play
Console upload, testing-track release, store review, or public publication was
performed. Every Apple or Google action remains behind a separate explicit
approval.

## Hardening delivered

- Added model-specific pasted-text conversion tests covering numeric mode,
  empty text, 200,000-character clamping, distinct tokenizer profiles,
  deterministic ordering, global deltas, and empty/zero-cost comparisons.
- Added privacy sentinel tests proving that injected prompt text cannot enter a
  shared scenario URL or CSV export.
- Neutralized spreadsheet-formula injection in CSV cells before files are
  opened in Excel, Google Sheets, or another spreadsheet application.
- Added component-level accessibility checks for input-method radio state,
  polite live token-count announcements, Dynamic Type, disabled autofill,
  private-text clamping, and the 44-point clear action.
- Expanded the release-policy gate to reject unexpected sensitive-permission
  packages, explicit Android runtime permissions, iOS permission descriptions,
  cleartext Android traffic, and missing EAS exclusions for local secrets,
  credentials, signing files, and private traffic exports.

## Automated evidence

All commands ran from the isolated QA worktree on 2026-08-13.

- `apps/mobile`: 53 of 53 Jest tests passed across 12 suites.
- `apps/mobile`: TypeScript, Expo lint, and `check:release` passed.
- Expo Doctor: 20 of 20 checks passed for Expo SDK 57.
- Local Expo export: Android, iOS, and web bundles completed; 67 files totaling
  9,732,062 bytes. This was a local bundle check, not an EAS or store build.
- Root `npm run verify`: passed end to end, including 402 tests with coverage,
  production builds, encoding, formatting, lint, 70-model catalog validation,
  bundle budgets, CSP, SEO, and 159 generated-page claims.
- API: 39 of 39 tests passed.
- MCP: 34 of 34 tests passed.
- VS Code extension: 136 of 136 tests passed.
- Worker: 84 of 84 tests passed.
- Playwright: 108 passed and 4 intentionally skipped across 320px phone,
  390px phone, 768px tablet, and 1280px desktop projects.
- Combined executed result: 856 passed and zero failed; four browser cases were
  skipped by their documented viewport conditions.

## Dependency advisory review

- Root, API, MCP, VS Code, and Worker production audits reported zero known
  vulnerabilities.
- The mobile production-tree audit reported 25 propagated findings (9 moderate,
  16 high, 0 critical) from two transitive toolchain advisories:
  `image-size` through Expo/Metro and `uuid` through Expo config/Xcode tooling.
- npm's suggested fixes would downgrade the exact Expo 57 / React Native 0.86
  stack to Expo 53 / React Native 0.72. That is a breaking and unsupported
  remediation for this app, so no forced downgrade or unverified override was
  applied. The locked SDK remains under upstream monitoring.

## Still required before release

- Review and merge the draft PR only after CI and code review remain green.
- Produce a new private QA binary only after explicit approval.
- Run the complete iPhone, iPad, and Galaxy device matrix against that exact
  binary, including VoiceOver/TalkBack, largest text, dark mode, orientation,
  offline recovery, share targets, and the privacy sentinel.
- Reconcile store privacy, Data Safety, accessibility, screenshots, and public
  claims to the exact approved binary.
- Keep all Apple and Google submissions paused until the account/D-U-N-S work
  is complete and a separate explicit approval is given.
