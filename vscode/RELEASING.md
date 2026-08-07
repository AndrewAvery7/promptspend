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

### Minting the Marketplace token

Start at **<https://aex.dev.azure.com/me>**.

Not `dev.azure.com/_usersSettings/tokens`, which **404s** — that path needs an
organization segment. And not `azure.microsoft.com/devops`, which serves the
marketing page to a signed-out browser instead of signing you in. `aex.../me` is
the account page and forces the sign-in flow.

1. Sign in as the Microsoft account that owns the `promptspend` publisher.
2. **User settings** (the person icon, top right) → **Personal Access Tokens** →
   **New Token**.
3. **Organization: `All accessible organizations`.** This is the one that gets
   picked wrong, and a single-organization token fails later with an error that
   does not mention the organization.
4. **Scopes** → **Show all scopes** at the bottom of the panel → **Marketplace** →
   tick **Manage**.
5. **Create**, then copy it immediately. Azure shows the value once.

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
