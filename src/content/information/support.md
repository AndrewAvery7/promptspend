---
slug: support
title: Support | PromptSpend
description: Help with PromptSpend estimates, pricing freshness, private pasted text, sharing, accessibility, alerts, and app troubleshooting.
heading: PromptSpend Support
updated: 2026-08-16
---

PromptSpend helps you estimate, compare, explain, and reduce LLM API cost. The estimates use published prices and the workload assumptions you provide; actual provider bills can vary.

## Contact

For app help, feedback, or feature requests, email [info@promptspend.com](mailto:info@promptspend.com). For a security vulnerability, email [security@promptspend.com](mailto:security@promptspend.com) instead of posting it publicly.

When reporting a problem, include the app version, device model, operating-system version, screen name, what you expected, what happened, and exact reproduction steps. A screenshot is helpful when it does not reveal sensitive information. Do not send private prompts, API keys, credentials, or customer data.

## Pricing will not load

Confirm the device can reach the internet and try again. PromptSpend may use a previously validated catalog for no more than 24 hours when a refresh fails. It will not silently use an older catalog for a new estimate. Current catalog and source-check status are available at [promptspend.com/data/pricing.json](https://promptspend.com/data/pricing.json) and [promptspend.com/data/sync-status.json](https://promptspend.com/data/sync-status.json).

## A token count looks different

Pasted-text counts in the native app are deliberately labelled as estimates until exact tokenizer parity is proven on supported devices. Different model families can tokenize the same text differently, so Compare calculates a workload separately for every selected model. For a known production count, choose Enter tokens and use the provider's billed or tokenizer-reported values.

## Sharing or export does not open

Check that sharing is allowed on the device and that at least one compatible destination is installed. PromptSpend previews the result before sharing. Raw pasted text is excluded. Temporary export files are created only to complete the share operation and are not uploaded by PromptSpend.

## Delete local data

Saved scenarios can be removed from the saved-scenarios sheet. Appearance and onboarding settings remain on the device. To remove all PromptSpend app data, use the operating system's app-storage controls or uninstall the app. PromptSpend has no native app account to delete.

## Alerts

The native app can create, confirm, review, change, and delete an optional email price-alert subscription. Request a six-digit management code in Data & Alerts, enter the code from your email, and update the cadence or followed models directly in the app. The code expires after 10 minutes; the resulting in-app management session expires after 30 minutes. Every alert email also includes an unsubscribe link. The first public release does not register for native push notifications; browser-push subscriptions remain a website feature.

## Accessibility

PromptSpend is being tested for screen readers, voice control, larger text, dark appearance, sufficient contrast, reduced motion, and status cues that do not depend on color alone. Please report an accessibility barrier with the assistive technology, text size, appearance, device, screen, and steps involved. Accessibility feedback receives the same support address: [info@promptspend.com](mailto:info@promptspend.com).

## Open source

PromptSpend's source and issue tracker are public at [github.com/AndrewAvery7/promptspend](https://github.com/AndrewAvery7/promptspend). Public issues must not contain secrets, private prompts, personal information, or unannounced security vulnerabilities.
