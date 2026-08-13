# Mobile accessibility release evidence

Status: active store-release gate

PromptSpend should publish App Store and Google Play accessibility claims only
after the matching source, automated, and physical-device evidence below is
complete. A control being present in source is not enough to make a public
store claim.

## Claim matrix

| Store-facing capability           | Source and automated evidence                                                                                                                     | Physical evidence required before claiming support                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VoiceOver                         | Native semantic roles, labels, hints, selected/disabled states, live regions, and reading order are implemented throughout primary flows          | Complete every primary journey on iPhone and iPad with VoiceOver; confirm focus remains inside sheets and returns to the opener                          |
| Voice Control                     | Visible control names align with native accessibility labels and all primary controls use semantic native press targets                           | Complete Estimate, Compare, receipt sharing, saved scenarios, Search, Guide, Learn, and Data & Alerts using Voice Control names only                     |
| Larger Text                       | `AppText` leaves font scaling enabled and uncapped; layouts avoid fixed text heights; local fonts are embedded                                    | Complete the full journey at the largest practical iOS Dynamic Type and Android font/display size on phone and tablet without clipping or hidden actions |
| Dark Interface                    | System, Light, and Dark modes persist locally; dark semantic tokens exist for all supported accents and canvases                                  | Review every destination, sheet, destructive state, keyboard, share preview, splash, and system handoff on physical hardware                             |
| Differentiate Without Color Alone | Savings, warnings, errors, freshness, review status, selected state, and destructive actions use text or iconography in addition to color         | Confirm with grayscale/color-filter checks and screen-reader announcements on both platforms                                                             |
| Sufficient Contrast               | Automated tests cover primary, muted, surface, canvas, and accent text across all 16 appearance combinations                                      | Inspect real-device rendering, disabled states, borders, focused fields, charts, and modal scrims in light and dark modes                                |
| Reduced Motion                    | Market Pulse stops automatic movement when Reduce Motion is active and has an explicit pause control; the app avoids decorative continuous motion | Confirm ticker, sheets, onboarding, and navigation with Reduce Motion enabled on iOS and Remove Animations enabled on Android                            |

Captions and Audio Descriptions are not applicable to the current app because
the release contains no audio or video content. This must be revisited before
media is added.

## Device test script

Run this sequence on an iPhone, iPad, and the purchased Android phone. Repeat
the layout checks in portrait and landscape.

1. Launch from a clean install and complete onboarding without assistance.
2. Open Search, Guided Tour, and Appearance; confirm focus containment, close
   behavior, readable labels, and a clear selected state.
3. Set System, Light, and Dark modes; inspect all four accent choices and both
   canvas choices.
4. Enable the largest practical text setting. Complete one Estimate using
   pasted text, then compare four models and expand every calculation section.
5. Save, rename, duplicate, reopen, delete, and undo a scenario.
6. Create and share a readable result and an AI Cost Receipt through Messages,
   Mail/Gmail, Notes/Files, and one third-party share target. Confirm no pasted
   prompt text appears.
7. Navigate every Learn lesson and use the private token lab.
8. Open every Data & Alerts resource and confirm browser, clipboard, and hosted
   alert handoffs are understandable and reversible.
9. Enable Reduced Motion/Remove Animations. Confirm Market Pulse stops moving
   automatically and remains manually readable.
10. Turn on VoiceOver/TalkBack and repeat Home to Estimate, Compare, receipt
    sharing, saved scenario restoration, Learn, and Data & Alerts.
11. Use grayscale or a color filter and confirm every status remains
    understandable without color.
12. Capture defects with device, OS version, orientation, appearance choice,
    text size, assistive technology, screen, exact steps, and a screenshot.

## Release rule

Do not select a supported-feature checkbox in App Store Connect or make an
equivalent Google Play listing claim until its entire row passes. A failed row
blocks only that public claim unless the failure prevents a primary journey; a
primary-journey failure is a release blocker.
