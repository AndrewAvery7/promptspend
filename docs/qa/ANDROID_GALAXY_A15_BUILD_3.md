# Galaxy A15 physical QA — Android build 3

Status: ready for private-device execution

## Candidate identity

- App: PromptSpend 0.1.0
- Platform: Android
- Device target: Samsung Galaxy A15 5G
- EAS build: `d63cdad4-73bf-45ac-b871-a286b0de415b`
- Android versionCode: `3`
- Git commit: `189030acaa7377f955af16123803bd457fccddc6`
- Build profile/distribution: `preview` / internal APK
- APK size: `96,781,275` bytes
- APK SHA-256:
  `0ADD371BBA3DDBA61DE13C7967CF2F2F9FA4D7BBF7144F8B3D8AE43B88290452`
- Archive validation: ZIP/APK signature present, `AndroidManifest.xml` present,
  four DEX files, and native libraries present

This build is for direct installation on an owned test device. It has not been
uploaded to Google Play and this record does not authorize any Google Play or
Apple action.

Source hardening completed after this APK was built is recorded in
`docs/qa/SOURCE_HARDENING_2026-08-13.md`. Those changes are not present in
versionCode 3 and require a later explicitly approved private QA binary before
physical validation.

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
