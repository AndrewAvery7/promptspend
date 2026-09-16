# Product Hunt launch copy — PromptSpend

Everything below is ready to paste in. Word/character counts are checked against
Product Hunt's limits.

## Tagline (41 / 60 chars)

    The LLM price list that shows its sources

## Description (493 / 500 chars)

    Every LLM cost calculator goes stale the moment a vendor reprices. PromptSpend
    re-checks its catalog every morning against vendor pages, flags disagreements
    instead of averaging over them, and shows the source URL and confirmation
    date on every number. Paste a real prompt or set your scale, compare up to
    four models side by side, and see the monthly cost — plus the two numbers
    every calculator gets wrong: compounding chat history and hidden reasoning
    tokens. Free, no account, open source.

## Tags (pick up to 3)

    Developer Tools · API · Artificial Intelligence

## Gallery images (5, all 1270×760, real captures — see assets/ph-gallery/)

1. `1-estimate.png` — the Estimate view: monthly cost across 4 models, the
   freshness ticker, and the value-map teaser
2. `2-compare.png` — the Compare view: the 218× price spread and the value map
3. `3-data.png` — Data & Alerts: pipeline health, last-checked date, the
   changelog feed
4. `4-learn.png` — Learn: the interactive tokenizer lesson
5. `5-receipt.png` — the AI Cost Receipt page, the newest feature

## Thumbnail (240×240, 6 KB — assets/ph-thumbnail.png)

The site's own square app icon, downscaled. Recognizable at small size, no text
to go illegible.

## Maker's first comment

    Hey Product Hunt 👋

    I built PromptSpend because every LLM pricing calculator I found was a
    snapshot — someone hard-coded a dozen prices, and within a few months the
    whole thing was quietly wrong.

    So the pricing pipeline *is* the product here. Every morning it re-fetches
    from independent sources, cross-checks them, and either commits a clean
    update or opens a pull request for a human to look at. Every number on the
    site carries the source it came from and the date it was last confirmed —
    disagreements get flagged, not averaged away.

    Beyond the calculator: a public API, an MCP server for coding agents, a
    VS Code extension that prices the model on the line of code that calls it,
    and a "receipt" you can paste into any AI conversation to audit what it
    actually cost.

    Would love feedback — especially if you've been burned by a model price
    that moved without you noticing.

## Notes for submission

- Launch from your personal Product Hunt account, not a company one.
- Schedule for 00:01 Pacific on a Tuesday or Wednesday, at least a week clear
  of any Hacker News post, per the task's own guidance.
- Post the maker comment the moment the listing goes live, then stay in the
  comments for the day — ask for feedback, never for upvotes.
