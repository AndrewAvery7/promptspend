# Galaxy A15 QA — Android version code 10

Status: current private-QA candidate; physical-device sign-off is still
outstanding.

## Candidate and evidence

- App: PromptSpend 0.1.0; Android versionCode 10.
- EAS build: `957ed01e-a4c0-4285-82ef-5863e3d2ad06`.
- Source: `c53e071e353c2be1c11f73640cc198ecd2254348` (`fix(mobile): complete Android QA polish`).
- Profile: preview / internal, direct-install APK, not a Play submission.
- [Authenticated EAS record](https://expo.dev/accounts/crestwood-holdings/projects/promptspend-app/builds/957ed01e-a4c0-4285-82ef-5863e3d2ad06).
- [Private APK artifact](https://expo.dev/artifacts/eas/d_mvPmPah_pXjo9_TsZQchEG3tvBGT7lCX7uOgu5mTA.apk).
- EAS fingerprint hash: `a0fea6193f0c1cfeb4419fcc185436d9482d03a1`.
- Locally downloaded artifact verification: 99,087,361 bytes; SHA-256
  `41536bf018c274b56826f4ff7c712ec7b7bed2b2a9e05aac93a0f179cd0d534d`; ZIP/APK
  signature present; `AndroidManifest.xml`, four DEX files, and 88 native-library
  entries present.

## Defects and enhancements addressed

- Freshness/status pills now stretch to the content width and center their
  status text, preventing the Android right-heavy appearance and preserving
  wrapping on narrow screens.
- Guided Tour targets use screen coordinates from native measurement and are
  remeasured through the ScrollView settling animation, keeping the blue
  spotlight aligned with the highlighted surface on Android.
- Country filters now show flags, accessible toggle hints, and the existing
  All/multi-country selection behavior remains intact.
- Estimate, Compare, and full-catalog model cards show a lower-right provider
  country badge for quick geographic context.
- The prior Android tab-bar safe-area fix remains included, keeping the wrapped
  `Data & Alerts` label above the Galaxy system navigation area.

## Installation and next checks

Open the private APK artifact on the Galaxy A15, allow the browser/Files app to
install from that source if Android asks, and record the installed versionCode
before testing. Install as an update where possible so existing saved-state
behavior is exercised. If Android reports a signature mismatch, stop and record
it rather than uninstalling saved data.

- [ ] Exact versionCode 10 and installation date recorded.
- [ ] Galaxy model, Android/One UI version, free storage, locale, zoom/text size,
      orientation, and light/dark setting recorded.
- [ ] Cold start opens Home (not Estimate).
- [ ] Header Search, Guide, and Color controls remain bounded and tappable.
- [ ] Ticker, cards, buttons, country badges, and the full `Data & Alerts` tab
      label stay within safe horizontal and bottom bounds in portrait and landscape.
- [ ] Guide shows complete content on all seven steps and navigates, scrolls,
      spotlights, and announces the described surface.
- [ ] Estimate, Compare, country toggles/filters, FAQ search, contextual help,
      and offline Learn lessons work.
- [ ] Keyboard/action, durable-save, hydration, pricing-expiry, sharing/export,
      and privacy-sentinel checks pass.
- [ ] TalkBack and largest practical text/display-size checks pass.

Follow `docs/MOBILE_NATIVE_QA_SCOPE.md` and the full `docs/MOBILE_BETA_QA.md`
protocol. This document authorizes no Google Play upload or public release.
