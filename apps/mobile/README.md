# PromptSpend Mobile

Native iOS and Android applications for PromptSpend, built with Expo SDK 57, React Native, TypeScript, and Expo Router.

Status: Phase 1 compatibility spike and first Estimate vertical slice. The app now loads validated live pricing, enforces the 24-hour stale-price ceiling, and executes the same extracted cost engine as the website. It is not yet the complete version 1 product.

The generated icon, adaptive-icon, splash, and favicon files are temporary placeholders. They must be replaced with approved PromptSpend artwork before any external beta build.

## Cloud identity

- Expo owner: `crestwood-holdings`
- Expo slug: `promptspend-app`
- EAS project ID: `9671ef3e-be90-49ba-aebe-56b6982af806`
- iOS bundle identifier: `com.promptspend.app`
- Android application ID: `com.promptspend.app`
- Deep-link scheme: `promptspend`

The Apple and Google identifiers remain provisional until their publisher consoles accept them.

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
- The current Estimate slice includes model search, token/count inputs, conversation compounding, scale, optional caching, warnings, and calculation disclosure.
- Estimate results open the native system share sheet. Platform-neutral text builders in `../../packages/core` cover both the current estimate and the upcoming multi-model comparison without including prompt content, and keep explicit field separators when email clients collapse plain-text line breaks.
- The responsive layout supports iPhone, iPad, Android phone/tablet, light/dark appearance, safe areas, and landscape. Native screen-reader and largest-text testing still requires physical devices.
