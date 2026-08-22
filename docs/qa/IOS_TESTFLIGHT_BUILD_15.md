# iPhone and iPad physical QA — iOS build 15

Status: uploaded successfully; awaiting confirmation that Apple has exposed the
build in TestFlight

## Candidate identity

- App: PromptSpend 0.1.0
- Platform: iOS and iPadOS
- EAS build: `7416e483-86aa-49fd-a343-5eaed1e2d25e`
- Apple build number: `15`
- Git commit: `f944544f34ba14ff97f934cccc5afcd86a8fcf8e`
- Build profile/distribution: `production` / App Store signed
- IPA size: `16,317,036` bytes
- IPA SHA-256:
  `A4363B711FDB4C89CAD3BD6DD6843BDDCA6EE9EA80C43918ED5E627E980752AE`
- Archive validation: app bundle, `Info.plist`, embedded provisioning profile,
  and code-signature resources present
- EAS submission: `b2a12bc1-c792-4931-85a0-237992505a04`
- App Store Connect app: `6800386428`
- Intended channel: private internal TestFlight QA

Expo reported the submission as **Success** on 2026-08-22 and identified the
submitted binary as PromptSpend 0.1.0 (15) from commit `f944544`. Apple must
finish its own TestFlight processing before installation. This record authorizes
private internal TestFlight QA only. It does not authorize external testing,
App Review, public release, pricing changes, or customer distribution.

## Installation

1. On the iPhone or iPad, open Apple's **TestFlight** app.
2. Pull down to refresh the app list if PromptSpend still shows build 14.
3. Open PromptSpend and tap **Update**.
4. Open **Previous Builds** or the build details and verify version 0.1.0,
   build 15 before testing.
5. If build 15 is not visible yet, do not reinstall build 14; wait for Apple's
   processing and check again.
6. Record the installation date, device, and OS version below.

## Country-filter smoke test

- [ ] Estimate > Model shows country chips with live model counts
- [ ] Selecting CN shows only Chinese models; **All** restores the catalog
- [ ] Search and country selection combine and explain an empty result
- [ ] Compare > Change models supports multiple countries without losing hidden
      selected models or weakening the four-model limit
- [ ] Compare catalog applies the same country selection to the Value Map and
      model list; the repeated filter stays synchronized
- [ ] Data & Alerts > Alert Center filters selectable models without removing
      existing followed-model choices
- [ ] VoiceOver announces country names, counts, checked state, and result count
- [ ] Chips remain usable in portrait, landscape, dark mode, and large text

## Required smoke test

- [ ] Launch completes without a developer alert, crash, or blank screen
- [ ] App icon and launch screen render correctly
- [ ] Onboarding can be completed and skipped
- [ ] Current pricing loads over Wi-Fi
- [ ] Home and Estimate are distinct and usable
- [ ] Data & Alerts appears as the fifth tab without truncation
- [ ] Guided Tour navigates and spotlights the surface being described
- [ ] Relaunch retains appropriate local state
- [ ] Portrait and landscape remain usable
- [ ] iPad layout uses the available width without clipping

Complete every P0 journey, privacy-sentinel case, accessibility check, and
resilience case in `docs/MOBILE_BETA_QA.md`.

## Device facts

- Device model:
- iOS or iPadOS version:
- Free storage:
- Locale:
- Text size and Display Zoom:
- Appearance:
- VoiceOver status:
- Reduce Motion status:
- Installation date and time:

## Result

- Overall result: Not run
- Open P0 defects: Not assessed
- Open P1 defects: Not assessed
- Tester notes:
