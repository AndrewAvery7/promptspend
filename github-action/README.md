# PromptSpend price check

A GitHub Action that fails the build when an LLM your code calls **changes
price** or **is retired by its vendor**, using the
[PromptSpend](https://promptspend.com) catalog: list prices with a source and a
last-confirmed date on every row, re-checked every morning.

It works like a package lockfile, but for rates. The first run records the rates
in force today for each model your project calls, in `promptspend.lock.json`.
You commit that file. Every run after that compares it with the live catalog
and fails, with the old and new rate, when one moved.

```yaml
# .github/workflows/llm-prices.yml
name: LLM prices
on:
  pull_request:
  schedule:
    - cron: '0 13 * * 1' # Mondays, after the daily price check has run
jobs:
  prices:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: AndrewAvery7/promptspend/github-action@action-v1
```

With no inputs it scans the repository's tracked source files for quoted model
ids (`model="claude-sonnet-5"`), so a word in a comment never counts. Name the
models instead if you prefer:

```yaml
- uses: AndrewAvery7/promptspend/github-action@action-v1
  with:
    models: gpt-5, claude-sonnet-5
```

## Inputs

| Input      | Default                   | What it does                                                                                             |
| ---------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `models`   | _(scan the repository)_   | Model ids to watch, comma- or newline-separated, from [`/v1/models`](https://promptspend.dev/v1/models). |
| `lockfile` | `promptspend.lock.json`   | Where the recorded rates live. Commit it.                                                                |
| `fail-on`  | `change,retired`          | `change` (a recorded rate moved), `retired` (the vendor retired the model), both, or `none` to report.   |
| `update`   | `false`                   | Rewrite the lockfile with today's rates and pass. This is how you accept a price change.                 |
| `api`      | `https://promptspend.dev` | The API origin.                                                                                          |

Outputs: `models`, `changed`, `retired` (comma-separated ids) and
`lockfile-written`. Every run also writes a table to the job summary.

## What it compares, and what it will not do

- **The rates in force today**: input, output, cache read, cache write, the
  batch discount and any long-context tier. A promotional rate counts while it
  runs, so a promotion ending is reported as a change, because it is one to
  your bill.
- **An alias is checked as the model it routes to**, since that is what bills.
- **A model PromptSpend does not list is reported, never priced.** A legacy
  model or a disputed price is a warning, not a failure.
- **No accounts, no key and no data sent**: one read of the public catalog.

To accept a change, run the workflow once with `update: true` (for example with
`workflow_dispatch`) and commit the rewritten lockfile, or delete the lockfile
and let the next run write a fresh one.
