---
slug: corrections
title: Corrections log | PromptSpend
description: Every mistake PromptSpend has found in its own data or publishing, what went wrong, and what now stops it happening again.
heading: Corrections log
updated: 2026-10-30
---

A price site is only useful if its mistakes are visible. This page lists the faults PromptSpend has found in its own data and publishing, newest first. Individual price corrections, where we read a better page and our number changed although the vendor's did not, are listed one by one on the [price changes page](/changes/) and labeled as corrections in the [feed](/feed.xml), so they are never confused with a vendor repricing.

To report a mistake, email [info@promptspend.com](mailto:info@promptspend.com) with the model and the vendor page that shows the right figure.

## October 2026: benchmark figures caught before publishing

**What happened.** The first draft of the benchmark figures for the featured comparison pages included four scores that the cited leaderboard did not show at the stated setting: two were too high and two had no matching row.

**What changed.** An independent re-check of every figure against the live leaderboard now runs before benchmark data ships. The two wrong scores were corrected and the two unsupported rows were removed.

## August 2026: the live site could fall a day behind

**What happened.** The morning price sync made its own update to the published branch, but an update made with a job's own credentials does not start a new deploy, by GitHub's design. The catalog was current in the repository and a day old on the live site, while the sync reported success.

**What changed.** The sync now starts its own deploy after any update it makes, and a monitor checks the file a visitor actually receives, not the copy in the repository.

## August 2026: a standing disagreement reopened every morning

**What happened.** A disagreement between two sources was recognized by its rendered sentence rather than by its cause, so it looked new every day and reopened a review instead of raising its flag once.

**What changed.** Disagreements are now recognized by a stable cause, not by the numbers in the sentence.

## August 2026: the sync stopped publishing without saying so

**What happened.** A permissions change left the morning sync unable to open its pull request, and its run summary read like a normal day with no changes. The site served a day-old catalog.

**What changed.** A freshness monitor now reads the published file and fails when it is stale.

## August 2026: change dates that could not be true

**What happened.** The catalog stamped all of its rows as changed on the same morning, and twelve were dated a day after their last verification, which is impossible.

**What changed.** The invented dates were removed rather than backfilled, and the build now fails on that contradiction.
