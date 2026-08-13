# Galaxy A15 physical QA — Android build 3

Status: ready for private-device execution

## Candidate identity

- App: PromptSpend 0.1.0
- Platform: Android
- Device target: Samsung Galaxy A15 5G
- EAS build: `9e49ea20-d18b-4bac-be85-f52fdebe20b7`
- Android versionCode: `3`
- Git commit: `5fcdc0d28ff0f8d85ab355b6ddc3abca8d300625`
- Build profile/distribution: `preview` / internal APK
- APK size: `96,781,643` bytes
- APK SHA-256:
  `DBE85568B5908B860D0171E768F6D5D6D4CD20CD294199CDBBF3A87226D960F4`
- Archive validation: ZIP/APK signature present, `AndroidManifest.xml` present,
  four DEX files, and native libraries present

This build is for direct installation on an owned test device. It has not been
uploaded to Google Play and this record does not authorize any Google Play or
Apple action.

Source hardening is recorded in `docs/qa/SOURCE_HARDENING_2026-08-13.md` and is
included in this replacement versionCode 3 private QA binary.

## Device facts to record before testing

- Exact Galaxy model number:
- Android version:
- One UI version:
- Security patch date:
- Free storage:
- Locale:
- Default font size/display zoom:
- Play Protect certification:
- Installation date and time:

## Installation smoke test

- [ ] Existing PromptSpend test build removed, if present
- [ ] APK installed from the exact EAS build above
- [ ] Android warning identifies PromptSpend as the app being installed
- [ ] App icon and launch screen render correctly
- [ ] First launch completes without crash or blank screen
- [ ] Current pricing loads over Wi-Fi
- [ ] Relaunch retains appropriate local state
- [ ] Portrait and landscape both remain usable

## P0 functional pass

- [ ] Complete onboarding and verify Skip
- [ ] Estimate with token counts
- [ ] Estimate with private pasted system, user, and response text
- [ ] Compare one, two, and four models; reject a fifth safely
- [ ] Save, rename, duplicate, restore, delete, and undo a scenario
- [ ] Use Search, Guided Tour, and every appearance option
- [ ] Review Learn and use the private token lab
- [ ] Review Data & Alerts and cancel external handoffs safely
- [ ] Share estimate, comparison, CSV, receipt text, and receipt image
- [ ] Confirm the pasted privacy sentinel is absent from every shared artifact

## Android presentation and accessibility

- [ ] Test portrait and landscape
- [ ] Test System, Light, and Dark appearances
- [ ] Test all accents and both canvas choices
- [ ] Increase Android font size and screen zoom to the largest practical values
- [ ] Confirm no clipped primary action or horizontal overflow
- [ ] Enable Remove animations and verify Market Pulse stops automatically
- [ ] Enable TalkBack and complete the primary journey
- [ ] Confirm selected, warning, freshness, and error states do not rely on color

## Resilience sample

- [ ] Launch online and refresh pricing
- [ ] Relaunch in airplane mode with a fresh cache
- [ ] Recover after Wi-Fi is restored
- [ ] Background and foreground during a pricing refresh
- [ ] Cancel a share sheet and external-browser handoff
- [ ] Confirm every failure state is readable and actionable

## Evidence and defects

For every defect, use the template in `docs/MOBILE_BETA_QA.md`. Remove prompt
text, account information, email addresses, device identifiers, and other
private data from screenshots, recordings, and logs.

- Overall result: Not run
- Open P0 defects: Not assessed
- Open P1 defects: Not assessed
- Tester notes:
