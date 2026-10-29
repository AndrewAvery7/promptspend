# Over-the-air updates for the PromptSpend app

The app can receive new JavaScript and assets without a store release. Updates
come from PromptSpend's own server, not Expo's hosted service, and the app runs
only updates signed with PromptSpend's key.

| Piece                   | Where                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Update server           | `updates/`, the Cloudflare Worker `promptspend-updates` at `https://updates.promptspend.dev` |
| Storage                 | R2 bucket `promptspend-updates`                                                              |
| App configuration       | `apps/mobile/app.json` → `runtimeVersion`, `updates`                                         |
| Signing certificate     | `apps/mobile/certs/certificate.pem` (in the repo; public)                                    |
| Signing private key     | `%USERPROFILE%\.promptspend\updates-signing\private-key.pem` (never in the repo)             |
| Publish / rollback tool | `apps/mobile/scripts/publish-update.mjs`                                                     |
| Protocol                | [Expo Updates v1](https://docs.expo.dev/technical-specs/expo-updates-1/)                     |

## What needs a store release, and what does not

| Change                                                          | How it reaches phones             |
| --------------------------------------------------------------- | --------------------------------- |
| Prices, models, retirements, names, flags                       | Nothing. The live catalog does it |
| App screens, wording, logic, bug fixes (JavaScript/TypeScript)  | Over-the-air update               |
| Images and fonts the app bundles                                | Over-the-air update               |
| Adding or upgrading a native package, Expo SDK upgrade          | Store release                     |
| `app.json` changes (icons, permissions, plugins, links, splash) | Store release                     |
| Anything touching `certs/certificate.pem` or the signing key    | Store release                     |

When unsure, it is a store release. An update that needs native code the build
does not have crashes on launch. expo-updates then falls back to the build's
own code, but that is a recovery, not a plan.

## Runtime versions: which phones get an update

`runtimeVersion` uses the `appVersion` policy, so the runtime version **is** the
`version` in `app.json`. An update published from a checkout at version 0.2.0
reaches only store builds of 0.2.0.

That makes one rule non-negotiable: **every store release bumps `version`**.
It already does, because the stores require it. If native code changed without
a version bump, an update could land on a build it does not fit.

The first release that contains expo-updates is the first that can receive
updates. Builds made before it (0.1.0, 0.1.1) never ask.

### The Expo SDK 58 jump (0.2.0)

`main` moved from Expo SDK 57 (React Native 0.86) to SDK 58 (React Native 0.88)
at app version **0.2.0**, so it can only reach store builds of 0.2.0. Phones
running 0.1.x carry SDK 57 native code and a different runtime version: they
never receive 0.2.0 code, and must never be sent it. Two consequences:

- Until the 0.2.0 store builds are live and installed, an update published from
  `main` reaches nobody. Do not treat it as a way to ship the SDK 58 work.
- A JavaScript fix that 0.1.2 phones still need is published from a checkout of
  the last SDK 57 commit (`a692ee9`, the tip of `main` before the upgrade) with
  the fix applied there, never from `main`. `app.json` there says 0.1.2, so the
  script targets the right runtime. Stop doing this once 0.1.2 is no longer in
  use.

Because the SDK changed, the first update published after the 0.2.0 store
builds ship doubles as the check that code signing still works on SDK 58:
run `node scripts/publish-update.mjs --verify` and confirm a phone running the
0.2.0 build accepts it.

## Publish an update

From a clean checkout of `main` that has the fix merged:

```powershell
Set-Location "C:\Users\andre\OneDrive\Documents\Claude\Projects\PromptSpend\promptspend\apps\mobile"
npm.cmd ci
Set-Location ..\..\updates
npm.cmd ci
Set-Location ..\apps\mobile
node scripts/publish-update.mjs --dry-run --message "What changed, in one line"
node scripts/publish-update.mjs --message "What changed, in one line"
```

The script:

1. Exports the bundle.
2. Uploads each file under its SHA-256.
3. Signs the manifest and checks that signature against `certs/certificate.pem` before publishing.
4. Fetches the result back from the live server and verifies it as a phone would.

`--platform ios` or `--platform android` limits it to one platform.

Phones download the update in the background the next time the app opens, and
run it the time after that. Nothing asks the user.

Needs `wrangler` logged in with access to the `promptspend-updates` R2 bucket
(`npx wrangler whoami` from `updates/`). Each run keeps a copy under
`history/<version>/<platform>/` in R2, with the commit and message.

## Roll back

```powershell
node scripts/publish-update.mjs --rollback --message "Why"
```

This publishes a signed `rollBackToEmbedded` directive. On their next launch,
phones on that version return to the code their store build shipped with. To
recover, fix the problem and publish a normal update, which replaces the
directive.

`node scripts/publish-update.mjs --verify` checks what is live without changing
anything.

## The signing key

- The private key signs every update. With it, anyone could run code on every
  phone that has the app. It lives only at
  `%USERPROFILE%\.promptspend\updates-signing\private-key.pem`.
- **Back it up to the password manager.** If it is lost, no further updates can
  be published to existing builds. Publishing resumes only from a new store
  release carrying a new certificate.
- If it leaks: generate a new pair, commit the new certificate, bump `version`
  and ship a store release. Then publish a rollback to the old versions if
  anything suspicious was published.
- The certificate is valid for 10 years (to 2036). Builds carrying an expired
  certificate stop accepting updates. They keep working, but on the code they
  shipped with.

Regenerating (only for rotation):

```powershell
Set-Location "C:\Users\andre\OneDrive\Documents\Claude\Projects\PromptSpend\promptspend\apps\mobile"
npx.cmd expo-updates codesigning:generate --key-output-directory "$env:USERPROFILE\.promptspend\updates-signing" --certificate-output-directory certs --certificate-validity-duration-years 10 --certificate-common-name "Crestwood Holdings Management LLC - PromptSpend updates"
```

## Privacy

On every launch, expo-updates sends a random per-install ID (`EAS-Client-ID`).
If an earlier update failed to launch, it also sends that error message. The
Worker never reads either. Its `observability` and `logpush` are off in
`updates/wrangler.jsonc`, so no request log exists, and the privacy policy says
so. **Do not turn logging on without updating the privacy policy and the
Apple / Google privacy answers first**; see `STORE_RELEASE_PACKAGE.md`.
`apps/mobile/scripts/check-release.mjs` fails the release check if the app
points anywhere but `updates.promptspend.dev`, or if signing is removed.

## Deploying the server

The Worker is deployed by hand, like the other Workers in this repo:

```powershell
Set-Location "C:\Users\andre\OneDrive\Documents\Claude\Projects\PromptSpend\promptspend\updates"
npm.cmd ci
npm.cmd run verify
npx.cmd wrangler deploy
```

The R2 bucket was created once with `npx wrangler r2 bucket create
promptspend-updates`. Deploying the Worker changes nothing a phone runs. Only
a publish does that.
