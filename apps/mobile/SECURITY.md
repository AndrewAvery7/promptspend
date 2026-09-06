# Mobile dependency security notes

Last reviewed: September 1, 2026

## Dated mobile dependency audit

The September 1 read-only audit of the updated mobile lockfile used
`npm audit --json --package-lock-only --ignore-scripts`. This candidate uses
Expo 57.0.18, Expo Constants 57.0.16, and Expo Font 57.0.2; the official Expo
dependency check reports the SDK 57 packages are compatible, and Expo Doctor
passes all 21 checks. The registry reported **15 moderate, 0 high, and 0
critical findings**. npm expands two leaf advisories through affected parent
packages, so the total is package-graph propagation rather than fifteen
independent flaws:

- `uuid@7.0.3`: missing destination-buffer bounds checks in specific v3/v5/v6
  API use ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)).
  It is pulled into Expo configuration/build tooling through
  `expo-sharing > @expo/config-plugins > xcode`.
- `decode-uri-component<=0.4.2`: denial of service from pathologically malformed
  percent-encoded input ([GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)).
  It is pulled through `expo-router > query-string`.

The prior `image-size` finding is no longer present in this audit. Neither the
older 16-finding note nor the external review's 25-finding total describes this
candidate. Counts and reachability must be re-derived after dependency changes
and before the next beta/release build; this is not a permanent waiver.

The current mobile application does not accept user images or call the affected
`uuid` buffer APIs, and Metro and the Expo configuration toolchain are not
end-user features. PromptSpend now declares Universal Links/App Links only for
the bounded `/estimate` scenario contract. Expo Router still participates in
navigation, so malformed link/path input, unverified-domain fallback, and
installed/uninstalled behavior remain in release regression coverage. Shared
URLs contain derived counts and assumptions, never pasted prompt or response
text. These facts limit exposure; they do not make the dependency findings
disappear.

`react-native-webview` 13.16.1 and `expo-crypto` 57.0.2 do not appear as
vulnerable packages in the current audit. The
Alert Center WebView is ephemeral, loads one HTTPS origin, blocks mixed content
and unapproved top-level navigation, and receives no email address, model
selection, scenario data, or prompt text.

## Why `npm audit fix --force` is prohibited

npm's audit fix proposal includes an incompatible Expo SDK 46 downgrade. That version
does not match the SDK 57 project and would replace the verified platform
foundation with an unsupported dependency combination.

Do not run `npm audit fix --force`.

## Required controls

- Keep Expo and React Native on versions accepted by `npx expo install --check` and `npx expo-doctor`.
- Do not feed untrusted or user-supplied images into the local Metro/build asset pipeline.
- Use only reviewed repository assets during development and CI.
- Re-run the full npm audit at each Expo patch update and before every beta/release build.
- Upgrade when Expo publishes a compatible dependency chain containing fixed leaf packages.
- Reassess immediately if the app later adds image import, document upload, or any server-side bundling of user content.
- Block release for any critical advisory or any advisory shown to be reachable in shipped runtime behavior.

This is a dated triage record for the September 1 corrective-batch lockfile, not
a permanent waiver. The dependency state must be re-derived whenever that
lockfile changes.
