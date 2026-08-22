# Galaxy A15 physical QA — Android build 4

Status: ready for private-device installation

## Candidate identity

- App: PromptSpend 0.1.0
- Platform: Android
- Device target: Samsung Galaxy A15 5G
- EAS build: `c21e5975-fb91-4dac-b064-0b56f90a8a98`
- Android versionCode: `4`
- Git commit: `f944544f34ba14ff97f934cccc5afcd86a8fcf8e`
- Build profile/distribution: `preview` / internal APK
- APK size: `98,818,877` bytes
- APK SHA-256:
  `9D893EB7FE7C45741423698F781957BF7EC9F6332D7638A61A35201B3A22CCFC`
- Archive validation: `AndroidManifest.xml`, resources, four DEX files, and 88
  native libraries present
- Authenticated EAS build page:
  `https://expo.dev/accounts/crestwood-holdings/projects/promptspend-app/builds/c21e5975-fb91-4dac-b064-0b56f90a8a98`
- EAS artifact expiration: 2026-09-05

EAS produced this APK with the project's remote Android credentials. The
archive structure and checksum were independently verified after download.
This APK is for direct installation on the owned Galaxy test device. It has not
been uploaded to Google Play and this record does not authorize any Google Play
or Apple public action.

## Installation

1. On the Galaxy, open the private artifact URL supplied through the authorized
   QA handoff in **Chrome**. Direct APK URLs must not be committed to this public
   repository.
2. Download the APK. If Chrome warns that APK files can be harmful, verify the
   filename is the PromptSpend build from the URL above, then keep the file.
3. Tap the completed download.
4. If Android blocks installation, tap **Settings**, allow **Install unknown
   apps** for Chrome, return to the installer, and tap **Install**.
5. Install it as an update over the existing PromptSpend QA app. Do not
   uninstall first; preserving the prior install lets QA check upgrade behavior
   and retained local state.
6. If Android reports an incompatible signature or refuses the update, stop and
   record the exact message before uninstalling anything.
7. Open PromptSpend. After installation, turn **Install unknown apps** back off
   for Chrome if desired.
8. Record the installation date, exact Galaxy model, Android version, and One
   UI version below.

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
- [ ] TalkBack announces country names, counts, checked state, and result count
- [ ] Chips remain usable in portrait, landscape, dark mode, and large text

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

## Result

- Overall result: Not run
- Open P0 defects: Not assessed
- Open P1 defects: Not assessed
- Tester notes:
