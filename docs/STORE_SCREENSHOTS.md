# PromptSpend Store Screenshot Storyboard

Status: creative direction approved by the launch specification; final captures
remain blocked on release-candidate physical-device QA.

Last reviewed: 2026-08-12

## Visual direction

The store story should feel like a calm cost-intelligence instrument. Use real
app screens, real native typography, restrained cobalt/emerald emphasis, and
short outcome-led captions. Do not use fake UI, fake awards, invented reviews,
provider logos, novelty gradients, glass effects, or tiny spreadsheet-like
collages. The screenshot must remain understandable before the caption is read.

Capture two coherent sets:

- Light, cool-paper canvas with cobalt accent for the primary listing.
- Dark appearance for one later frame to prove—not merely claim—the theme.

The first three frames carry the product story. Later frames deepen trust.

## iPhone sequence

| Order | Caption                                        | App state to capture                                                      | Purpose                                    |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| 1     | Know your AI cost before you build             | Cost Brief with current estimate, freshness chip, and savings opportunity | Immediate promise and answer-first design  |
| 2     | Paste a conversation. Keep the text private.   | Estimate with Paste text selected and the on-device privacy note visible  | Removes the token-knowledge barrier        |
| 3     | Compare up to four models on the same workload | Ranked four-model result with lowest-cost and monthly deltas visible      | Core competitive differentiator            |
| 4     | See what changes the bill                      | Sensitivity lab or savings playbook with actionable levers                | Converts calculation into action           |
| 5     | Share the decision—not the prompt              | AI Cost Receipt preview and share controls                                | Viral, useful collaboration loop           |
| 6     | Every price shows its work                     | Data & Alerts pipeline health, source date, and evidence controls         | Trust and provenance                       |
| 7     | Learn the cost mechanics as you go             | Learn cards and private token lab                                         | Retention and education                    |
| 8     | Your workspace, your way                       | Dark mode plus appearance choices, Search, Guide, and paused ticker       | Polish, accessibility, and discoverability |

## iPad sequence

Use the same narrative, but select screens that benefit from the larger canvas:

1. Cost Brief and active scenario in portrait.
2. Four-model comparison in landscape or the app's natural two-column layout.
3. Estimate inputs plus receipt/detail without horizontal clipping.
4. Catalog or Data & Alerts with source evidence.
5. Learn and token lab.
6. Dark appearance with Search or Guided Tour.

Do not stretch an iPhone capture into the iPad well. Apple requires a 13-inch
iPad screenshot because the app declares tablet support.

## Capture sizes

Apple permits one to ten screenshots per device size with no alpha channel.
Use a supported highest-resolution size so App Store Connect can scale down:

- iPhone 6.9-inch portrait: `1320 x 2868` pixels.
- iPad 13-inch portrait: `2064 x 2752` pixels.
- iPad 13-inch landscape when used: `2752 x 2064` pixels.

Google Play:

- Phone: two to eight screenshots; use `1080 x 1920` portrait PNG or JPEG.
- 7-inch and 10-inch tablet: provide at least four true tablet screenshots per
  class for strong large-screen merchandising; use 9:16 portrait or 16:9
  landscape between 1080 and 7680 pixels.
- Feature graphic: `1024 x 500`, JPEG or 24-bit PNG with no alpha.
- Play icon: `512 x 512`, 32-bit PNG, no badges or ranking/price claims.

## Google alt text

Keep each asset description under 140 characters. Drafts:

1. Cost Brief showing a monthly AI estimate, pricing freshness, and savings opportunity.
2. Private pasted-text estimate with on-device processing notice and derived token counts.
3. Four LLM models ranked by monthly cost with the lowest estimate and price differences.
4. Savings playbook showing practical ways to reduce the modeled AI bill.
5. AI Cost Receipt preview with readable costs, assumptions, source date, and share controls.
6. Data and Alerts view showing catalog health, source checks, and review flags.
7. Learn view with cost lessons and a private token-estimation lab.
8. Dark interface with accessible appearance choices, global Search, and Guided Tour.

## Feature graphic concept

Headline: **Know the tab before you build.**

Visual: one central cost-receipt/result surface, one compact four-model ranking,
and a restrained freshness/source cue. Keep all essential elements inside the
central safe area and use no exact promotional price, ranking, award, store
badge, or call to install. The icon must not be repeated at dominant scale.

## Final capture protocol

1. Use the exact release-candidate binary, clean installed from TestFlight or
   the Play test track—not Expo Go or a development build.
2. Seed a representative fictional scenario with no customer, credential,
   email, device, or private prompt data.
3. Confirm the catalog date and all displayed rates are internally consistent.
4. Capture on physical iPhone, iPad, and Android hardware after each screen's
   functional and accessibility check passes.
5. Remove accidental notifications, personal status-bar details, keyboard
   suggestions, and share recipients.
6. Preserve the native status bar unless a store template intentionally and
   consistently crops it. Never splice screens from different builds.
7. Verify captions describe only what the submitted binary actually does.
8. Export opaque sRGB files, validate dimensions, then inspect every upload in
   the store preview before saving.
