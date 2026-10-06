---
name: ship
description: Ship the current PromptSpend branch end to end - run the local gate, open the pull request, prove the full CI really ran, squash-merge, confirm the deploy, and check the live site. Use when Andrew says "ship it", "finish up", "merge and deploy", or asks for a change to go live. PromptSpend only (AndrewAvery7/promptspend).
---

# Ship a PromptSpend change

Andrew's standing approval (2026-10-06) covers merging and deploying this
project's own work once its gate has genuinely passed. It does not cover
skipping the gate, force-pushing, or any other repository. Merging publishes to
promptspend.com, so say plainly when it has gone live.

Work through these in order. Stop and fix at any failure; never merge red.

## 1. Before pushing

- Be on a feature branch cut from `origin/main`, not on `main`. `git fetch`,
  then confirm `git merge-base --is-ancestor origin/main HEAD`; if main has
  moved, bring the branch up to date first (in a worktree the app made for the
  session, use the `sync_with_base_branch` tool instead of merging by hand).
- `git status` shows only the files this change meant to touch. Never stage
  `referrers-*.json`, `.playwright-mcp/` or anything under `.claude/worktrees/`.
- Run `npm run verify` from the repo root. It is the whole gate for the website
  and it is what CI runs. If the test count moved, run
  `npm run check:test-badge -- --fix` and commit what it rewrites.
- If the change touches `api/`, `worker/`, `mcp/`, `vscode/`, `updates/` or
  `apps/mobile/`, also run that package's own `npm test`: root `verify` does not
  run them (see the memory note "Package verify is not the whole gate").
- If the change touches anything a visitor sees, run `npx playwright test` too,
  and look at the page in a browser at phone and desktop width, light and dark.

## 2. Open the pull request

- Commit with a message that says what changed and why, ending with the
  attribution line the session was given. Push the branch.
- `gh pr create --base main --head <branch> --title "<title>" --body ...`. The
  body says what it adds, how it was checked, and anything Andrew must do
  afterwards; it ends with the attribution line the session was given.
- In the Claude desktop app: `ccd_pr get_status`, `bind_pr` if it is not bound,
  then `set_monitor` with `auto_fix` and `address_comments` true.

## 3. Prove the full CI ran

A pull request here can show green while only CodeQL ran. So:

```bash
sha=$(gh pr view <N> --json headRefOid --jq .headRefOid)
gh api "repos/AndrewAvery7/promptspend/actions/runs?head_sha=$sha" \
  --jq '.workflow_runs[] | [.name,.status,.conclusion] | @tsv'
```

A run named `CI` must be listed. If it is missing, `gh workflow run ci.yml
--ref <branch>` and use that run. Wait for it with `gh run watch <id>
--exit-status` (in the background), then confirm all eight jobs concluded
`success`: verify, mobile, worker, api, mcp, updates, vscode, e2e. Trust `gh`
over the app's status line, which can call a failure "skipped".

## 4. Merge

```bash
gh pr merge <N> --squash --subject "<title> (#<N>)"
git push origin --delete <branch>     # ignore "remote ref does not exist"
```

A squash-merged branch still looks unmerged locally; check with
`gh pr list --head <branch> --state all`, never with `git branch --merged`.

## 5. Confirm the deploy

The merge to `main` starts `deploy.yml`.

```bash
gh run list --branch main --workflow deploy.yml --limit 1
gh run watch <id> --exit-status
```

A green deploy is not proof the site changed. Fetch the live page with a cache
buster (`?x=$(date +%s)`) and look for the specific thing this change did:
the status code, the new text or link, the sitemap entry, the structured data,
a string in the new JavaScript bundle. For a page that should not have changed
(badges on `/models/`, for instance), check that it did not.

## 6. The services, when their code changed

If `api/` or `worker/` changed, they are separate Workers and the website deploy
does not touch them.

- If `.github/workflows/deploy-services.yml` is active (its Cloudflare secrets
  exist), check its run for the merge commit.
- Otherwise `cd api && npm run deploy`, and for the alerts Worker `cd worker &&
npm run deploy`. A new file in `worker/migrations/` means `npm run release`
  instead, which migrates the database first.
- Then fetch the live service and confirm the change (for the API,
  `https://promptspend.dev/openapi.json`).

## 7. Record it and report

- Update the Phase tracker artifact if one exists, and append a dated line to the
  project's Second Brain entry (what shipped, what is live, what is pending).
- Tell Andrew in plain English: what went live, the links to look at, what was
  checked and what was not, and anything left for him. One short recap, not a
  log.
