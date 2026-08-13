# iPhone and iPad physical QA — iOS build 12

Status: uploaded to App Store Connect for private internal TestFlight QA

## Candidate identity

- App: PromptSpend 0.1.0
- Platform: iOS and iPadOS
- EAS build: `a682ed35-1e2f-4448-a430-b088d27d61cd`
- Apple build number: `12`
- Git commit: `5fcdc0d28ff0f8d85ab355b6ddc3abca8d300625`
- Build profile/distribution: `production` / App Store signed
- IPA size: `15,854,711` bytes
- IPA SHA-256:
  `67130DFFBBDB9C5D4BFE73611C07002B7C3C020F74CDB87504114BED0E168C3B`
- EAS submission: `3e844c05-961b-492f-978c-bf99b748a4f5`
- App Store Connect app: `6800386428`
- Intended internal group: `Team (Expo)`

The binary was uploaded on 2026-08-13. This record authorizes private internal
TestFlight QA only. It does not authorize external testing, App Review, public
release, pricing changes, or customer distribution.

## Installation

1. On the iPhone or iPad, install or open Apple's TestFlight app.
2. Accept the PromptSpend invitation if TestFlight presents one.
3. Open PromptSpend and verify version 0.1.0, build 12 before testing.
4. If another PromptSpend build is installed, use TestFlight's Update action.
5. Record the installation date and time below.

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

## Smoke test

- [ ] App icon and launch screen render correctly
- [ ] Clean launch completes without a crash or blank screen
- [ ] Onboarding can be completed and skipped
- [ ] Current pricing loads over Wi-Fi
- [ ] Relaunch retains appropriate local state
- [ ] Portrait and landscape remain usable
- [ ] iPad layout uses the available width without clipping or four-across cards

## Core launch journeys

- [ ] Estimate with known token counts
- [ ] Estimate with private pasted system, user, and response text
- [ ] Compare one, two, and four models; reject a fifth without state loss
- [ ] Save, rename, duplicate, restore, delete, and undo a scenario
- [ ] Use Search, Guided Tour, and every appearance option
- [ ] Review Learn and use the private token lab
- [ ] Review Data & Alerts and cancel external handoffs safely
- [ ] Share estimate, comparison, scenario link, CSV, receipt text, and receipt image
- [ ] Confirm the privacy sentinel is absent from every saved and shared artifact

## iOS and iPadOS accessibility

- [ ] Complete the primary journey using VoiceOver
- [ ] Test the largest practical Dynamic Type size
- [ ] Confirm no clipped primary action or horizontal overflow
- [ ] Confirm focus returns to the opener after closing every sheet
- [ ] Confirm controls and values have meaningful spoken labels
- [ ] Enable Reduce Motion and confirm automatic ticker changes stop
- [ ] Confirm status and selection never rely on color alone
- [ ] If available, complete iPad navigation with a hardware keyboard

## Sharing and resilience

- [ ] Verify Messages output is readable
- [ ] Verify Mail output has useful line breaks and hierarchy
- [ ] Verify one third-party share target
- [ ] Save CSV and receipt image to Files
- [ ] Cancel a share sheet without losing state
- [ ] Relaunch in airplane mode after a successful online refresh
- [ ] Restore Wi-Fi and recover without a blank screen
- [ ] Background and foreground during a pricing refresh

## Evidence and defects

Use the defect template in `docs/MOBILE_BETA_QA.md`. Remove prompt text,
account information, email addresses, device identifiers, and other private
data from screenshots, recordings, and logs.

- Overall result: Not run
- Open P0 defects: Not assessed
- Open P1 defects: Not assessed
- Tester notes:
