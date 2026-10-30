---
slug: about
title: About PromptSpend and how prices are checked | PromptSpend
description: Who runs PromptSpend, where every price comes from, how it is re-checked each morning, and what happens when two sources disagree.
heading: About PromptSpend
updated: 2026-10-30
---

PromptSpend is a free calculator and reference for what large language model (LLM) APIs cost. It is open source under the MIT license, and the whole pipeline that gathers the prices is public on [GitHub](https://github.com/AndrewAvery7/promptspend).

## Who runs it

PromptSpend is built and run by Andrew Avery. Andrew spent more than fifteen years in operations and program leadership, most recently as a senior manager at NRG Energy, and before that in cost and process programs at Direct Energy and in management consulting. Since April 2026 he has worked full time on applied AI, including the University of Texas at Austin McCombs post-graduate program in AI and machine learning. The site is published by Crestwood Holdings. More about Andrew is on [LinkedIn](https://www.linkedin.com/in/andrewavery) and at [averyresume.com](https://averyresume.com).

## Where the prices come from

Every price names its source, the page that was read, and the date it was last confirmed. The sources are ranked, and a lower source can never overrule a higher one:

1. **Hand-verified rates**, read from the vendor's own pricing page. These win over everything else.
2. **The LiteLLM community price list**, used for models a vendor does not list on a page we can read. Those rows stay labeled as feed-sourced.
3. **OpenRouter**, used only as a cross-check. It can raise a flag but never changes a number, because a reseller's price can legitimately differ from the vendor's list price.

## How it is checked

A scheduled job re-reads the sources every morning. If a source goes missing, or the catalog would suddenly shrink, the job publishes nothing and fails loudly rather than shipping a partial list. A separate daily check re-reads each vendor's pricing page. When two sources disagree, the price is marked as disputed on the site rather than quietly resolved.

## What the comparisons assume

Monthly bills on the model and comparison pages use the same three ordinary workloads everywhere: a support chatbot, a document summarizer and a coding agent, each with its token counts written out so the arithmetic can be checked. No caching and no batch discount are assumed unless a page says so. Benchmark figures, where shown, name the independent leaderboard they came from and the date they were read.

## Corrections

Mistakes are logged in public on the [corrections page](/corrections/), and every price correction is labeled apart from real vendor price changes on the [price changes page](/changes/) and in the [feed](/feed.xml).

## Contact

Email [info@promptspend.com](mailto:info@promptspend.com). To report a wrong price, include the model and the vendor page that shows the right one.
