# Galaxy A15 QA — Android version code 6

Status: historical private-QA baseline; no complete physical-device sign-off
recorded for this exact binary.

## Candidate and evidence

- App: PromptSpend 0.1.0; Android versionCode 6.
- EAS build: `d48de221-6a86-4f4c-9315-43cb6b803284`.
- Source: `5a935049e4843b9907eaba9ff4a721fe4398107a`.
- Created: August 26, 2026 at 21:16 UTC; EAS FINISHED at 21:45 UTC.
- Profile: preview / internal, direct-install APK, not a Play submission.
- [Authenticated EAS record](https://expo.dev/accounts/crestwood-holdings/projects/promptspend-app/builds/d48de221-6a86-4f4c-9315-43cb6b803284).
- EAS artifact expiration: September 9, 2026 at 21:16 UTC.
- Identity/status/expiration verified by read-only EAS query August 31. No new
  artifact download, checksum, installation, or device pass is claimed.

The versionCode 5 build (`5d897811-867a-4f0a-9fea-81fac2368e19`) from `e4ee1a9`
was canceled before completing. This replacement includes the compatible
Reanimated/Worklets pin as well as the QA fixes/Help Center in PR #120.

## Distinguish old findings from new verification

The Galaxy A15 reports earlier on August 26 concerned versionCode 4: opening
on Estimate, Guide outline clipping, and global right-edge clipping. The source
corrections are included in versionCode 6, but a successful physical retest on
versionCode 6 has not been recorded. Do not transfer old-build failures or a
source-test pass into this binary's physical QA result.

The later compact-header correction and August 31 audit fixes are not present
in versionCode 6 and require a replacement QA binary after authorization.

## Installation and next checks

Use the authenticated EAS record above or the separately supplied private APK
handoff. Do not commit bearer/download URLs to the repository. Verify the
versionCode before recording results; preserve the existing app/storage by
installing as an update. If Android reports a signature mismatch, stop and
record it rather than uninstalling saved data.

- [ ] Exact versionCode and installation date recorded.
- [ ] Exact Galaxy model, Android/One UI version, zoom/text size recorded.
- [ ] Cold start opens Home.
- [ ] Every tab/header/card stays within safe horizontal bounds.
- [ ] Guide shows complete content on all six steps.
- [ ] Full tab labels appear in the required order.
- [ ] FAQ search, contextual help, and offline lessons work.
- [ ] Keyboard/action, durable-save, and pricing-expiry regressions pass on the
      **replacement** candidate containing those fixes.
- [ ] TalkBack, largest text, portrait, and landscape checks completed.

Overall result for versionCode 6: **not fully assessed**. Follow
`docs/MOBILE_NATIVE_QA_SCOPE.md` and `docs/MOBILE_BETA_QA.md` for the next
candidate. This document authorizes no Google Play upload or public release.
