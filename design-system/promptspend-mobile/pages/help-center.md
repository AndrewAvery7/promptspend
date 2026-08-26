# Help Center page requirements

Status: approved for the next private QA build on 2026-08-26.

This page inherits every rule in `../MASTER.md`.

## Purpose

Help & FAQs is the durable operating reference for PromptSpend. It complements the six-step Guided Tour and
the conceptual lessons without duplicating either one.

- Guided Tour: brief orientation and spatial discovery.
- Help & FAQs: searchable step-by-step instructions and troubleshooting.
- Lessons and Token Lab: conceptual AI-cost education.
- Support: escalation after in-app guidance does not resolve the problem.

## Placement and navigation

- Keep the five-tab navigation. Help & FAQs is the first major section inside Learn, not a sixth tab.
- Global Search indexes every help question, answer, and keyword.
- Home, Estimate, Compare, and Data & Alerts provide a contextual “How to use this page” link.
- Search and contextual links deep-link to the matching expanded answer.
- Answer actions navigate to the relevant native page; they do not imitate controls that remain elsewhere.

## Interaction

- Default to the Getting started category rather than rendering an unstructured wall of answers.
- Search updates while typing and searches all categories.
- A no-results state suggests broader terms and provides a route back to browsing.
- Category choices wrap on compact screens; do not use a horizontally clipped carousel.
- Questions use accessible expanded/collapsed state and only one answer is open at a time.
- Every answer remains useful offline and avoids hard-coded prices, catalog totals, or other rapidly changing data.

## Accessibility and responsive gates

- Minimum touch target: 44pt on iOS and 48dp on Android.
- Headings, questions, status, and search results must have a logical VoiceOver and TalkBack order.
- Support Dynamic Type and Android font scaling without fixed-height text containers.
- Verify 320dp, 360dp, 375pt, tablet, landscape, and screen-zoom layouts.
- Use text and icons in addition to color for selection and disclosure state.
- Respect light, dark, accent, and canvas themes from the master system.

## Privacy and maintenance

- Help search is local and requires no analytics, account, or network request.
- Raw prompt text is never indexed by Help search.
- Alert privacy copy must truthfully distinguish optional email data from no tracking and on-device prompt text.
- Content is a typed registry shared by Help and global Search so the two surfaces cannot contradict one another.
- Tests enforce unique IDs, category coverage, natural-language retrieval, valid in-app destinations, and minimum
  answer substance.
