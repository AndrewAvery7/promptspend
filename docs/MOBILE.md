# PromptSpend mobile applications

Status: Phase 1 - compatibility spike and first Estimate vertical slice

PromptSpend will ship native iOS and Android applications from one React Native and Expo codebase. The mobile work must preserve the existing website, public API, MCP server, VS Code extension, catalog pipeline, and privacy guarantees.

This public document deliberately excludes legal entity details, D-U-N-S information, account identifiers, device serial numbers, credentials, and recovery information. Those records belong in the private project checklist outside this repository.

## Stable application identity

These values are the proposed permanent identifiers. They must be registered in the publisher accounts before production builds are created.

| Purpose                | Value                                           |
| ---------------------- | ----------------------------------------------- |
| Store display name     | `PromptSpend`                                   |
| Expo owner             | `crestwood-holdings`                            |
| Expo project slug      | `promptspend-app`                               |
| EAS project ID         | `9671ef3e-be90-49ba-aebe-56b6982af806`          |
| iOS bundle identifier  | `com.promptspend.app`                           |
| Android application ID | `com.promptspend.app`                           |
| Native URL scheme      | `promptspend`                                   |
| Marketing URL          | `https://promptspend.com/`                      |
| Support URL            | `https://promptspend.com/support/`              |
| Privacy URL            | `https://promptspend.com/privacy/`              |
| Pricing catalog        | `https://promptspend.com/data/pricing.json`     |
| Sync status            | `https://promptspend.com/data/sync-status.json` |

The Expo owner, slug, and EAS project ID are linked. The bundle/application ID cannot be treated as final until both publisher consoles accept it. Changing it after a public release would create a different application, so registration is a Phase 0 gate.

The support and privacy URLs are reserved decisions, not claims that those pages are live yet. Both pages must be implemented, published, and verified before beta distribution or store submission.

## Repository starting state

- Mobile work begins from synchronized `main` commit `1fafd36`.
- Working branch: `mobile/phase-0-foundation`.
- Safety branch: `safety/pre-mobile-sync-20260810`.
- A named safety stash preserves the two pre-existing local worktree files. It must not be popped as part of mobile development because those files are already restored in the worktree.
- Mobile commits must stage only explicitly reviewed mobile paths. The pre-existing `docs/DEFERRED.md` modification and `referrers-2026-08-10.json` file are outside mobile scope.

## Version 1 product decisions

- Free download.
- No advertising.
- No purchases or subscriptions.
- No user accounts.
- Phone-first layouts for the initial release.
- A deliberate tablet experience follows the phone release.
- No behavioral analytics or cross-app tracking.
- Optional native price alerts are the only planned server-backed personal configuration.

## Non-negotiable safety boundaries

1. Pasted prompt text stays on the device and is never included in telemetry, alerts, logs, crash metadata, or shared links.
2. Prices are displayed only after schema validation and freshness checks.
3. A network failure may use the last validated catalog for no more than the documented 24-hour grace period and must show a visible warning.
4. No client secret, store credential, signing key, recovery code, D-U-N-S record, or private account detail is committed to Git.
5. Token counts are labeled exact only after the tokenizer is proven against shared golden fixtures on the target runtime.
6. Store privacy declarations must describe actual behavior, including optional push tokens and alert preferences.

## Phase gates

### Phase 0 exit

- Organization publisher model confirmed.
- Version 1 business model confirmed.
- Permanent application identifiers accepted in the appropriate consoles.
- Expo, Apple Developer, and Google Play organization access established with two-factor authentication and recovery ownership documented privately.
- At least one iPhone is available; Android acquisition is tracked before closed beta.
- Existing repository work is preserved.

### Phase 1 exit

- Signed development builds run on physical iOS and Android devices.
- Catalog validation and the 24-hour stale-data boundary are proven.
- The shared cost engine matches website golden fixtures.
- `js-tiktoken/lite` is either proven under Metro/Hermes or rejected with an explicitly labeled fallback.
- Startup, catalog parsing, tokenization time, and representative memory use are recorded.

### Dependency security checkpoint

The SDK 57 scaffold's current npm audit findings and risk controls are documented in `apps/mobile/SECURITY.md`. Expo Doctor and Expo's version compatibility check must remain green, but those checks do not replace advisory review. Forced audit downgrades are prohibited; findings must be traced to reachable runtime or build-tool behavior and reviewed again before beta and release.

### Current Phase 1 evidence

- Expo SDK 57 application created at `apps/mobile`.
- EAS project linked to `@crestwood-holdings/promptspend-app`.
- App name, owner, slug, project ID, native URL scheme, iOS bundle identifier, and Android application ID resolve through Expo's public configuration command.
- Generated tutorial code and unrelated tutorial assets removed.
- The first platform-neutral slice now lives in `packages/core`: pricing types and validation, freshness/catalog indexing, integer cost math, and display formatting.
- Stable website and API import paths remain as compatibility exports, and the full website regression suite remains green after extraction.
- The mobile catalog adapter fetches the live pricing and sync manifests on cold start, validates before use, and keeps a bounded native file cache.
- A failed refresh can use a validated cache only while it is under 24 hours old. At 24 hours or without any valid source, the app displays a retry state and withholds all calculated prices.
- No hard-coded fallback price table is shipped in the app binary.
- The native Estimate slice includes searchable model selection, manual token counts or private pasted-text estimation for all three workload fields, conversation-history compounding, traffic inputs, optional prompt-cache assumptions, monthly/daily/annual results, impossible-scenario warnings, and calculation disclosure.
- Native Compare supports up to four selected models and derives pasted-text token estimates separately for each model's catalog profile before ranking costs. Pasted text is held only in screen state and is excluded from shared results.
- The interface uses the existing light/dark cobalt design tokens, safe areas, Expo Router, semantic controls, 48dp interactions, and a tablet-width reading column. iPad support is enabled in the application configuration.
- Mobile lint and strict TypeScript checks pass.
- Expo dependency compatibility check passes.
- Expo Doctor passes all 20 checks.
- Static Expo web export completes without warnings and was visually reviewed at 375x812 in light and dark themes plus landscape.
- Browser-level compatibility tests prove model selection, recalculation, cache-assumption disclosure, and hard withholding when no valid catalog is available.
- A signed Android production AAB has been produced through EAS; native installation still requires an APK/development build and Android hardware or emulator.
- Remaining Phase 1 proof requires native iOS signing after Apple membership activation, physical iOS/Android execution, tokenizer compatibility, and measured device performance.

## Planned repository layout

```text
apps/
  mobile/              Expo application and native adapters
packages/
  core/                Platform-neutral pricing, validation, and cost logic
src/                    Existing website
api/                    Existing public pricing API
mcp/                    Existing MCP server
vscode/                 Existing VS Code extension
worker/                 Existing alerts service
```

The website stays in its current location during the first extraction. Shared modules move in small, parity-tested slices rather than through a single large repository restructure.
