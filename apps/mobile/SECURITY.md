# Mobile dependency security notes

Last reviewed: August 16, 2026

## Current scaffold audit

The lockfile currently uses Expo 57.0.13 and the exact patch versions selected
by `npx expo install`. Expo Doctor passes all 21 checks. `npm audit --json`
reports 25 expanded findings (9 moderate, 16 high, 0 critical); most entries
are dependency-graph propagation from these two leaf advisories:

1. `image-size@1.2.1` can loop indefinitely while parsing specially crafted
   ICNS, JXL, or HEIF images. It is pulled into Metro's development/build
   toolchain through `expo > @expo/metro > metro`.
2. `uuid@7.0.3` can miss a destination-buffer bounds check in specific v3/v5/v6
   API usage. It is pulled into Expo configuration/build tooling through
   `expo-sharing > @expo/config-plugins > xcode`.

The current mobile application does not accept user images, parse these image
formats at runtime, call the affected `uuid` buffer APIs, or ship Metro or the
Expo configuration toolchain as an end-user feature. That materially limits
exposure, but it does not make the dependency findings disappear.

The new `react-native-webview` 13.16.1 dependency is the Expo SDK 57 supported
version and does not appear as a vulnerable package in the current audit. The
Alert Center WebView is ephemeral, loads one HTTPS origin, blocks mixed content
and unapproved top-level navigation, and receives no email address, model
selection, scenario data, or prompt text.

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

This is a dated triage record derived from the August 16 lockfile, not a
permanent waiver. The dependency state must be re-derived whenever that
lockfile changes.
