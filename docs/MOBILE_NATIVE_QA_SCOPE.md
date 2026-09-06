# Native QA and launch-scope decisions

Recorded: August 31, 2026. Scope: next corrective private-QA release.

## What is and is not automated

The existing native CI job runs Jest/React Native Testing Library, TypeScript,
lint, release-policy checks, Expo Doctor, and platform exports. These do not
execute the installed native app. The repository's Playwright job exercises
the website in Chromium, including touch emulation; it is not an iOS/Android
native test run.

The original plan proposed Maestro plus EAS simulator/emulator execution on
every PR. That full workflow has not been implemented or demonstrated. The
corrective release uses the bounded candidate protocol below plus focused
automated regression tests. Add executable native smoke flows incrementally
where the environment supports them; record the actual engine/device/build and
results rather than marking native E2E complete from a source-only test.

**Cloud native builds on every PR are deferred.** They would consume the free
build budget without replacing physical QA. Batch approved fixes, complete
local/test checks first, and run approved candidate builds. Never enable paid
usage, upgrade the Expo plan, auto-submit to a store, or create a new build as
part of a routine test command. Check the actual remaining quota before any
new build. Build numbers and monthly counted builds are different quantities.

## Bounded native candidate protocol

Execute on iPhone, iPad, and Galaxy A15 using the exact replacement binaries.
All rows start **Not run**. Record device/OS, build, source SHA, conditions,
actual result, and a redacted screenshot or trace for failures.

| Journey                      | Required observation                                                                                                                               | Initial status |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Cold start and upgrade       | Clean launch opens Home; upgrade preserves saved scenarios and watched models                                                                      | Not run        |
| Navigation and shared header | All five tabs in order; full labels; Search, Guide, and Color neither overlap nor clip                                                             | Not run        |
| Keyboard-to-action           | Type decimals/incomplete drafts and immediately Apply/Save/Share/CSV/Receipt; latest accepted input is used or clear validation blocks the action  | Not run        |
| Save acknowledgement         | Success only after device storage accepts; rapid double-tap does not duplicate; failed/full storage gives actionable feedback                      | Not run        |
| Corrupt storage recovery     | Notice appears; original corrupt data is not overwritten silently; recovery/retry is deliberate; malformed dates do not crash                      | Not run        |
| Launch hydration/watchlist   | No false empty state while local data loads; unavailable pricing does not hide the fact watched models exist; View all reaches them                | Not run        |
| Catalog network deadline     | Header success followed by a hung body times out; health failure does not block valid pricing indefinitely; malformed/alias-only data fails closed | Not run        |
| Catalog expiry               | Foreground and background/return across the 24-hour ceiling immediately withhold expired calculations and exports; valid refresh recovers          | Not run        |
| Pricing parity               | Estimate/Compare use the same accepted workload, model-specific pasted-text estimates, and current-date promotional rules                          | Not run        |
| Active draft recovery        | Cold restart restores model choices, derived counts, scale, and assumptions; raw pasted text never returns or appears in device storage            | Not run        |
| Shared estimate links        | Valid `/estimate` links ask before replacing the draft and restore safe assumptions; cancelled, malformed, and unrelated links make no change      | Not run        |
| Guided Tour and Help         | Every step navigates to visible complete content; FAQ search/contextual links and Learn remain usable offline                                      | Not run        |
| Sheets and alerts            | Rename, detail, and verification sheets stay scrollable above the keyboard; loading is visible; email errors are adjacent and actionable           | Not run        |
| Accessibility and sharing    | Largest text, VoiceOver/TalkBack, Reduce Motion, landscape, Mail/Messages/Files targets, cancel/failure, and privacy sentinel checks pass          | Not run        |
| Estimate disclosure          | Compact result remains legible while scrolling; Advanced assumptions opens/closes without hiding current values or trapping focus                  | Not run        |
| Android predictive back      | Back preview/gesture dismisses sheets and nested routes before leaving the app; tab state and numeric drafts remain intact                         | Not run        |

For simulated clock/storage/network failures, use a controlled test harness or
debug fixture; do not change the user's real saved data or mislabel a debug
test as execution of the release binary. The complete public-release matrix
in `MOBILE_BETA_QA.md` remains required after this focused pass.

## Other deliberate launch boundaries

- **OTA code delivery deferred.** No `expo-updates` channel is added in this fix.
  Remote catalog downloads update pricing data, not app code. Code changes
  continue through explicitly approved, identifiable binaries. A future OTA
  proposal must define signing/trust, runtime compatibility, rollout/rollback,
  privacy disclosures, and separate deployment authority.
- **Play submission automation deferred to account/release preparation.**
  Android private APK QA does not require a Play service account. Once business
  ownership and permissions are confirmed, choose a deliberate manual first
  upload or EAS Submit track. Keep credentials outside source control.
- **Associated-domain publication remains approval-gated.** The app and website
  fallback route support `/estimate` links, but the generated Apple and Android
  association files require the exact Apple Team ID and Play App Signing SHA-256
  fingerprint. They must be reviewed and deployed separately before links can be
  claimed as verified Universal Links or App Links.
- **Predictive back and the bounded Estimate redesign are included in source.**
  Their rows above remain Not run until the exact replacement binaries pass on
  the physical devices; source checks alone do not convert them to passes.

No unchecked device rows become passes because a commit or cloud build is
green. Any cost-correctness, privacy, data-loss, or primary-journey failure
continues to block release. This record does not modify `docs/DEFERRED.md`.
