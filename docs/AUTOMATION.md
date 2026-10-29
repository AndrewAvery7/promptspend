# Automation for working on this project

What runs by itself, what can be asked for by name, and what to do when one of
them gets in the way. Everything here exists because the same manual step or the
same mistake kept costing a gate run; none of it changes what the site does.

The Claude Code parts live in `.claude/` and are committed, so every checkout
and every worktree has them. Personal state (`settings.local.json`,
`launch.json`, `worktrees/`) is ignored.

## Hooks: automatic, while Claude works

| Hook                                        | When                     | What it does                                                                                                                                 |
| ------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/hooks/format-edited-file.mjs`      | After any Edit or Write  | Runs Prettier on that one file. `npm run verify` fails on a file Prettier would rewrite, so the gate can no longer fail on formatting.       |
| `.claude/hooks/protect-generated-files.mjs` | Before any Edit or Write | Refuses a hand edit to a file a script owns, and says what to do instead. Bash is not covered: the scripts that write these files run there. |

The protected files: `data/published-pages.json` (the page ledger: hand-pruning
it once made dozens of comparison URLs 404), `public/data/pricing.json`,
`public/data/sync-status.json`, `public/data/vendor-check.json`,
`public/data/free-tier-check.json` and `docs/pricing-changelog.md`.

The formatter never blocks: a file Prettier cannot parse is reported, not
refused. To make a deliberate hand edit to a protected file, set
`PROMPTSPEND_ALLOW_GENERATED_EDIT=1` for the session. To turn a hook off, delete
its entry from `.claude/settings.json`.

## `/ship`: the release chain in one command

`.claude/skills/ship/SKILL.md`. Runs the local gate, opens the pull request,
**proves a full `CI` run exists for the head commit** (a pull request here can
look green when only CodeQL ran), squash-merges once it is green, waits for the
deploy, and checks the live site for the specific thing the change did. It also
covers the Workers and the tracker. Say "ship it" or type `/ship`.

## Reviewers: ask for them by name

Both are read-only. They report; they never edit.

- **`source-fact-checker`**: re-reads every sourced fact or price in a data file
  (`data/free-tiers.json`, `data/pricing-overrides.json`) against its live
  source and tries to prove it wrong. The free-tier pages shipped after one of
  these found 17 real errors in 99 facts. Run it before any data-heavy release.
- **`privacy-claims-auditor`**: compares every public privacy promise with what
  the code, the configuration and the stores' declarations actually do. Run it
  before any release that changes tracking, cookies, accounts, sponsors,
  logging or storage. Its first run found eleven claims that were no longer
  true.

## `npm run check:test-badge -- --fix`

The README badge and `docs/TESTING.md` publish exact test counts, and the same
five figures went stale every time a test was added. `--fix` rewrites the
figures that are only numbers: the badge, its alt text, the totals, each
suite's count and each per-file row's count. It cannot invent what a new test
file guards, so a missing table row is still reported for a person to write.

## Deploying the API and alerts Workers on merge

`.github/workflows/deploy-services.yml`. The Pages deploy publishes the website
and touches neither Worker, so a merge that changed `api/` or `worker/` left the
live service on the old version until somebody deployed by hand.

It deploys only the Worker whose code changed, after the same `npm run verify`
the package's CI job runs, and confirms the live service answers. It does
**not** run database migrations: if a push changes `worker/migrations/`, the
alerts job fails on purpose and says to run `npm run release` yourself.

### One-time setup (needs the account owner)

Without these two secrets the workflow still runs, prints a warning naming the
manual command, and succeeds, so a missing secret never turns a merge red.

1. In the Cloudflare dashboard open **My Profile → API Tokens → Create Token**
   and start from the **Edit Cloudflare Workers** template. Limit it to the one
   account that holds the Workers. Copy the token once; Cloudflare shows it a
   single time.
2. On the Workers overview page copy the **Account ID**.
3. In GitHub open the repository's **Settings → Secrets and variables →
   Actions** and add two repository secrets: `CLOUDFLARE_API_TOKEN` (the token)
   and `CLOUDFLARE_ACCOUNT_ID` (the ID).
4. Open **Actions → Deploy the API and alerts Workers → Run workflow** once to
   confirm it deploys both and the final "answering" steps pass.

Never paste the token into a chat or a file in the repository.

## The weekly watch on deferred additions

`data/later-additions.json` lists models and labs that have a vendor price page but are not in the catalog because the automated price feed does not carry them yet. `.github/workflows/watch-later-additions.yml` reads the feed every Monday and opens one issue, "Later additions now in the price feed", the week any of them appears. It adds nothing itself, and the issue closes itself once everything on it has been added. To put something on the list, add an item with a feed-key pattern anchored on the vendor's own prefix, so a copy hosted by a cloud never counts.

## The daily shut-down check

A vendor's pricing table can keep printing a rate long after the model behind it is gone, so the daily vendor-page check, which confirms prices, cannot see a shutdown. On 2026-10-29 o1, o1-pro, o3-mini and o4-mini had been shut down for six days, and Gemini 3.1 Flash Lite Preview for five months, while PromptSpend still showed all of them as current. `scripts/check-shutdowns.ts` runs every morning before the sync. It reads the deprecation pages of OpenAI, Anthropic, Google, Cohere and Mistral, which are plain tables, so no model or key is involved, and writes `public/data/shutdown-check.json`. The sync then raises a `vendor-shutdown` review flag on any live model whose shutdown date has passed, and the usual rolling issue says so. Only exact dates count ("Not sooner than…" never does). OpenAI's dated snapshots are not matched to their undated alias, because `gpt-4o-2024-05-13` can be shut down while `gpt-4o` lives on. The check never archives anything: the fix stays a deliberate `status: "deprecated"` override with a `$note` quoting the page, and once that is made the flag stops. Scheduled shutdowns are listed in the report too, so they can be seen coming. Google's page must be requested with `accept-language: en`; without it Google serves a randomly chosen machine translation whose headers the reader cannot find. Mistral's page renders its header and its rows as two separate tables, writes US dates with deprecation and retirement in one cell, and uses dated API ids the catalogue does not, so it is matched on the display name ("Mistral Medium 3"), with the version required whenever the page repeats a name ("Codestral" 25.01 and 24.05). Not covered, as of 2026-10-29: xAI (its retirement notices are one-off migration pages without a date per model), Alibaba (a policy page, no per-model dates), Amazon Bedrock (its lifecycle table is drawn in the browser), and DeepSeek, Moonshot, Z.ai, MiniMax, Xiaomi, Inception, Meta and Microsoft (no deprecation table published). Their models still rely on the vendor-page price check and the stale-row rule.

## The weekly coverage-gap check

The capture rules in `data/models-allowlist.json` are patterns, and a pattern that is too narrow fails silently. `.github/workflows/watch-coverage-gaps.yml` runs `scripts/watch-coverage-gaps.ts` every Monday: it compares the catalog with [Model Price Watch](https://modelpricewatch.com)'s public model list and opens one issue, "Coverage gaps: models the capture rules miss", naming each model the price feed already carries on its maker's own platform (learned from the rows the rules already capture, so Amazon's Bedrock copy of Claude never counts) that no rule picks up. The other list supplies names only: the prices in the issue are the feed's, and nothing is added. To act on a row, widen its family in the allowlist and the next daily sync adds it, flagged for review; to leave one out on purpose, add it with a reason to `data/coverage-ignore.json`. The issue closes itself once nothing is left.

## Formatting and screenshots

`.playwright-mcp/` (screenshots and page snapshots from the browser tools) is
ignored by both git and Prettier. It twice failed a local format gate and never
mattered to CI.
