# Galaxy A15 physical QA — Android hardened build f4318b4

Status: ready for private-device installation

## Candidate identity

- App: PromptSpend 0.1.0
- Platform: Android
- Device target: Samsung Galaxy A15 5G
- EAS build: `391818eb-a439-4d8c-ad39-fb554fbb24e9`
- Android versionCode: `3`
- Git commit: `f4318b4ade8f5937727e0741c337103c64a189b7`
- Build profile/distribution: `preview` / internal APK
- APK size: `97,562,616` bytes
- APK SHA-256:
  `22430D45DC88F10A1ED18150D5A8E02DF7E7A635F23613A0BB99FEE33B9FDBDF`
- Archive validation: `AndroidManifest.xml`, resources, four DEX files, and 84
  native libraries present
- Private artifact URL:
  `https://expo.dev/artifacts/eas/xAu3zdF0H-QMYN4WvaPTOdG7dC3HGDU4AEUBk8XwLO4.apk`
- Artifact expiration: 2026-08-30

This APK is for direct installation on the owned Galaxy test device. It has not
been uploaded to Google Play and this record does not authorize any Google Play
or Apple public action.

## Installation

1. Remove the older PromptSpend test build from the Galaxy.
2. Open the private artifact URL above in Chrome on the Galaxy.
3. Download the APK and approve installation from Chrome only when Android asks.
4. Open PromptSpend and verify the launch completes without a crash or blank
   screen.
5. Record the installation date, exact Galaxy model, Android version, and One
   UI version below.

## Device facts

- Exact Galaxy model number:
- Android version:
- One UI version:
- Security patch date:
- Free storage:
- Locale:
- Default font size/display zoom:
- Play Protect certification:
- Installation date and time:

## Required smoke test

- [ ] App icon and launch screen render correctly
- [ ] Current pricing loads over Wi-Fi
- [ ] Home and Estimate are distinct and usable
- [ ] Data & Alerts appears as the fifth tab without truncation
- [ ] Guided Tour navigates and spotlights the surface being described
- [ ] Relaunch retains appropriate local state
- [ ] Portrait and landscape remain usable
- [ ] TalkBack can complete the primary journey

Complete every P0 journey, privacy-sentinel case, accessibility check, and
resilience case in `docs/MOBILE_BETA_QA.md`.

## Result

- Overall result: Not run
- Open P0 defects: Not assessed
- Open P1 defects: Not assessed
- Tester notes:
