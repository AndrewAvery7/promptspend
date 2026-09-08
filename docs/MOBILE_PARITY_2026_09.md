# September mobile parity candidate

## Implemented scope

- PromptSpend Receipt is accessible from Home, Search, Help, and the seven-step
  Guide. Its versioned instructions and parser are shared with the website in
  `packages/core/src/receipt/`.
- The workflow copies/shares instructions, imports the assistant's JSON locally,
  allows field review/editing, and shares PNG or readable text. A valid import
  unlocks sharing. Raw pasted results clear after import; imported fields clear
  when leaving the screen. Neither is persisted or sent to an API.
- The hypothetical scenario artifact is named **Estimate Receipt**.
- Introductory rates use the calculation engine's pricing date in selectors,
  catalog sorting/Value Map, watched models, ticker, flagged rows, and CSV.
  Estimate Receipt includes promotional context and assumptions.
- Home summarizes model/provider coverage, vendor/feed provenance, and flagged
  rows. Data includes vendor-check outcomes when supplied by validated health.
- Learn opens the August 2026 Price Movement Report in the system browser.
  Editorial content remains on the website so corrections are available without
  another native binary. Receipt's specification/demo has an explicit web link.

## Platform boundaries

The user sends the visible audit instructions to their chosen AI conversation.
The app does not automate another AI app or infer hidden billing. Receipt
preserves ranges, unknown models, unavailable prices, and quality caveats.

Vendor checking, pricing synchronization, API/MCP/extension services, SEO pages,
and editorial publication retain their existing implementations. Mobile uses
their public evidence and resources, without server credentials or duplication.

## Additional physical QA

Run on iPhone, iPad, and Galaxy in portrait/landscape and light/dark appearance:

1. Open Receipt from Home, Search, FAQ, and Guide. Verify bottom navigation
   remains Home, Estimate, Compare, Data & Alerts, Learn.
2. Copy instructions into a harmless AI conversation. Check the public spec
   version, model ambiguity, current-price limitations, and visible-message scope.
3. Import valid fenced/nested JSON, then malformed, incomplete, and oversized
   input. Invalid input must not unlock sharing on a fresh screen.
4. Edit long fields. Share image/text to Messages, Mail/Gmail, Files/Notes, and
   an installed third-party app. Verify readable ranges/caveats and cancellation.
5. Leave Receipt and return: prior imported/pasted content must be cleared.
   Verify storage/network traces contain neither the result nor conversation.
6. Use an active-promotion fixture and a date after expiration. Check displayed
   rates, ordering, ticker, CSV, and Estimate Receipt against engine results.
   Standard rates return after the inclusive end date; intro labels disappear.
7. Match provenance counts to the catalog. Flagged data stays identified and
   missing vendor-check evidence never becomes a successful-check claim.
8. Open the report/specification, return, and test offline errors. Preserve the
   active Estimate scenario through browser handoffs.
9. Repeat with VoiceOver/TalkBack and largest practical text/display settings.
   Check compact headers, long receipts, editable labels, and share controls.

## Release boundary

Source checks, EAS binaries, physical QA, and store approval are separate evidence.
No Apple/Google upload, tester distribution, store-record change, review, or public
release is authorized by candidate preparation. The owner explicitly approves
the exact platform action first.
