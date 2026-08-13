# PromptSpend Store Release Package

Status: pre-device-QA draft; copy and evidence are implementation-ready, but
store declarations remain unsubmitted until the release-candidate binary and
physical-device evidence are final.

Last reviewed: 2026-08-12

## Sources of truth

- Localized store copy: `apps/mobile/store/metadata.en-US.json`
- Application identifiers and artwork: `apps/mobile/app.json`
- Build and submission profiles: `apps/mobile/eas.json`
- Privacy policy: `src/content/information/privacy.md`
- Support page: `src/content/information/support.md`
- Accessibility claim evidence: `docs/MOBILE_ACCESSIBILITY.md`
- Website-to-app capability audit: `docs/MOBILE_PARITY.md`

`npm run check:release` in `apps/mobile` enforces the current Apple and Google
text limits, artwork dimensions and alpha expectations, identifiers, URLs, and
presence of every release document.

## Product identity

| Field                 | Value                                       | Status                                                  |
| --------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Name                  | PromptSpend                                 | Ready                                                   |
| Version               | 0.1.0                                       | Ready; build numbers remain remotely auto-incremented   |
| iOS bundle ID         | `com.promptspend.app`                       | Locked by uploaded builds                               |
| Android package       | `com.promptspend.app`                       | Locked before first Play release                        |
| App Store Connect app | `6800386428`                                | Active                                                  |
| Expo project          | `9671ef3e-be90-49ba-aebe-56b6982af806`      | Active                                                  |
| Apple account type    | Individual                                  | Confirmed by owner                                      |
| Google account type   | Personal, organization transition requested | Pending Play Console confirmation                       |
| Default language      | English (U.S.)                              | Proposed                                                |
| Price                 | Free, no in-app purchases                   | Proposed; confirm immediately before submission         |
| Apple categories      | Developer Tools; Business                   | Proposed                                                |
| Google category       | Tools                                       | Proposed                                                |
| Copyright owner       | Not yet entered here                        | **Owner decision required** before App Store submission |

The Google account is treated as personal until Play Console itself confirms
the organization conversion and displays the resulting production path. No
testing exemption is assumed from a support request or payment alone.

## Store copy

The exact App Store subtitle, promotional text, description, keywords, Google
short and full descriptions, URLs, support email, and first-release notes live
in `apps/mobile/store/metadata.en-US.json`. This avoids a release operator
copying an older paragraph from a planning document.

Copy principles:

- Lead with the problem solved: understanding the AI bill before production.
- State private on-device prompt handling precisely; never claim that ordinary
  public-catalog network requests do not occur.
- Describe up-to-four-model comparison, receipts, savings guidance, Learn,
  Data & Alerts, Search, Guided Tour, ticker, saved scenarios, and appearance.
- Never imply that price establishes equivalent model quality or that estimates
  equal provider invoices.
- Do not use rankings, awards, unverifiable superlatives, testimonials,
  competitor trademarks as keywords, or temporary price claims.

## App Review notes

Use this as the draft review note, updating the build number and any changed
behavior before submission:

> PromptSpend requires no login, account, subscription, or purchase. On first
> launch, complete or skip the three-step tour. Estimate accepts known token
> counts or representative pasted text; pasted text is processed in app memory
> and is never sent to PromptSpend or saved. Compare supports up to four models.
> The app downloads public pricing and sync-status JSON from promptspend.com and
> may use a validated device cache for less than 24 hours when offline. Test
> sharing from an estimate or comparison; the preview contains derived counts,
> assumptions, and costs but never pasted text. Data & Alerts opens selected
> public resources in a system browser. Native push notifications, accounts,
> ads, analytics, and in-app purchases are not present in this version.

No review credentials are required. Reviewer contact information belongs in
the private store portal and must not be committed to this public repository.

## Apple App Privacy draft

Provisional answer: **No, we do not collect data from this app.**

Evidence supporting that draft:

- No account, advertising, analytics, attribution, crash-reporting, or tracking
  SDK is declared in the mobile dependency graph.
- Pasted prompt, user-message, and response text remain in component state and
  never enter catalog requests, persistence, URLs, or share builders.
- Saved scenarios and appearance choices stay in app-local storage.
- Public catalog requests send no scenario or prompt payload.
- User-initiated sharing is handed to the operating-system share sheet.
- Predetermined external resources open in a system browser.

This answer is **not certified yet**. Before publishing it, inspect the final
iOS privacy manifest and network trace, confirm the hosting layer and every
shipped third-party library's behavior, and repeat the privacy sentinel tests
against the exact release candidate. Apple requires one app-level answer that
includes third-party partner behavior across supported platforms.

Privacy Policy URL: `https://promptspend.com/privacy/`

User Privacy Choices URL: leave blank; the app has no account or remote user
profile. Local deletion instructions are on the support page.

Tracking: No. ATT permission: not requested.

## Google Play Data Safety draft

Provisional answers:

- Does the app collect or share required user-data types? **No**.
- Is user data encrypted in transit? **Yes; public network requests use HTTPS**.
- Does the app provide account creation? **No**.
- Account-deletion URL required? **No account exists**.
- Privacy policy: `https://promptspend.com/privacy/`.

Google defines collection broadly as transmitting user data off-device,
including third-party SDK behavior. On-device processing is outside that
definition, while ephemeral off-device processing can still require an answer.
Therefore this draft must not be submitted until the final Android manifest,
SDK inventory, and network trace prove that only public catalog/resource
requests leave the app and carry no reportable user data.

The Data Safety form is required for closed, open, and production tracks even
when an app collects no data. An app exclusively on the internal track is
exempt, but the form and live privacy policy must be complete before expansion.

## Content-rating draft

Expected result: Apple's lowest general-audience rating and Google Play/IARC
Everyone, subject to the stores' calculated regional results.

Questionnaire basis:

- No violence, sexual content, profanity, drugs, gambling, contests, loot
  boxes, horror, medical treatment, or mature themes.
- No ads or user-generated public content.
- No chat, anonymous communication, or user-to-user messaging inside the app.
- No unrestricted browser; only predetermined resources open in a system
  browser. The operating-system share sheet is not an in-app social network.
- No in-app purchase or real-money transaction.
- Published model prices and cost forecasts are technical information, not
  banking, investing, lending, or financial-account functionality.

Answer the live questionnaire from the release-candidate feature set. If the
app later adds a free-form web browser, community content, native alerts with
user preferences, accounts, or media, retake both rating questionnaires.

## Other declarations

- Export compliance: `ITSAppUsesNonExemptEncryption` is false. PromptSpend uses
  operating-system HTTPS and does not implement non-exempt cryptography.
- Advertising identifier: not used.
- Government/medical/news/children categories: not applicable.
- Content rights: screenshots and brand artwork must be created from the app;
  provider names and pricing are factual references backed by source links.
- Accessibility claims: leave unchecked until every matching row in
  `MOBILE_ACCESSIBILITY.md` has physical evidence.
- Availability: start with countries where the owner is prepared to provide
  support and satisfy trader/tax requirements. Do not select China mainland
  without the required compliance review.

## Official requirements reviewed

- Apple App information and metadata limits:
  <https://developer.apple.com/help/app-store-connect/reference/app-information/app-information>
  and
  <https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information>
- Apple screenshots:
  <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications>
- Apple privacy responses:
  <https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/>
- Apple age rating:
  <https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/>
- Google Play listing assets:
  <https://support.google.com/googleplay/android-developer/answer/9866151>
- Google Data Safety:
  <https://support.google.com/googleplay/android-developer/answer/10787469>
- Google content rating:
  <https://support.google.com/googleplay/android-developer/answer/9859655>
