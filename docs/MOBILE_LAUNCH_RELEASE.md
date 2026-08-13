# PromptSpend Mobile Launch Release

Status: approved for implementation

Approved: 2026-08-12

Platforms: iOS, iPadOS, and Android

Product owner: Andrew
Implementation branch: `mobile/phase-0-foundation`

This document is the authoritative product specification for the first public
PromptSpend native release. `MOBILE_PARITY.md` remains the detailed
website-to-mobile capability audit. The mobile design system remains the visual
and interaction source of truth.

## Product promise

PromptSpend helps builders understand, compare, explain, and reduce LLM API
cost before those costs become a production surprise. The native app must make
the first useful answer fast for a newcomer while preserving the pricing
evidence, workload detail, privacy, and analytical depth expected by an expert.

The launch experience should feel like a calm cost-intelligence instrument,
not a generic AI assistant, crypto dashboard, or spreadsheet transplanted onto
a phone.

## Problem statement

People evaluating an LLM often know the prompt or workload they intend to use
but do not know the token count, the true cost at scale, or how dramatically
the answer changes between models. Existing calculators commonly require token
knowledge, hide assumptions, become stale, or produce a number without showing
the user how to improve it.

PromptSpend must close that gap with private pasted-text estimation, validated
pricing, comparable scenarios, clear evidence, and actionable savings advice
in a polished native workflow.

## Launch goals

1. A first-time user can move from onboarding to a useful estimate in less
   than two minutes without needing to understand tokens first.
2. A user can compare as many as four models against the same workload and
   understand the price difference without leaving the app.
3. Every displayed cost is derived from the shared validated engine and carries
   freshness, assumptions, and provenance.
4. The app gives users a reason to return through saved scenarios, a local
   watchlist, the Cost Brief, Market Pulse, and relevant savings opportunities.
5. Every primary task is independently usable with VoiceOver and TalkBack,
   largest practical system text, dark mode, and reduced motion.
6. Pasted prompt text never leaves volatile screen state and never enters
   persistence, telemetry, URLs, shares, crash metadata, alerts, or logs.

## Launch boundaries

- Version 1 is free and contains no advertising, subscriptions, purchases,
  account creation, or behavioral tracking.
- Saved scenarios, recent items, favorites, and appearance choices are local
  to the device.
- Launch watchlists provide in-app intelligence. Native APNs/FCM push is a
  post-launch feature because the existing browser VAPID service cannot accept
  native notification tokens.
- Pasted-text token counts remain labelled approximate until exact tokenizer
  parity, memory, and performance pass on physical iOS and Android hardware.
- Long-term price-history charts, provider billing connections, actual-usage
  imports, routing simulation, teams, enterprise reporting, and benchmark-based
  Model Match are post-launch initiatives.
- New launch scope requires an explicit schedule adjustment after this
  specification is approved.

## Primary users

- **Builder:** an independent developer choosing a model before shipping.
- **Technical decision-maker:** a product, engineering, or AI leader comparing
  cost implications across models and usage assumptions.
- **Cost-conscious operator:** a FinOps or operations user looking for savings,
  provenance, and a shareable explanation.
- **Learner:** a person who has a real prompt but does not yet understand tokens,
  history growth, caching, batching, or reasoning costs.

## Information architecture

Phone navigation uses five labelled, icon-supported top-level destinations:

1. **Home** - Cost Brief, recent scenarios, watchlist, price pulse, and quick
   actions.
2. **Estimate** - one-model workload estimator with token or private paste mode.
3. **Compare** - up to four models, the full catalog, value map, and model
   details.
4. **Learn** - lessons, glossary, and private token lab.
5. **More** - Data & Alerts, appearance, privacy, integrations, settings,
   accessibility information, and support resources.

Global Search and the Guided Tour remain available from the app header. Tablets
may use an adaptive rail or sidebar at the same hierarchy; they must not expose
a competing navigation system.

## Required launch capabilities

### 1. Website parity foundation

- Preserve Estimate, Compare, catalog exploration, Learn, Data & Alerts,
  Search, Guided Tour, appearance controls, ticker, sharing, CSV export, live
  freshness gating, and private pasted-text estimation.
- Preserve scenario state when navigating among all destinations.
- Any web behavior not reproduced literally must deliver the same outcome with
  a documented native adaptation in `MOBILE_PARITY.md`.

### 2. Home Cost Brief

- Show the current validated price status and the difference between source
  verification time and the last actual price change.
- Surface the most relevant recent scenario, watched-model changes, one savings
  opportunity, and a short Market Pulse.
- Provide clear quick actions for a new estimate, four-model comparison, saved
  scenarios, and Learn.
- Personalization is local and deterministic. A first-time empty state uses a
  representative scenario rather than pretending to know the user.

### 3. Interactive onboarding

- Explain the product promise, private paste mode, comparison, freshness, and
  savings in a short, skippable sequence.
- Allow the user to begin with a preset or a blank estimate.
- Preserve progress if the app is interrupted and allow replay from More and
  Search.
- Never request notification, tracking, contact, or account permissions during
  onboarding.

### 4. Scenario presets

- Provide clearly explained starting points for common workloads, including a
  customer-support assistant, document analysis, coding assistant, content
  generation, and high-volume lightweight classification.
- Presets populate editable assumptions; they are not benchmarks or provider
  recommendations.
- Applying a preset must be reversible and must never overwrite a saved
  scenario without confirmation.

### 5. Saved scenarios and recent work

- Save, rename, duplicate, reopen, and delete scenarios on-device.
- Provide undo after deletion.
- Retain model choices, derived counts, workload, scale, and assumptions.
- Never retain pasted prompt or response text. A restored paste-mode scenario
  must state that only derived counts were saved.
- Version the persisted schema and fail safely if data cannot be migrated.

### 6. Favorites and watchlist

- Favorite models from Estimate, Compare, catalog detail, Search, or Home.
- Surface watched models and relevant verified changes in the Cost Brief.
- Store the selection locally and handle a model that becomes legacy, unlisted,
  or unavailable without silently deleting the user's choice.
- Do not promise native notifications in version 1.

### 7. Savings Playbook

- Produce deterministic, explainable recommendations from the active scenario.
- Consider lower-priced model alternatives, response length, history growth,
  caching, batch eligibility, traffic, and margin assumptions.
- Show estimated impact, the assumptions responsible for it, and a direct way
  to preview the proposed change without overwriting the current scenario.
- Never imply that the cheapest model is functionally equivalent.

### 8. Cost Sensitivity Lab

- Let users vary the most influential workload assumptions and see immediate
  monthly and annual cost effects.
- Use accessible controls, direct value labels, and a complete structured table
  alternative to any chart.
- Provide restore-to-scenario and apply-to-scenario actions.
- Keep calculations on the shared integer-safe cost engine.

### 9. AI Cost Receipt

- Generate a polished, locally rendered share artifact that communicates model,
  monthly cost, per-conversation cost, annual cost, major assumptions,
  freshness, and PromptSpend attribution.
- Offer image and readable text through the native share sheet where the
  platform permits.
- Exclude prompt text, private names, device identifiers, and hidden metadata.
- Produce a useful result in Messages, Mail, Gmail, Messenger, Notes, and file
  destinations without app-specific integrations.

### 10. Market Pulse ticker

- Use only validated catalog and sync evidence.
- Prioritize real changes, review flags, recent tracked models, coverage, and
  useful shortcuts rather than fabricated market commentary.
- Support pause, touch navigation, readable static mode, and Reduce Motion.
- Do not continuously animate when the operating system requests less motion.

### 11. Privacy Shield

- Show concise, contextual explanations at paste, save, share, alert, and data
  freshness boundaries.
- Provide a More destination that explains local storage, network requests,
  shared content, and what PromptSpend does not collect.
- Include automated sentinel tests proving that private prompt strings do not
  cross persistence or share boundaries.

### 12. Accessibility certification evidence

- Support VoiceOver, TalkBack, Voice Control where applicable, Dynamic Type,
  font scaling, reduced motion, increased contrast, dark interface, hardware
  keyboard navigation on tablets, and predictable focus.
- Meet 4.5:1 normal-text contrast and 3:1 large-text/meaningful-glyph contrast.
- Meet 44x44pt iOS and 48x48dp Android touch targets.
- Avoid color-only meaning and provide text summaries for every chart.
- Complete and retain a device/task evidence matrix before declaring store
  accessibility support.

### 13. Offline and degraded operation

- Attempt a validated live catalog refresh on cold start.
- Use the last validated cache only within the approved freshness window and
  show the cache time and degraded state persistently.
- Withhold calculations after the freshness ceiling rather than silently using
  stale pricing.
- Preserve local scenarios, learning content, privacy information, and useful
  recovery instructions when the network is unavailable.

### 14. App-store-grade presentation

- Replace all temporary icon, adaptive icon, splash, and favicon assets with
  approved PromptSpend artwork.
- Bundle approved fonts locally; never fetch interface fonts at runtime.
- Use a consistent vector icon family and restrained native haptics.
- Provide intentional layouts for small and large phones, iPhone, iPad, Android
  phones/tablets, portrait, and landscape.
- Design loading, empty, error, offline, disabled, success, and destructive
  states as first-class product states.

## Interaction and visual principles

- Calm precision before spectacle.
- One clear primary action per screen.
- Answer first; calculation detail follows through progressive disclosure.
- Information dense, never cramped.
- Motion communicates cause, focus, or hierarchy and normally lasts 150-300ms.
- No decorative continuous motion, glassmorphism, ambient blobs, novelty
  gradients, gamification, or emoji structural icons.
- Light and dark variants are designed and verified together.
- Numeric alignment uses tabular figures where platform support allows.

## Technical architecture requirements

- `packages/core` remains the platform-neutral source for catalog validation,
  freshness, token estimates, cost math, comparison, sharing, and content that
  must stay identical across surfaces.
- Expo Router owns typed navigation and deep-link boundaries.
- Mobile feature state is separated from view components and supports schema-
  versioned local persistence.
- Prompt text stays in volatile screen state and is excluded from persistence
  types by construction.
- Catalog, scenario, appearance, onboarding, favorite, and watchlist storage
  have separate versioned namespaces and bounded retention.
- Long model lists are virtualized and expensive computation is memoized or
  moved away from interaction-critical rendering.
- Release builds include no credentials, private account material, or
  environment secrets.

## Acceptance and release gates

The release is not ready for store submission until all of the following pass:

1. Website parity rows are Complete, Adapted, Web-only, or carry an approved
   current explanation.
2. Shared cost fixtures produce identical website and native results.
3. No open P0 or P1 defect remains; P2 defects have an explicit disposition.
4. Prompt sentinel strings are absent from persistence, URLs, shares, logs,
   crash metadata, alerts, and network inspection.
5. Every primary journey passes VoiceOver and TalkBack on physical hardware.
6. Largest practical text, reduced motion, light/dark modes, every appearance
   combination, portrait, and landscape pass the device matrix.
7. No horizontal clipping occurs at a 375pt phone width.
8. Tap feedback begins within 100ms under normal conditions, sustained motion
   remains smooth, and long catalog lists do not block input.
9. Offline, stale-cache, corrupt-cache, server-error, and slow-network cases
   provide a clear recovery path.
10. App Store and Google Play claims match the submitted binaries exactly.
11. Temporary artwork and placeholder release metadata are absent.
12. Root and mobile verification, Expo Doctor, production bundle generation,
    dependency audit triage, EAS builds, and store pre-launch checks pass.

## Success measures

These measures must not introduce behavioral tracking. Use structured beta
observation, voluntary feedback, aggregate store diagnostics, and store-console
metrics only.

### Before launch

- At least 90% of representative beta users complete onboarding to first
  estimate without assistance.
- Median first-estimate time is under two minutes.
- At least 90% complete a four-model comparison and share a result without
  assistance.
- Cost parity and privacy sentinel suites pass 100%.
- Crash-free beta sessions are at least 99.5%, with no reproducible blocker.
- Every accessibility task in the release matrix passes on both platforms.

### After launch hypotheses

- Maintain at least a 4.6 average store rating after the first 50 ratings.
- Achieve at least 25% 30-day returning use in aggregate store metrics.
- Keep crash-free sessions above 99.5%.
- Review voluntary feedback monthly and publish a transparent resolution plan
  for recurring accuracy, accessibility, and usability concerns.

## Delivery plan

| Phase                              | Dates         | Exit evidence                                                                         |
| ---------------------------------- | ------------- | ------------------------------------------------------------------------------------- |
| UX and specification lock          | Aug 12-15     | Approved information architecture, journeys, states, and acceptance criteria          |
| Platform and engagement foundation | Aug 16-28     | Home, onboarding, presets, persistence, favorites, and internal alpha                 |
| Decision-intelligence features     | Aug 29-Sep 12 | Savings Playbook, Sensitivity Lab, Cost Receipt, watchlist, and Market Pulse          |
| Visual and interaction refinement  | Sep 13-26     | Phone/tablet design release candidate in light/dark and both orientations             |
| Hardening                          | Sep 27-Oct 9  | Automated, privacy, performance, accessibility, offline, and physical-device evidence |
| Beta and store package             | Oct 10-23     | Feedback resolved, final artwork/listings complete, release candidate approved        |
| Store review and release           | Oct 19-30     | Apple and Google approval, coordinated public release                                 |

The public target remains the week of October 26-November 2, 2026. Store review,
account verification, or a release-blocking defect may move public availability;
quality or privacy gates will not be waived to preserve a date.

## Google Play organization transition

The current Play developer account began as a personal account. The owner is
working with Google to transition it to an organization account for Crestwood
Holdings.

Until Play Console shows the account type as organization and confirms the
available production path, the personal-account 12-tester/14-continuous-day
rule remains a contingency. It is not considered removed based only on a
support request.

If the transition completes, the mandatory personal-account test is replaced
in the release plan by:

- organization identity and payments-profile verification;
- legal organization name/address and D-U-N-S matching;
- authorized representative identity and supported organization documents;
- verified organization phone, public developer contact, and website;
- physical Android device verification if Play Console still requests it;
- a voluntary internal/closed beta on representative hardware;
- Play pre-launch report, policy declarations, content rating, data safety,
  store listing, and production review.

The Google account transition does not remove PromptSpend's own Android beta,
accessibility, privacy, performance, or device-quality gates.

## Non-blocking decisions to close during implementation

- Select final app icon and splash direction at the visual checkpoint.
- Decide whether exact native tokenization meets physical-device performance
  requirements; retain honest approximate labels if it does not.
- Confirm the final Google account type and production eligibility in Play
  Console before planning the production submission date.
- Confirm final store support email, website, privacy URL, and public developer
  display information before metadata submission.

## Change control

This specification represents the fully approved Launch Release. A new feature
request is welcome, but after UX lock it must be placed in a later release or
paired with an explicit schedule adjustment. Bug fixes, accessibility work,
privacy protections, and changes required for store compliance are not scope
expansion.
