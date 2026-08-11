# Mobile dependency security notes

Last reviewed: August 10, 2026

## Current scaffold audit

The initial Expo SDK 57 dependency graph reports npm audit findings even though Expo Doctor and Expo's compatibility check pass. The 22 expanded findings trace to two root advisories:

1. `image-size` can loop indefinitely while parsing specially crafted ICNS, JXL, or HEIF images. It is pulled into Metro's development/build toolchain.
2. Older `uuid` releases can miss a destination-buffer bounds check in specific v3/v5/v6 API usage. They are pulled into Expo configuration/build tooling.

The current mobile application does not accept user images, parse these image formats at runtime, call the affected `uuid` buffer APIs, or ship Metro as an end-user feature. That materially limits exposure, but it does not make the dependency findings disappear.

## Why `npm audit fix --force` is prohibited

npm currently proposes incompatible forced downgrades, including Expo SDK 53 and React Native 0.72. Those versions do not match the SDK 57 project and would replace the verified platform foundation with an unsupported dependency combination.

Do not run `npm audit fix --force`.

## Required controls

- Keep Expo and React Native on versions accepted by `npx expo install --check` and `npx expo-doctor`.
- Do not feed untrusted or user-supplied images into the local Metro/build asset pipeline.
- Use only reviewed repository assets during development and CI.
- Re-run the full npm audit at each Expo patch update and before every beta/release build.
- Upgrade when Expo publishes a compatible dependency chain containing fixed leaf packages.
- Reassess immediately if the app later adds image import, document upload, or any server-side bundling of user content.
- Block release for any critical advisory or any advisory shown to be reachable in shipped runtime behavior.

This is a dated triage record, not a permanent waiver. The dependency state must be re-derived from the current lockfile whenever versions change.
