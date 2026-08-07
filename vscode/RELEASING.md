# Releasing the extension

The extension ships to **two** registries from **one** build: the VS Code
Marketplace (where VS Code looks) and
[Open VSX](https://open-vsx.org/extension/promptspend/promptspend) (where Cursor,
Windsurf and VSCodium look). Both get the same `.vsix`.

Publishing is manual and owner-driven on purpose — a marketplace-visible action
stays behind a human. Everything below runs from `vscode/`.

## Once per token

Both CLIs read their token from the environment, so nothing secret reaches a
command line or shell history.

**PowerShell** — the shell this is normally run from. Note there is no `export`,
and no `&&` between commands; Windows PowerShell 5.1 rejects `&&` outright with
`The token '&&' is not a valid statement separator in this version`:

```powershell
$env:VSCE_PAT = 'paste-the-azure-devops-token'
$env:OVSX_PAT = 'paste-the-open-vsx-token'
```

bash or zsh:

```bash
export VSCE_PAT=...
export OVSX_PAT=...
```

These last for the session only. Reopening the terminal means setting them again.

| Registry            | Variable   | Where to mint                               |
| ------------------- | ---------- | ------------------------------------------- |
| VS Code Marketplace | `VSCE_PAT` | See below — the obvious URL 404s            |
| Open VSX            | `OVSX_PAT` | <https://open-vsx.org/user-settings/tokens> |

### There is no `VSCE_PAT` on this account, and that is fine

**Personal Access Tokens live under an Azure DevOps organization.** This account
has none — <https://aex.dev.azure.com/me> shows a "Create new organization"
prompt rather than a settings menu, and `dev.azure.com/_usersSettings/tokens`
404s because that path needs an organization segment it cannot supply.

Creating an organization purely to mint a token would work, but it is a whole
Azure DevOps tenant standing up to serve one string. Two better routes, in the
order worth trying:

**1. Entra ID, no token at all.**

```
npm run publish:vsce:entra
```

Same publish, `--azure-credential` instead of a PAT. It signs the Marketplace
identity in through the browser. Nothing to store, nothing to expire, nothing to
rotate — and no `VSCE_PAT` in the environment.

**2. Upload the artifact by hand.**

<https://marketplace.visualstudio.com/manage/publishers/promptspend> → the
extension row → **⋯** → **Update** → drop in `vscode/dist/promptspend.vsix`.

The slowest of the three but the one with no auth plumbing at all: the browser
session is already the publisher. Useful as a fallback when a release has to go
out and the CLI is arguing.

**If a PAT is ever wanted anyway**, create an organization at
<https://aex.dev.azure.com/me>, then **User settings** (person icon, top right) →
**Personal Access Tokens** → **New Token** → **Organization: `All accessible
organizations`** → **Scopes** → **Show all scopes** → **Marketplace** →
**Manage**. Copy it at once; Azure shows it only the once.

## The release

```
npm run release
```

That is all of it. The script chains `verify` → `package` → `publish:vsce` →
`publish:ovsx`. The `&&` inside it is safe because npm runs scripts through
`cmd.exe`, not PowerShell — which is exactly why the chaining lives in
`package.json` rather than in something anyone types.

If one registry succeeds and the other fails, resume without rebuilding:

```
npm run publish:vsce
```

```
npm run publish:ovsx
```

Both publish the existing `dist/promptspend.vsix` and are independently
re-runnable.

## Why the artifact, not the directory

`ovsx publish` with no file argument re-packages the working tree. The bytes
shipped would then not be the bytes `verify` just checked, and the two registries
could drift apart. Both publish scripts name `dist/promptspend.vsix` explicitly,
so one verified artifact goes to both places.

## The version has to move

Neither registry accepts the same version twice. A release that forgets the bump
fails at upload with a message about an existing version — bump
`package.json` (and `package-lock.json`) first.

## After publishing

Confirm from the registry rather than trusting the CLI's exit code:

```
curl -s https://open-vsx.org/api/promptspend/promptspend
```

Open VSX can lag a minute or two. Its `verified` flag updates on its own
schedule — after the namespace claim was granted it read `false` for about an
hour before flipping with no republish. Do not chase it with an extra release.

## The namespace is restricted

Since 2026-08-06 the Open VSX namespace `promptspend` is owned and verified
([EclipseFdn/open-vsx.org#12355](https://github.com/EclipseFdn/open-vsx.org/issues/12355)),
so only **AndrewAvery7** can publish into it. A token minted by any other account
gets a 403 where it would once have succeeded.

Handing releases to someone else does not mean sharing the token — add them as a
namespace member at <https://open-vsx.org/user-settings/namespaces>.
