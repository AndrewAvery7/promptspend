# PromptSpend Mobile

Native iOS and Android applications for PromptSpend, built with Expo SDK 57, React Native, TypeScript, and Expo Router.

Status: native parity beta. The app loads validated live pricing, enforces the 24-hour stale-price ceiling, and executes the same extracted cost engine as the website. Estimate, four-model workload comparison, full catalog exploration, Learn, Data & Alerts, private on-device pasted-text estimation, Search, Guided Tour, ticker, CSV/scenario sharing, and persisted appearance choices are implemented in source. Store release remains blocked on the physical-device and accessibility gates in [`../../docs/MOBILE_PARITY.md`](../../docs/MOBILE_PARITY.md).

The full public Launch Release was approved on 2026-08-12. Its Home Cost Brief, five-destination navigation, onboarding, presets, saved scenarios, favorites/watchlist, Savings Playbook, Cost Sensitivity Lab, AI Cost Receipt, Privacy Shield, resilience, accessibility, visual-polish, and release gates are defined in [`../../docs/MOBILE_LAUNCH_RELEASE.md`](../../docs/MOBILE_LAUNCH_RELEASE.md).

The icon, Android adaptive/monochrome layers, splash artwork, and favicon use the established PromptSpend mark from the production website. Space Grotesk, IBM Plex Sans, and JetBrains Mono are bundled locally with their licenses; the app never downloads interface fonts at runtime.

## Cloud identity

- Expo owner: `crestwood-holdings`
- Expo slug: `promptspend-app`
- EAS project ID: `9671ef3e-be90-49ba-aebe-56b6982af806`
- iOS bundle identifier: `com.promptspend.app`
- Android application ID: `com.promptspend.app`
- Deep-link scheme: `promptspend`

Apple has accepted and processed production builds under this identifier. Google Play registration is paid. The owner is working with Google to transition the developer account from personal to organization; until Play Console confirms that change and its production path, personal-account testing requirements remain a release contingency. Android physical-device, beta, policy, and release-quality gates remain required regardless of account type.

## Local commands

Run commands from `apps/mobile`:

```sh
npm install
npm run lint
npm run typecheck
npx expo-doctor
npm run start
```

Platform development:

```sh
npm run ios
npm run android
npm run web
```

Cloud-project verification:

```sh
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

Never store an Expo password, access token, recovery code, Apple signing credential, Google service-account key, or store secret in this directory. Interactive account access belongs in the provider's secure login flow. CI credentials will be added only when a specific workflow requires them.

## Privacy and data boundaries

- Pasted prompt text must stay on the device.
- Prompt text must never enter logs, crash metadata, alerts, analytics, or shared links.
- Prices must pass schema validation before display, with sync freshness evidence shown in the interface.
- Each cold start attempts a live catalog refresh. A failed refresh may use the last validated download only while it is under 24 hours old, with a persistent warning and timestamp. At 24 hours the app withholds calculations.
- Token counts are called exact only after tokenizer parity is proven on the target runtime.
- No behavioral analytics, advertisements, purchases, subscriptions, or user accounts are planned for version 1.

See [`../../docs/MOBILE.md`](../../docs/MOBILE.md) and [`../../design-system/promptspend-mobile/MASTER.md`](../../design-system/promptspend-mobile/MASTER.md) for the project gates and visual source of truth.

## Current architecture

- `../../packages/core` owns platform-neutral catalog validation, freshness, exact integer cost math, and display formatting.
- The existing `src/lib` paths are compatibility exports, so the website, API, and tests keep their stable imports.
- `src/data/catalog.ts` owns the native network and file-cache adapter. It never persists prompts or scenario inputs.
- Estimate lets people either enter known token counts or paste the real system prompt, typical user message, and representative model response. Pasted text remains only in screen state; the app derives an immediate, clearly marked approximate token count with the selected model's catalog profile.
- Compare applies the same text and usage assumptions to as many as four models, derives each model's workload independently from its own tokenizer profile, starts with the website's representative frontier-to-budget shortlist, ranks costs cheapest-first, shows monthly deltas and potential annual savings, and rejects a fifth model without changing the current selection.
- Compare also exposes the complete searchable/sortable catalog, legacy and unlisted filters, provenance details and links, and an accessible illustrative capability-versus-price map tied to the four-model shortlist.
- Learn reads the same seven lesson modules as the website and includes a private three-family token lab. Counts remain honestly labelled as calibrated estimates pending Hermes parity proof.
- Data & Alerts shows pipeline health, public sync evidence, the trust ladder, flagged prices, commit-feed and repository options, secure hosted email-alert management, and API/MCP/editor integrations. Native push remains withheld until the alerts Worker supports APNs/FCM tokens; browser VAPID subscriptions cannot be reused by native apps.
- Search covers every destination, models, comparison selection, appearance, the tour, and scenario reset. Appearance persists System/Light/Dark, four accents, and cool/warm canvases on-device.
- The pricing ticker is derived from the validated catalog, can be paused, and disables automatic movement when Reduce Motion is enabled.
- Scenario links carry only model choices, derived token counts, and assumptions. Native CSV export includes costs, warnings, assumptions, provenance, and freshness evidence.
- Estimate and comparison results open the native system share sheet. Platform-neutral text builders in `../../packages/core` exclude prompt content and keep explicit field separators when email clients collapse plain-text line breaks.
- Exact native tokenization remains gated on golden-fixture, performance, and memory proof under Hermes on physical iOS and Android devices; until then, pasted-text counts use the documented calibrated estimate.
- CI typechecks and lints the native source, validates Expo configuration, and creates production bundles for iOS, Android, and web.
- The responsive layout supports iPhone, iPad, Android phone/tablet, light/dark appearance, safe areas, and landscape. Native screen-reader and largest-text testing still requires physical devices.
