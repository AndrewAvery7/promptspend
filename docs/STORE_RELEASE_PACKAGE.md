# PromptSpend Store Release Package

Status: both apps are live in the stores. The sections below were written
before launch and are kept as the record of what was submitted: where they say
"provisional", "recommended" or "not certified yet", the apps have since
launched. Review every declaration against the privacy policy before any
resubmission.

Last reviewed: 2026-10-06

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

| Field                 | Value                                  | Status                                                |
| --------------------- | -------------------------------------- | ----------------------------------------------------- |
| Name                  | PromptSpend                            | Ready                                                 |
| Version               | 0.1.0                                  | Ready; build numbers remain remotely auto-incremented |
| iOS bundle ID         | `com.promptspend.app`                  | Locked by uploaded builds                             |
| Android package       | `com.promptspend.app`                  | Locked before first Play release                      |
| App Store Connect app | `6800386428`                           | Active                                                |
| Expo project          | `9671ef3e-be90-49ba-aebe-56b6982af806` | Active                                                |
| Apple account type    | Organization migration processing      | Pending Apple completion                              |
| Google account type   | Organization                           | Verified live in Play Console on 2026-09-09           |
| Default language      | English (U.S.)                         | Proposed                                              |
| Price                 | Free, no in-app purchases              | Owner-approved release default                        |
| Apple categories      | Developer Tools; Business              | Proposed                                              |
| Google category       | Tools                                  | Proposed                                              |
| Copyright owner       | Crestwood Holdings Management LLC      | Owner-approved release default                        |

Play Console now identifies publisher `4914249645624372750` as an Organization
account. PromptSpend still uses an internal-track install and physical QA before
production; organization status removes only the contingency that treated the
account as a newly created personal publisher.

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
> assumptions, and costs but never pasted text. In Data & Alerts, email alerts
> are optional: enter an address, complete the Cloudflare human-verification
> sheet, then confirm using the received email. Existing subscribers can request
> a six-digit code and manage cadence and followed models in the app. The code
> expires after 10 minutes and the management session after 30 minutes. No review
> account or credentials are required. The app sends usage statistics (screen
> names and a fixed list of actions, never typed or pasted text) to Google
> Analytics through Firebase; they can be switched off under Data & Alerts >
> Privacy & support > Share usage statistics. It collects no advertising
> identifier and does not track. Native push notifications, accounts, ads, and
> in-app purchases are not present in this version.

No review credentials are required. Reviewer contact information belongs in
the private store portal and must not be committed to this public repository.

## Apple App Privacy draft

Provisional answer: **Yes, Contact Info — Email Address is collected only when a user opts into email alerts.**

Recommended App Store Connect declaration (from the release that adds usage
statistics; see "App usage statistics" below):

- Data type: Contact Info → Email Address.
  - Purpose: App Functionality.
  - Linked to the user: Yes. The address identifies the alert subscription.
  - Used for tracking: No.
  - Collection is optional; estimates, comparisons, Learn, and local saved
    scenarios require no email address or account.
- Data type: Usage Data → Product Interaction.
  - Purpose: Analytics.
  - Linked to the user: **Yes while Google signals is on** in the Google
    Analytics property (see below); No if it is switched off.
  - Used for tracking: No.
- Data type: Identifiers → Device ID (Firebase's app-instance ID).
  - Purpose: Analytics.
  - Linked to the user: same answer as Product Interaction.
  - Used for tracking: No.
- Data type: Location → Coarse Location (Google derives it from the masked IP
  address).
  - Purpose: Analytics.
  - Linked to the user: same answer as Product Interaction.
  - Used for tracking: No.

### App usage statistics

From the release that adds the **Share usage statistics** switch, the app
reports to the PromptSpend Google Analytics property (p561559697) through
Firebase Analytics (`@react-native-firebase/analytics`, Firebase project
`promptspend`; streams "PromptSpend iOS" 16232777068 and "PromptSpend Android"
16232765586). `apps/mobile/src/lib/usageStats.ts` sends only screen names and
five fixed events, each value from a closed list: `share` (content and form),
`tutorial_complete`, `alert_signup_sent`, `link_open` (fixed link names), and
`opened_from_link`. Firebase adds its app-instance ID, device and OS details,
app version, language, and coarse location from the masked IP address.

What it does not do, and how that is enforced:

- No advertising identifier: `withoutAdIdSupport` on iOS (no IDFA, no
  AdSupport framework), the `AD_ID` permission removed from the Android
  manifest, and `google_analytics_adid_collection_enabled`,
  `google_analytics_ssaid_collection_enabled` and
  `analytics_idfv_collection_enabled` false in `apps/mobile/firebase.json`.
- Ad storage, ad user data, ad personalization and ad-network registration are
  off by default in `firebase.json`, so app data is not used for advertising,
  and no App Tracking Transparency prompt is needed.
- Collection is off at launch (`analytics_auto_collection_enabled: false`) and
  is switched on only after the saved choice is read, so a person who turned
  statistics off sends nothing, not even a first-open event. With it on,
  Firebase also sends its automatic events (first_open, session_start,
  user_engagement, app_update, os_update, and on Android app_clear_data and
  app_remove). Turning it off also clears Firebase's on-device analytics
  identifier and data.
- `scripts/lib/privacy-config.test.ts` fails if any other file loads Firebase
  Analytics, any other analytics or advertising library is added, or any of
  those settings is loosened.

**Google signals.** It is on in the property (Andrew's "Option B",
2026-10-29), and since #342 the website uses it too. Google's guidance says Firebase
Analytics "conditionally collects signed-in account information if Google
Signals is enabled", which is why the answers above say the data is linked to
the user while it stays on. Switching Google signals off in Admin > Data
collection would let every analytics answer become "Not linked to you" and
drop the Google Play "User IDs" line below, but it would also switch it off for
the website, which Option B chose to keep.

Evidence supporting that draft:

- No account, advertising, attribution, crash-reporting, or tracking SDK is
  declared in the mobile dependency graph. The one analytics SDK, Firebase
  Analytics, is limited as described under "App usage statistics".
- Pasted prompt, user-message, and response text remain in component state and
  never enter catalog requests, persistence, URLs, or share builders.
- Saved scenarios and appearance choices stay in app-local storage.
- Public catalog requests send no scenario or prompt payload.
- User-initiated sharing is handed to the operating-system share sheet.
- Predetermined external resources open in a system browser.
- An optional alert flow transmits the entered email address and preferences to
  PromptSpend's Cloudflare-hosted service. It does not transmit prompt text,
  saved scenarios, contacts, advertising identifiers, or precise location.

This answer is **not certified yet**. Before publishing it, inspect the final
iOS privacy manifest and network trace, confirm the hosting layer and every
shipped third-party library's behavior, and repeat the privacy sentinel tests
against the exact release candidate. Apple requires one app-level answer that
includes third-party partner behavior across supported platforms.

**Over-the-air update check (from the first release built with expo-updates).**
Each launch sends a request to `https://updates.promptspend.dev/manifest`,
PromptSpend's own Cloudflare Worker. It carries the platform, app/runtime
version and, added by expo-updates itself, a random per-install ID
(`EAS-Client-ID`) plus the message of any failed update launch. The Worker
never reads those headers and has logging and Logpush disabled, so nothing is
retained beyond serving the request. Apple defines "collect" as transmitting
data in a way that allows access _for longer than necessary to service the
request in real time_, so this draft adds **no** Apple data type for it. If the
Worker is ever changed to log requests, that stops being true: declare
Identifiers → Device ID (App Functionality, not linked, not tracking) first.

Privacy Policy URL: `https://promptspend.com/privacy/`

User Privacy Choices URL: `https://promptspend.com/support/`. The support and
privacy pages explain in-app management and deletion. This is not an account;
unsubscribing deletes the alert address and preferences.

Tracking: No. ATT permission: not requested. Firebase Analytics is built
without ad-ID support and with ad personalization off, so nothing it collects
meets Apple's definition of tracking.

## Google Play Data Safety draft

Provisional answers:

- Does the app collect or share required user-data types? **Yes: an optional
  email address for app functionality, and usage statistics for analytics.
  Collected, not sold or shared for advertising.** Firebase normally acts as
  PromptSpend's service provider, which Google's form does not count as
  sharing. **But** the account's "Google products & services" data-sharing
  option is on (controller-to-controller terms accepted 2026-10-29), so Google
  also receives app data as an independent controller. While that stays on,
  answer **shared: Yes** (with Google, for improving its products) for every
  analytics data type below; switch it off and every "shared" answer can be
  No.
- App activity → **App interactions**: collected, shared (see above), not
  processed ephemerally, optional (on by default; users can switch it off in
  the app; re-read Google's live help text on "optional" when filling it in),
  purpose Analytics.
- Location → **Approximate location** (derived by Google from the masked IP
  address): collected, shared (see above), not ephemeral, optional, purpose
  Analytics.
- Personal info → **User IDs**: declare **only while Google signals is on**
  (Google's own guidance: Firebase "conditionally collects signed-in account
  information if Google Signals is enabled"): collected, shared (see above),
  optional, purpose Analytics.
- Advertising ID: **No**, the app does not use it; the `AD_ID` permission is
  removed from the manifest.
- Is user data encrypted in transit? **Yes; public network requests use HTTPS**.
- Does the app provide account creation? **No**.
- Account-deletion URL required? **No native account is created.** The in-app
  unsubscribe action deletes the optional alert address and preferences, and
  the privacy/support URL documents that deletion path.
- Privacy policy: `https://promptspend.com/privacy/`.
- **Device or other IDs**: collected, shared with Google while the
  data-sharing option is on (see above), **not** processed
  ephemerally, required, purposes **App functionality** and **Analytics**.
  Two things send one: the over-the-air update check (expo-updates adds a
  random per-install ID that PromptSpend's server never keeps; on its own
  that would be "processed ephemerally", see `docs/MOBILE_OTA_UPDATES.md`) and
  Firebase Analytics' app-instance ID, which Google keeps. Because the form
  takes one answer per data type, the analytics use decides it: not
  ephemeral. "Required" because the update check cannot be switched off,
  although the analytics use can.

Google defines collection broadly as transmitting user data off-device,
including third-party SDK behavior. On-device prompt processing remains outside
that definition, while the optional email-alert flow is reportable. Declare the
email as optional, encrypted in transit, retained until unsubscribe, and used
only for app functionality. This draft must not be submitted until the final
Android manifest, SDK inventory, network trace, and exact release-candidate
alert flow confirm those statements.

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
- Advertising identifier: not used (IDFA support is not built in; Android's `AD_ID` permission is removed).
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
