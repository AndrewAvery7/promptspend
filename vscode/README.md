# PromptSpend for VS Code

**What the model on this line costs, and when that price was last confirmed.**

A linter for model choice, not a calculator in a sidebar. Write a model id and the
price appears beside it, carrying the date it was verified and the vendor page it
came from.

```python
response = client.messages.create(
    model="claude-sonnet-5",   # $3 / $15 per M · max out $0.061
    max_tokens=4096,
)
```

![Three Python calls, each annotated at the end of its line. claude-sonnet-5 with max_tokens=4096 reads $3 / $15 per M · max out $0.061; gpt-5-mini reads $0.25 / $2 per M and no ceiling, because that call sets no cap of its own; a legacy claude-opus-4-5 carries a diagnostic underline.](https://raw.githubusercontent.com/AndrewAvery7/promptspend/main/assets/promo-frames/04-editor.png)

The middle call is the one worth looking at: no `max_tokens`, so no ceiling is
quoted. A cap belonging to the call above it is not a cap on this one.

---

## Install

```
code --install-extension promptspend.promptspend
```

Or search **PromptSpend** in the Extensions pane (`Ctrl`/`Cmd`+`Shift`+`X`).

Cursor, Windsurf and VSCodium install it from
[Open VSX](https://open-vsx.org/extension/promptspend/promptspend), which carries the
same build.

Nothing to configure, and no account. The first annotations appear a moment after
the window opens, once the catalog has been fetched.

---

## What it does

**Prices where the decision is made.** Every model id in your code is annotated
with its input and output rates. Hover for the full rate card: cached-input and
cache-write rates, the context window, the output ceiling, long-context tiers,
batch discounts, and a link to the vendor page the number was read from.

**The output ceiling in money.** A `max_tokens` near a model id becomes
`max out $0.061` — what the response alone costs if it runs to the cap, every
call. A rate is abstract; that number is not. It says _max out_ every time,
because the input side is unknown at that point in the file and is often the
larger half.

**Impossible requests are named, not priced.** A cap above what the model can
emit shows `⚠ above model max` and no figure. That request gets rejected or
truncated — it does not cost more — so quoting a price for it would be quoting
money nobody will ever be billed.

**Model-choice diagnostics.** Deprecated, legacy, disputed and stale models are
flagged in the Problems panel. Optionally (`promptspend.diagnostics: "all"`) so
is a cheaper sibling that clears the same capability estimate. Everything is
_Information_ severity, never a warning: none of these are mistakes, and a
squiggle that calls a defensible engineering decision wrong is how a linter gets
uninstalled.

**Cost a prompt.** Select some text, right-click → **Estimate selection**. It
prices the selection against the models already named in that file, cheapest
first, saying for each whether the token count was measured exactly or estimated
from a calibrated ratio.

**See the whole repository.** The **LLM models in use** view in the Explorer
lists every model the codebase calls, most expensive first, with the files and
lines that call it.

---

## Where the prices come from

The catalog is fetched from
[`promptspend.com/data/pricing.json`](https://promptspend.com/data/pricing.json),
the artifact a GitHub Action re-verifies every morning against vendor pricing
pages, a community catalog and an independent cross-check.

There is deliberately **no bundled fallback**. An extension sitting in the
Marketplace for three months with prices baked into it would be the purest
possible version of the problem this project exists to prevent, so if the catalog
cannot be reached the extension says so and shows nothing rather than showing a
number it cannot stand behind. Cached prices are used for up to a day when a
refresh fails; past that they are withheld.

The status bar shows the date the catalog was generated, always. That is what
makes the six-hour refresh interval honest rather than lax — you can see how
current the data is without taking anyone's word for it.

---

## Privacy

Nothing is sent anywhere. The extension makes exactly one network request — a
`GET` for the public pricing catalog — and reads your files only in memory to
find model ids. No telemetry, no account, no prompt text leaves your machine.
Token counting runs locally, using the model's own tokenizer where one can be
run and a clearly labelled ratio where it cannot.

---

## Settings

| Setting                        | Default             |                                                                               |
| ------------------------------ | ------------------- | ----------------------------------------------------------------------------- |
| `promptspend.inlineDetail`     | `compact`           | `compact`, `full` (adds the confirmation date), or `off` (hovers still work)  |
| `promptspend.diagnostics`      | `facts`             | `facts` (what the catalog knows), `all` (also suggests cheaper models), `off` |
| `promptspend.languages`        | 20 source languages | Which languages to annotate. Markdown and plain text are excluded on purpose  |
| `promptspend.annotateComments` | `false`             | A model named in a comment is being discussed, not called                     |
| `promptspend.showStatusBar`    | `true`              | The catalog's sync date                                                       |

## Commands

|                                     |                                                               |
| ----------------------------------- | ------------------------------------------------------------- |
| **PromptSpend: Estimate selection** | Cost the selected text against this file's models             |
| **PromptSpend: Scan workspace**     | Build the repository-wide model inventory                     |
| **PromptSpend: Refresh prices now** | Refetch the catalog without waiting for the next interval     |
| **PromptSpend: Show log**           | What the extension is doing, and why it is showing what it is |

---

## Things it deliberately does not do

- **Guess.** A rate the provider does not publish is absent, never averaged or
  defaulted. A model with no capability estimate is never offered as a cheaper
  alternative, because "might be worse" is not an answer to "cheaper and as good".
- **Price a dated snapshot id as its undated cousin.** `claude-sonnet-5-20260101`
  is not in the catalog, so it gets no annotation rather than an invented one.
- **Recommend.** The capability estimate behind the cheaper-model suggestion is
  illustrative, not a benchmark, so the wording is always _worth testing_ rather
  than _use this instead_.

## Related

- [promptspend.com](https://promptspend.com) — the estimator, the value map and the pipeline's provenance
- [`@promptspend/mcp`](https://www.npmjs.com/package/@promptspend/mcp) — the same catalog for coding agents
- [promptspend.dev](https://promptspend.dev) — a keyless JSON API over the catalog

## Licence

MIT — see
[LICENSE](https://github.com/AndrewAvery7/promptspend/blob/main/LICENSE).
Source at
[github.com/AndrewAvery7/promptspend](https://github.com/AndrewAvery7/promptspend),
in `vscode/`.
