# PromptSpend Receipt launch kit

## Product promise

PromptSpend Receipt is a visible, user-initiated request that asks the assistant already holding a conversation to estimate the visible workload, use current PromptSpend pricing, and state what it cannot know. It is temporary, inspectable, and performs one narrow task.

Primary CTA: **PromptSpend this conversation**  
Campaign line: **Your prompt has a price tag.**  
Supporting line: **Most AI won't tell you what it is. PromptSpend will.**

## Demo sequence

1. Open a real AI conversation containing enough history to make context reuse meaningful.
2. Visit `/receipt/`, inspect the complete instructions, and copy the Receipt.
3. Paste it after the conversation. Do not add model or cost claims the interface does not establish.
4. Show the assistant's ranges, model-resolution state, current source status, cost drivers, and quality caveats.
5. Copy the fenced `promptspend-receipt` block back into the page.
6. Review every share-card field and export the locally generated PNG.

## Launch copy

**Short post**

Your prompt has a price tag. PromptSpend Receipt is a visible instruction you paste into an existing AI conversation. It estimates the visible workload, checks current PromptSpend pricing, names the two biggest cost drivers, and keeps unknowns unknown. Then it turns the reviewed result into a shareable receipt—locally, without uploading the conversation.

**One-line variants**

- Wonder what this conversation costs? PromptSpend it.
- Before your AI spends another token, hand it the receipt.
- Somebody PromptSpend this.

## FAQ

### Is this prompt injection?

No. The user deliberately copies visible text into their own conversation. The full instruction is inspectable and limited to one response. It explicitly rejects hidden content and unrelated instructions found inside quoted material.

### Is the result a bill?

No. It is an estimate from visible conversation content and published list prices. Hidden prompts, billing records, cache details, reasoning tokens, tool charges, discounts, taxes, and special tiers may not be visible.

### Does a cheaper model give the same result?

PromptSpend compares price and basic compatibility, not quality. Any alternative is a candidate to test against the real task and quality bar.

### Does the share card upload my conversation?

No. Import, editing, image rendering, and download happen in the browser. The card contains only the reviewed fields shown in its preview.

## Measurement contract

The page emits a local `promptspend:receipt` browser event with an action only—never conversation text, receipt fields, model names, or prices. Supported actions: `instructions_copied`, `instructions_copy_failed`, `share_imported`, `share_downloaded`, `share_opened`, and `share_fallback_downloaded`. A future first-party analytics listener may count these actions without changing the privacy boundary.

## Release checks

- Copy text exactly matches `/receipt/instructions.txt` and `/receipt/spec.json`.
- Pricing failure prevents dollar claims but never disables copying.
- Invalid or incomplete share JSON produces a recoverable error.
- Exported SVG text is escaped; PNG generation stays local.
- Web Share falls back to PNG download.
- Desktop/mobile, light/dark, keyboard, reduced motion, and screen-reader states pass.
- ChatGPT, Claude, and Gemini are checked manually against the same visible contract; record platform limitations rather than compensating with hidden instructions.
