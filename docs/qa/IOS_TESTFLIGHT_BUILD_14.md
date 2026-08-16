# iPhone and iPad physical QA — iOS build 14

Status: uploaded; awaiting Apple TestFlight processing

## Candidate identity

- App: PromptSpend 0.1.0
- Platform: iOS and iPadOS
- EAS build: `e75b93f4-6d23-4dd0-ac78-930cdaf2ad48`
- Apple build number: `14`
- Git commit: `f4318b4ade8f5937727e0741c337103c64a189b7`
- Build profile/distribution: `production` / App Store signed
- IPA size: `16,127,792` bytes
- IPA SHA-256:
  `5CD6C6B07111D2E0BA3A00AC7D93862A92BA394D108E829BF4FDE0E891A662FF`
- Archive validation: app bundle, `Info.plist`, embedded provisioning profile,
  and code-signature resources present
- EAS submission: `5cf00ebb-8624-4ff9-a8a7-bc7c84e6e031`
- App Store Connect app: `6800386428`
- Intended channel: private internal TestFlight QA

The binary was uploaded on 2026-08-16. This record authorizes private internal
TestFlight QA only. It does not authorize external testing, App Review, public
release, pricing changes, or customer distribution.

## Installation

1. Wait until TestFlight displays PromptSpend build 14.
2. On the iPhone or iPad, open Apple's TestFlight app.
3. Open PromptSpend and tap **Update**.
4. Verify TestFlight shows version 0.1.0, build 14 before testing.
5. Record the installation date, device, and OS version below.

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

## Result

- Overall result: Not run
- Open P0 defects: Not assessed
- Open P1 defects: Not assessed
- Tester notes:
