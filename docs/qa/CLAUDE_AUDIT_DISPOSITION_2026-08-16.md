# Claude full-system audit disposition — 2026-08-16

Status: source remediation, private QA binaries, production website/data, and
hardened backend deployments completed; physical-device evidence and public
store approval remain outstanding

## Scope and authority

This record dispositions the findings in the August 16 Claude Code full-system
audit against source commit `153ff12badb096e998a79deb1871c6a698559c50`.
Changes were initially isolated on `fix/full-release-hardening-2026-08-16` so
the complete diff could receive one final review.

At the time of the initial disposition, no EAS build, TestFlight upload,
Cloudflare deployment, GitHub push, publication, or public release had been
performed. The later approved completion work is recorded below; no App Review
submission, Google Play upload, npm publication, VS Code extension publication,
or public mobile-app release has been performed.

## Post-approval completion evidence

- PR #70 merged the hardened release candidate to `main`; PRs #71 and #72 fixed
  the pricing-sync badge and review-branch automation; PR #73 published the
  first-party-reviewed 2026-08-16 catalog.
- Private iOS build 14 (`e75b93f4-6d23-4dd0-ac78-930cdaf2ad48`) was uploaded to
  App Store Connect/TestFlight through submission
  `5cf00ebb-8624-4ff9-a8a7-bc7c84e6e031`. This was an internal beta delivery,
  not an App Review submission.
- Private Android APK build `391818eb-a439-4d8c-ad39-fb554fbb24e9` was produced
  for direct physical-device QA. It was not uploaded to Google Play.
- The hardened pricing API Worker is live as version
  `32319e40-d665-4098-937a-9994ea081e50`; the hardened Alerts Worker is live as
  version `6d85b14c-6a03-4926-8f61-0f62d4c33935`.
- The Alerts Worker health and configuration endpoints returned healthy
  production responses. The API health endpoint was temporarily freshness-
  gated while the scheduled pricing review was unresolved; PR #73 published a
  fresh validated catalog to clear that data gate.

## Implemented dispositions

The remediation intentionally followed risk, not finding count. Duplicate
findings are listed together because one root fix closes each duplicated
symptom.

| Area                                       | Audit findings closed or materially remediated                                 | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared cost engine and validation          | `CORE-01`–`CORE-11`, `ORC-03`–`ORC-05`                                         | Promotional dates are inclusive through the stated UTC day; annual cost is monthly × 12; billed output tokens are explicit; ties, free rows, long-context cache writes, pico totals, introductory tiers, and impossible values are consistent and tested.                                                                                                                                                                                                                              |
| Native numeric entry, state, and freshness | `UI-01`, `UI-07`, `UI-13`, `STATE-01`–`STATE-12`, `ORC-01`, `ORC-02`, `ORC-11` | Decimal and comma-decimal drafts survive editing; clamping is announced; catalog fetches time out; a working catalog survives refresh failure; foreground revalidation, cache placement, persistence quarantine, model reconciliation, range validation, and safe-area behavior are hardened.                                                                                                                                                                                          |
| Native UX and accessibility                | `UI-02`–`UI-06`, `UI-08`–`UI-18`, `ORC-12`                                     | Guided Tour navigation/spotlighting degrades honestly, Reduce Motion is honored, Search reaches Home, sheets manage focus, color is not the only freshness cue, control boundaries and semantic colors meet the intended contrast contract, heavyweight fonts are available, the rejected More tab is removed from the design source, and stale search state is cleared.                                                                                                               |
| Native alerts and sharing                  | `ALERT-01`–`ALERT-10`, `PRIV-02`, `TEST-02`–`TEST-04`                          | Alert transitions announce/focus correctly; missing Turnstile configuration fails visibly; the WebView is origin-, path-, nonce-, size-, and message-shape-bound; expiry is handled; comparison receipts use model-specific counts and one annual convention; prompt sentinels now exercise real privacy boundaries.                                                                                                                                                                   |
| Alerts Worker and privacy                  | `WKR-01`–`WKR-14`, `PRIV-01`, `PRIV-03`                                        | Active subscriptions cannot be downgraded anonymously; D1 lists are chunked; related rows are cleaned up; preference writes fail if the subscriber is gone; email transport fails closed and logs are redacted; Turnstile hostname/action checks are mandatory; management tokens use authorization headers; anti-enumeration work is normalized; CORS and JSON headers are tightened; async failures are surfaced.                                                                    |
| Pricing pipeline                           | `PIPE-01`–`PIPE-05`, `PIPE-08`–`PIPE-15`                                       | Degraded status describes the artifact actually published; malformed revision reads fail; notification ranges cover the full push and transition IDs; duplicate or unverifiable overrides fail; override/feed drift is flagged; stale models are demoted and can recover; input/output swaps, promotional inversions, long-context fields, thresholds, sitemap XML, and sync-manifest/catalog equality are validated.                                                                  |
| Public API and MCP                         | `API-01`–`API-15`                                                              | MCP arguments are shape- and range-checked; fetches time out; fallback age is visible and bounded; the API has health ceilings, conditional freshness headers, safer stale caching, route-specific filtering, bounded IDs, `nosniff`, expanded OpenAPI/docs, and exact provenance requirements.                                                                                                                                                                                        |
| Website and generated pages                | `WEB-01`–`WEB-08`                                                              | Privacy/support text covers the native alert path; web Turnstile requests bind client/action; disabled states explain misconfiguration; machine-readable text and generated fields are escaped; blank URL values fall back; dead exports are removed; shared code replaces selected duplication.                                                                                                                                                                                       |
| VS Code extension                          | `VSC-01`–`VSC-10`, `CORE-03`                                                   | URI-aware multi-root references, user exclusions, pre-read file caps, abort/backoff behavior, catalog-before-sweep, document-version guards, untrusted/virtual workspace declarations, untrusted Markdown, `.env` disclosure, and shared-engine estimates replace the unsafe or divergent paths.                                                                                                                                                                                       |
| CI, PWA, and supply chain                  | `CI-01`–`CI-12`, `REL-07`, `REL-08`                                            | Deploy confirmation carries code identity; bot price changes can reach the notify workflow; social-card claims are part of `verify`; CSP checks no longer claim unsupported frame protection; install scripts are disabled then only reviewed native packages are rebuilt; the MCP publisher is version/SHA-pinned; service-worker destinations are allowlisted; maskable art is distinct; Turnstile is fixed-sitekey/noindex; pricing sync has concurrency and safe shell boundaries. |
| Store truthfulness and release records     | `REL-01`–`REL-10`, `DOC-01`–`DOC-10`, `ORC-08`–`ORC-10`                        | Store descriptions, review notes, privacy/data-safety drafts, subtitle, endpoint profiles, Android transfer controls, build history, support/privacy pages, architecture, parity, and QA documents now describe optional native email alerts and distinguish old binaries from current source.                                                                                                                                                                                         |
| Test integrity                             | `TEST-01`–`TEST-04`, `TEST-07`, `TEST-10`–`TEST-14`                            | All five native route outcomes render in component tests; hostile Turnstile messages are tested; privacy sentinels are real; the published total now includes native Jest; coverage points at the real shared engine; long-context, promotion-boundary, discount-stacking, pricing-pipeline, catalog, and mobile-state boundaries have direct regressions.                                                                                                                             |

## Findings corrected or rejected by evidence

- `PIPE-06` is not implemented as written because its premise is false. The
  current official Google Gemini pricing page publishes the 10% cache-read
  rates represented by the catalog. Replacing them would make the data wrong.
- `PIPE-07` is implemented only where first-party evidence exists. Gemini 2.5
  Pro and 3.1 Pro Preview now carry their verified over-200k tiers. No
  `flatRate` or tier metadata was invented for other providers.
- `PIPE-04` was labelled refuted in the audit's own consolidated table. The
  broader concern is nevertheless closed: vendor provenance now requires a
  verification date and HTTPS source, and a vendor-verified override no longer
  suppresses feed cross-checking unless it actually supplies the base rates.
- `ORC-06` and `ORC-07` were audit spec clarifications, not defects. Their
  fail-closed behavior is retained.
- `PIPE-14` needs no synthetic date. The empty state now says that no price
  change has been recorded since tracking began; `lastChanged` will appear only
  after an observed price transition.

## Evidence-gated work deliberately not fabricated

These are not source tasks Codex can honestly mark complete without a different
kind of evidence:

1. Exact native tokenization remains labelled approximate until shared golden
   fixtures pass under Hermes on physical iPhone, iPad, and Android hardware.
2. The remaining modal/error-state accessibility journeys, VoiceOver/TalkBack,
   largest text, orientation, keyboard, performance, real email delivery, and
   24-hour foreground-resume behavior require the hardened private binary and
   the device protocol in `docs/MOBILE_BETA_QA.md`.
3. Native APNs/FCM push remains the approved post-launch platform adaptation;
   browser VAPID subscriptions cannot be reused by a native binary.
4. Newly discovered or disputed upstream models are not publishable until
   first-party vendor verification resolves each review flag.
5. The mobile npm tree still reports 25 expanded findings from the compatible
   Expo 57 dependency graph (9 moderate, 16 high, 0 critical). Their two leaf
   paths are documented in `apps/mobile/SECURITY.md`; npm's proposed forced
   Expo/React Native downgrades are incompatible and were not applied.

## Verification evidence

- Root `npm run verify`: 416 tests with enforced coverage; typecheck, lint,
  formatting, encoding, generated-page claims, production build, catalog
  integrity, bundle budget, CSP, and SEO passed.
- Public test-count contract: 945 total — 416 root, 91 native, 98 Worker, 44
  API, 47 MCP, 137 VS Code, and 112 browser definitions.
- Browser QA: 108 passed and four intentional viewport skips across 112
  Playwright definitions.
- Native: 91 Jest tests across 21 suites, typecheck, lint, release preflight,
  Expo Doctor 21/21, and local iOS/Android/web exports passed.
- API: 44/44 tests and type generation/typecheck passed.
- Alerts Worker: 98/98 tests and both typecheck targets passed.
- MCP: 47/47 tests, footprint, build, startup, tool listing, and a priced
  provenance response passed.
- VS Code: 137/137 tests, build, activation, footprint, and packaged tokenizer
  checks passed.
- Production dependency audit: zero known findings in root, API, Worker, MCP,
  and VS Code trees. Their shared development-tool `nanoid` advisory was
  removed through lockfile-only, script-disabled updates.
- Live pricing review fetched 3,040 LiteLLM entries and 389 OpenRouter
  cross-check candidates. First-party review added Gemini 3.7 Flash and Grok
  4.6, excluded a Token-Plan-only Qwen candidate, corrected current vendor
  rates, and published a valid 72-row catalog while retaining honest
  cross-source disagreement flags.

## Next release gate

Install the exact private binaries above, execute `docs/MOBILE_BETA_QA.md` on
iPhone, iPad, and the Galaxy device, and record physical-device evidence. Then
resolve any device-only defects and repeat the affected checks. App Review and
Google Play submission remain later, separate actions requiring the user's
explicit approval.
