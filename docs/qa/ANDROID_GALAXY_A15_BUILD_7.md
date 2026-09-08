# Galaxy A15 QA — Android version code 7

Status: current private-QA candidate; physical-device sign-off is still
outstanding.

## Candidate and evidence

- App: PromptSpend 0.1.0; Android versionCode 7.
- EAS build: `16721c06-a51b-4831-b6e4-0475121a1ae1`.
- Source: `a4a26e07b6368055a46dd2b36da8be1aee900447` (`origin/main`).
- Created: September 8, 2026 at 16:41 UTC; EAS FINISHED at 17:40 UTC.
- Profile: preview / internal, direct-install APK, not a Play submission.
- [Authenticated EAS record](https://expo.dev/accounts/crestwood-holdings/projects/promptspend-app/builds/16721c06-a51b-4831-b6e4-0475121a1ae1).
- [Private APK artifact](https://expo.dev/artifacts/eas/ou08Q7o822Mas4tBNgc41ESqesiPaQLixmIJwZlp9OY.apk).
- EAS fingerprint hash: `a0fea6193f0c1cfeb4419fcc185436d9482d03a1`.
- Locally downloaded artifact verification: 99,084,321 bytes; SHA-256
  `c2caf4f563fcae9a4b024e11070e53ff279f646c80ee4dcbbf8f11587165039`; ZIP/APK
  signature present; `AndroidManifest.xml`, four DEX files, and native-library
  entries present.

This build was produced from the exact merged `main` source used for the
September parity and QA release. A second Android versionCode 8 build
(`5d2e1869-98dc-4061-b718-866bd73b4463`) was submitted from the same commit and
remains queued; it is not the installable artifact until EAS reports FINISHED.

## Installation and next checks

Open the private APK artifact on the Galaxy A15, allow the browser/Files app to
install from that source if Android asks, and record the installed versionCode
before testing. Install as an update where possible so existing saved-state
behavior is exercised. If Android reports a signature mismatch, stop and record
it rather than uninstalling saved data.

- [ ] Exact versionCode 7 and installation date recorded.
- [ ] Galaxy model, Android/One UI version, free storage, locale, zoom/text size,
      orientation, and light/dark setting recorded.
- [ ] Cold start opens Home (not Estimate).
- [ ] Header Search, Guide, and Color controls remain bounded and tappable.
- [ ] Ticker, cards, buttons, and the full `Data & Alerts` tab label stay within
      the safe horizontal bounds in portrait and landscape.
- [ ] Guide shows complete content on all six steps and navigates/spotlights the
      described surface.
- [ ] Estimate, Compare, country filters, FAQ search, contextual help, and
      offline Learn lessons work.
- [ ] Keyboard/action, durable-save, hydration, pricing-expiry, sharing/export,
      and privacy-sentinel checks pass.
- [ ] TalkBack and largest practical text/display-size checks pass.

Follow `docs/MOBILE_NATIVE_QA_SCOPE.md` and the full `docs/MOBILE_BETA_QA.md`
protocol. This document authorizes no Google Play upload or public release.
