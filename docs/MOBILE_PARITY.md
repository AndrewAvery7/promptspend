# PromptSpend website-to-mobile parity

Status: active release gate

The iOS and Android applications must represent every user-facing capability of
`promptspend.com`. A native interaction may differ from the browser when the
platform calls for it, but the underlying user outcome must remain available.
Anything not carried into mobile requires a specific, public explanation in
this document.

Legend:

- **Complete** — implemented in the current mobile source and verified by an
  automated or device-level check.
- **Partial** — the central outcome exists, but one or more website capabilities
  are still absent.
- **Missing** — no mobile representation exists yet.
- **Adapted** — intentionally implemented with a native interaction rather than
  a literal copy of the browser UI.
- **Web-only** — the capability exists to make the website discoverable or
  installable and has no useful native equivalent.

## Product navigation and global tools

| Website capability                                 | Source                                                | Mobile status                                                                                                                                                    | Required mobile representation                                                                 |
| -------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Estimate, Compare, Learn, Data & Alerts navigation | `src/components/Header.tsx`                           | **Partial** — all four native destinations are implemented; physical-device QA remains                                                                           | Retain scenario state across every destination                                                 |
| Search & commands                                  | `src/components/CommandPalette.tsx`, `src/App.tsx`    | **Partial** — native command sheet covers destinations, models, comparison selection, appearance, tour, and reset; device QA remains                             | Complete VoiceOver/TalkBack and hardware-keyboard checks                                       |
| Guided tour                                        | `src/components/GuidedTour.tsx`                       | **Partial** — a six-step contextual walkthrough now navigates to and spotlights the real Home, Estimate, Compare, Learn, Data & Alerts, and global-tool surfaces | Complete physical-device navigation, focus, scrolling, reduced-motion, and largest-text checks |
| Pricing ticker                                     | `src/components/Ticker.tsx`                           | **Partial** — live-catalog ribbon, pause, swipe, and Reduce Motion behavior are implemented                                                                      | Complete physical-device motion and screen-reader checks                                       |
| Prices-changed and sources-checked evidence        | `src/components/Header.tsx`                           | **Partial** — a compact freshness chip exists                                                                                                                    | Preserve both distinct dates and degraded-pipeline state throughout the app                    |
| Light and dark interface                           | `src/state/useAppearance.ts`                          | **Partial** — persisted System, Light, and Dark choices are implemented; automated semantic-token contrast gates pass                                            | Complete physical-device dark-interface QA                                                     |
| Four accent colours                                | `src/state/useAppearance.ts`, `src/styles/tokens.css` | **Partial** — cobalt, emerald, teal, and violet share the website token pairs; all appearance combinations have automated contrast coverage                      | Complete device QA for every combination                                                       |
| Cool and warm canvas                               | `src/state/useAppearance.ts`, `src/styles/tokens.css` | **Partial** — persisted cool-paper and warm-cream canvases are implemented                                                                                       | Complete device QA                                                                             |
| Footer resources                                   | `src/App.tsx`                                         | **Adapted** — repository, API, MCP, extension, alert, evidence, and model-request resources live in Data & Alerts                                                | Native apps use a destination rather than a repeated web footer                                |

The store-facing accessibility claims and exact physical test script live in
[`MOBILE_ACCESSIBILITY.md`](MOBILE_ACCESSIBILITY.md). No accessibility feature
is declared in a store listing solely from source inspection.

## Native launch intelligence

| Launch capability         | Mobile status                                                                                                                                                              | Required work                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cost Brief home           | **Partial** — active cost, savings opportunity, presets, saved work, and watched models are implemented                                                                    | Complete device, offline, and largest-text QA                                                     |
| Saved scenarios           | **Partial** — save, rename, duplicate, reopen, confirmed delete, and undo are implemented with a versioned v1-to-v2 migration                                              | Complete persistence and interruption QA on both platforms                                        |
| Private paste restoration | **Complete in source** — only derived counts and paste-field markers are retained; restoration explicitly says raw text was not saved                                      | Retain sentinel coverage and complete device announcement QA                                      |
| Favorites and watchlist   | **Partial** — models can be watched from Home, Estimate, Compare, Search, catalog rows, and model details; review, unlisted, legacy, and unavailable states remain visible | Complete catalog-change fixture and device QA; version 1 intentionally has no push notifications  |
| AI Cost Receipt           | **Partial** — a local preview creates a polished PNG or readable text summary from derived values only                                                                     | Complete Messages, Mail, Gmail, Messenger, Notes, Files, iPad-anchor, and Android share-target QA |

## Estimate

| Website capability               | Mobile status                                                                                          | Required work                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Searchable model selection       | **Complete**                                                                                           | Retain                                                                             |
| Manual token inputs              | **Complete**                                                                                           | Retain                                                                             |
| Private pasted-text estimation   | **Complete in build 8 source**                                                                         | Complete physical iOS and Android verification; never persist or share prompt text |
| Per-model token profiles         | **Complete in build 8 source**                                                                         | Retain independent token derivation for each compared model                        |
| Conversation-history compounding | **Complete**                                                                                           | Retain                                                                             |
| Conversations per day            | **Complete**                                                                                           | Retain                                                                             |
| Prompt caching                   | **Partial** — adjustable cache share and cache-write economics are implemented                         | Complete physical-device QA                                                        |
| Batch API assumption             | **Partial** — provider-aware batch control is implemented                                              | Complete regression and device QA                                                  |
| Reasoning-token multiplier       | **Partial** — 1×–5× decimal control and disclosure are implemented                                     | Complete regression and device QA                                                  |
| Monthly active users             | **Partial** — implemented in scaling                                                                   | Complete device QA                                                                 |
| Revenue per user                 | **Partial** — implemented in scaling                                                                   | Complete device QA                                                                 |
| Cost per user and margin         | **Partial** — implemented in result summaries and shares                                               | Complete regression and device QA                                                  |
| Input/output monthly split       | **Partial** — per-conversation and monthly splits are implemented                                      | Complete readable-layout QA at largest text                                        |
| Live scenario insights           | **Partial** — native insights cover output share, history, caching, shortlist spread, and margin       | Expand only if website insight coverage grows                                      |
| Warnings and assumptions         | **Complete**                                                                                           | Retain and expand for the added assumptions                                        |
| Share result                     | **Complete, adapted in source** — readable native sharing plus a previewable local AI Cost Receipt PNG | Complete share-target and physical-device QA                                       |
| Share restorable scenario        | **Adapted** — a privacy-safe website scenario link carries counts and assumptions, never pasted text   | Add direct native-route restoration only after universal/app links are configured  |
| Export CSV                       | **Partial** — native CSV generation and system share/save sheet are implemented                        | Complete physical iOS and Android file-save QA                                     |
| Reset scenario                   | **Partial** — available through Search & commands                                                      | Complete state-reset regression and device QA                                      |

The website lets as many as four models appear inside Estimate, while the
current mobile layout separates a single-model Estimate from a multi-model
comparison. That separation is an acceptable phone adaptation only if Compare
retains the same scenario and exposes every result and assumption available on
the website.

## Compare and catalog exploration

| Website capability                                             | Mobile status                                                                                              | Required work                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Compare up to four models on one workload                      | **Complete in build 8 source**                                                                             | Complete physical-device verification                            |
| Cheapest-first ranking, monthly differences, and annual spread | **Complete**                                                                                               | Retain                                                           |
| Share comparison                                               | **Complete**                                                                                               | Retain                                                           |
| Full tracked-model catalog                                     | **Partial** — complete searchable native catalog is implemented                                            | Complete physical-device performance and largest-text QA         |
| Sort by name, provider, input, output, and context             | **Partial** — implemented as touch-friendly sort choices                                                   | Complete device QA                                               |
| Show legacy, deprecated, and unlisted models                   | **Partial** — off-by-default filter and status labels are implemented                                      | Complete device QA                                               |
| Source, verification date, and review badge per model          | **Partial** — model rows and detail/source sheets are implemented                                          | Complete link and device QA                                      |
| Capability-versus-price Value Map                              | **Partial** — accessible native scatter map and structured list are implemented with illustrative labeling | Complete VoiceOver/TalkBack point-navigation and touch-target QA |
| Select models from catalog or chart                            | **Partial** — both connect to the four-model shortlist                                                     | Complete max-four feedback and device QA                         |
| Shortlist priced with the current Estimate workload            | **Partial** — shared scenario is retained during catalog exploration                                       | Complete device regression QA                                    |

## Learn

The entire section is **implemented in source; physical-device QA remains**.
The website and native apps now share the exact lesson content through
`packages/core/src/content/learn.ts`:

1. Tokens 101.
2. Output costs more.
3. The price spread is enormous.
4. Chat history compounds.
5. Reasoning models bill their thinking.
6. Caching and batching.
7. How PromptSpend avoids stale pricing.

The interactive token lab is implemented. Native initially uses
the same clearly labelled calibrated estimates used by pasted prompt entry.
Exact tokenizer claims remain blocked until the shared golden fixtures pass on
Hermes on physical iOS and Android hardware.

## Data & Alerts

| Website capability                                                | Mobile status                                                                                                                                      | Required mobile representation                                                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline health                                                   | **Partial** — all four health facts are implemented                                                                                                | Complete device QA                                                                                                                                                            |
| Degraded-run warning                                              | **Partial** — catalog gating and the full Data explanation are implemented                                                                         | Complete degraded-fixture QA                                                                                                                                                  |
| Public sync manifest                                              | **Partial** — opens the published JSON evidence                                                                                                    | Complete link QA                                                                                                                                                              |
| Commit-feed alert option                                          | **Partial** — copies the Atom URL and explains its purpose                                                                                         | Complete clipboard QA                                                                                                                                                         |
| Watch repository option                                           | **Partial** — opens the repository in the system browser                                                                                           | Complete browser handoff QA                                                                                                                                                   |
| Email price alerts                                                | **Adapted** — native subscribe and double-opt-in controls are implemented; Turnstile alone runs in an isolated, data-minimized WebView             | The service is live. Deploy the hardened Worker/static-page revision only under separate approval, then complete real-email and device QA                                     |
| Browser push alerts                                               | **Not portable**                                                                                                                                   | Do not send Web Push/VAPID subscriptions from a native binary. Add APNs/FCM/Expo push support to the worker, then expose native notification permission and model preferences |
| Alert cadence, scope, followed models, and unsubscribe management | **Adapted** — native controls use a short-lived emailed code rather than a password or website handoff; signed website preference links still work | Complete subscribe, verification-code, update, invalid/expired-code, and destructive-unsubscribe QA against the separately approved hardened deployment                       |
| Trust ladder                                                      | **Partial** — all four provenance levels and scope are implemented                                                                                 | Complete device QA                                                                                                                                                            |
| Flagged-for-review list                                           | **Partial** — current flagged rows, notes, and rates are implemented                                                                               | Complete flagged and empty-state QA                                                                                                                                           |
| MCP server                                                        | **Partial** — explanation and npm link are implemented                                                                                             | Complete link QA                                                                                                                                                              |
| Pricing API                                                       | **Partial** — explanation and developer-hub link are implemented                                                                                   | Complete link QA                                                                                                                                                              |
| VS Code/Open VSX extension                                        | **Partial** — both marketplace links are implemented                                                                                               | Complete link QA                                                                                                                                                              |
| Privacy policy and support                                        | **Complete in source** — dedicated public pages and native links are implemented                                                                   | Deploy and verify both public URLs; complete browser, mail, and accessibility handoff QA                                                                                      |

The public alerts service is live for browser push and email. Browser push
subscriptions contain VAPID endpoint/encryption keys and cannot be reused as
native Apple or Android push tokens. This is a protocol boundary, not a product
decision. Native push is therefore the one website outcome that requires a
server migration before it can be truthfully presented as complete.

The native Alert Center sends only the email address, cadence, alert scope, and
selected model identifiers to the alerts API. The anti-abuse WebView receives
only the public Turnstile site key and appearance; it never receives the email,
model choices, scenarios, or prompt text. Management codes expire after ten
minutes, are one-time use, are HMAC-protected at rest, and are invalidated after
five failed attempts.

## Intentional platform adaptations

| Website behavior                              | Native treatment                                                 | Why                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl/Cmd-K` keyboard shortcut                | Visible Search button; optional hardware-keyboard shortcut later | Phones do not have a persistent hardware keyboard, but the search outcome must remain one tap away                              |
| Hover tooltips on the Value Map               | Tap/focus detail and a complete structured list                  | Hover does not exist on touch screens; the list is also the accessible source of truth                                          |
| Copy scenario URL                             | Native share sheet with a deep link                              | The system share sheet reaches messaging, mail, notes, and file destinations without app-specific integrations                  |
| Browser download for CSV                      | Native temporary file plus share/save sheet                      | Native apps do not have a browser downloads folder contract                                                                     |
| Web Push                                      | APNs/FCM/Expo notifications                                      | Native operating systems do not consume browser VAPID subscriptions                                                             |
| PWA manifest and service worker               | **Web-only**                                                     | The installed native application replaces the install/offline shell those files provide                                         |
| Generated SEO model/provider/comparison pages | Catalog, model detail, and source links in app                   | Crawlable pages exist for search-engine discovery; duplicating 159 static routes inside a native binary adds no user capability |

## Release gate

Store submission cannot call the native app feature-complete until:

1. Every row above is Complete, Adapted, Web-only, or carries an approved and
   current explanation.
2. Both platforms pass phone and tablet testing in portrait and landscape.
3. VoiceOver/TalkBack, Voice Control where applicable, largest text, contrast,
   dark interface, and reduced-motion checks cover every common task.
4. Prompt text remains absent from persistence, telemetry, URLs, shares, crash
   metadata, and alerts.
5. The App Store and Google Play descriptions match the functionality that is
   actually available in the submitted binaries.
