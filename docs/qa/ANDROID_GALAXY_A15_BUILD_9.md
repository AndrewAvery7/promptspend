# Galaxy A15 QA — Android version code 9

Status: current private-QA candidate; physical-device sign-off is still
outstanding.

## Candidate and evidence

- App: PromptSpend 0.1.0; Android versionCode 9.
- EAS build: `f43fe4ee-3909-40fd-937d-0f83d5a3b966`.
- Source: `5b4dddc05c8a4fc5b7dd4e45aa4a7ab29115b29f` (`fix(mobile): reserve Android tab bar safe area`).
- Profile: preview / internal, direct-install APK, not a Play submission.
- [Authenticated EAS record](https://expo.dev/accounts/crestwood-holdings/projects/promptspend-app/builds/f43fe4ee-3909-40fd-937d-0f83d5a3b966).
- [Private APK artifact](https://expo.dev/artifacts/eas/GMXQIZfAaVY47snqQe2BI8AfIzq1nRQ9zVt47W9TSF0.apk).
- EAS fingerprint hash: `a0fea6193f0c1cfeb4419fcc185436d9482d03a1`.
- Locally downloaded artifact verification: 99,084,961 bytes; SHA-256
  `03cdfc8a8573b66d22e022ffe39753248b5d8cf9c88b4aa54b4d335ec094c46d`; ZIP/APK
  signature present; `AndroidManifest.xml`, four DEX files, and 88 native-library
  entries present.

## Defect addressed

The shared Expo Router tab bar now reads the Android safe-area inset, increases
its height, and adds bottom padding (with a 16dp fallback). This keeps the
wrapped `Data & Alerts` label above the Galaxy system navigation area on every
screen while leaving iOS and web sizing unchanged.

## Installation and next checks

Open the private APK artifact on the Galaxy A15, allow the browser/Files app to
install from that source if Android asks, and record the installed versionCode
before testing. Install as an update where possible so existing saved-state
behavior is exercised. If Android reports a signature mismatch, stop and record
it rather than uninstalling saved data.

- [ ] Exact versionCode 9 and installation date recorded.
- [ ] Galaxy model, Android/One UI version, free storage, locale, zoom/text size,
      orientation, and light/dark setting recorded.
- [ ] Cold start opens Home (not Estimate).
- [ ] Header Search, Guide, and Color controls remain bounded and tappable.
- [ ] Ticker, cards, buttons, and the full `Data & Alerts` tab label stay within
      safe horizontal and bottom bounds in portrait and landscape.
- [ ] Guide shows complete content on all six steps and navigates/spotlights the
      described surface.
- [ ] Estimate, Compare, country filters, FAQ search, contextual help, and
      offline Learn lessons work.
- [ ] Keyboard/action, durable-save, hydration, pricing-expiry, sharing/export,
      and privacy-sentinel checks pass.
- [ ] TalkBack and largest practical text/display-size checks pass.

Follow `docs/MOBILE_NATIVE_QA_SCOPE.md` and the full `docs/MOBILE_BETA_QA.md`
protocol. This document authorizes no Google Play upload or public release.
