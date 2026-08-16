# PromptSpend Mobile Design System

Status: launch-release source of truth (approved 2026-08-12)

This mobile system inherits the tested PromptSpend web identity. Automated design-search recommendations informed the minimal information hierarchy, restrained motion, and native accessibility rules, but they do not replace the existing brand palette or typography.

Page-specific files under `pages/` may add requirements. They may not weaken the accessibility, privacy, or semantic-color rules in this master file.

## Product character

PromptSpend is a professional decision tool for people evaluating LLM API costs. It should feel precise, calm, trustworthy, and efficient. The interface must prioritize numbers, assumptions, provenance, and freshness evidence over decoration.

- Native, not a wrapped website.
- Information-dense without feeling cramped.
- Light and dark themes have equal status.
- Motion is subtle and functional.
- No glassmorphism, ambient blobs, novelty gradients, gamification, or decorative animation.
- No emoji used as navigation or structural icons.

## Semantic color tokens

These values mirror `src/styles/tokens.css`. Do not substitute generic developer-tool colors.

### Light theme

| Role                  | Value     |
| --------------------- | --------- |
| Canvas                | `#EBEFF5` |
| Surface               | `#FFFFFF` |
| Raised/subtle surface | `#FAFBFD` |
| Primary text          | `#15181D` |
| Secondary text        | `#5F6B78` |
| Border                | `#DCE2EB` |
| Accent                | `#2456E6` |
| Accent soft           | `#E4EAFC` |
| Text on accent        | `#FFFFFF` |
| Savings               | `#0E7B43` |
| Cost increase/error   | `#C62828` |
| Information           | `#2166A5` |
| Warning               | `#9A5B08` |

### Dark theme

| Role                  | Value                       |
| --------------------- | --------------------------- |
| Canvas                | `#0B0E14`                   |
| Surface               | `#121722`                   |
| Raised/subtle surface | `#1A2130`                   |
| Primary text          | `#E9ECF2`                   |
| Secondary text        | `#93A0B4`                   |
| Border                | `#27303F`                   |
| Accent                | `#7C9DFF`                   |
| Accent soft           | `rgba(124, 157, 255, 0.15)` |
| Text on accent        | `#08122B`                   |
| Savings               | `#3CCB7F`                   |
| Cost increase/error   | `#F97066`                   |
| Information           | `#4D93CE`                   |
| Warning               | `#F5B849`                   |

Green always means savings or positive cost impact. Red always means increased cost, destructive action, or error. Brand accent selection must never repaint those meanings.

## Typography

The final application will bundle the same self-hosted families as the website:

- Display: Space Grotesk
- Body: IBM Plex Sans
- Numeric/code: JetBrains Mono

Until fonts are bundled and licensed in Phase 3, use platform system fonts. Do not fetch fonts at runtime. Support Dynamic Type without fixed-height text containers or clipped labels.

## Spacing, shape, and size

- Base rhythm: 4dp and 8dp.
- Standard gaps: 8, 12, 16, 24, 32, and 48dp.
- Phone gutter: 20dp; increase on large screens and landscape.
- Small radius: 8dp.
- Standard radius: 12dp.
- Large card/sheet radius: 16dp.
- Minimum touch target: 44x44pt on iOS and 48x48dp on Android.
- One-pixel borders provide hierarchy before shadows; use elevation sparingly.

## Layout

- Respect all safe-area insets.
- Prefer a single primary reading column on phones.
- Keep long text to a readable measure on tablets and wide layouts.
- Scroll content must clear tab bars, keyboards, and bottom actions.
- Phone launch uses five top-level tabs: Home, Estimate, Compare, Learn, and Data & Alerts.
- Prices, the full catalog, model details, and the value map live within Compare.
- Data & Alerts is a first-class destination. Appearance, Search, and Guide remain global actions; privacy, support, integrations, and evidence live in Data & Alerts.
- Search and the Guided Tour remain globally reachable from the app header.
- Back behavior, deep links, and selected-tab restoration must use Expo Router conventions.

## Launch hierarchy

- Home is a local, personalized Cost Brief rather than a marketing landing page.
- Estimate and Compare lead with the answer, then reveal calculation detail and controls progressively.
- Learn explains cost mechanics without interrupting the primary estimate flow.
- Data & Alerts is structured around freshness, evidence, optional alerts, privacy, support, and integrations rather than acting as a miscellaneous overflow screen.
- The Market Pulse uses validated catalog evidence only and must remain readable when paused or when Reduce Motion is enabled.
- Saved scenarios, favorites, and watchlist state stay on-device in version 1.
- The AI Cost Receipt is a privacy-safe result artifact, not a social-media advertisement disguised as user data.

## Components

- Use semantic native controls and `Pressable` for custom buttons.
- Every interactive control needs a visible label, accessibility role, descriptive accessibility label, pressed feedback, disabled behavior, and sufficient hit area.
- Use one consistent vector-icon family at each hierarchy level.
- Cards are not tappable unless they visibly and semantically behave as controls.
- Form labels remain visible after entry; placeholders are examples, not labels.
- Loading lasting more than 300ms needs status feedback.
- Errors appear beside the affected field and in a screen-reader-readable summary when multiple fields fail.

## Motion

- Standard transitions: 150-300ms.
- Motion must explain state, focus, or navigation.
- Avoid continuous decorative animation.
- Respect reduced-motion settings.
- Press feedback may change color, opacity, or elevation without moving surrounding layout.

## Accessibility gates

- Normal text contrast: at least 4.5:1.
- Large text and meaningful UI glyphs: at least 3:1.
- Never rely on color alone for savings, warnings, errors, freshness, or selected state.
- VoiceOver and TalkBack order must match visual order.
- Verify at the largest practical system text setting.
- Verify 375pt phone width and landscape.
- Verify light and dark themes independently.

## Privacy-visible design

- Paste-mode screens state that prompt text stays on the device.
- Shared links never contain prompt text.
- Freshness and provenance are visible near prices, not buried in settings.
- Cached or stale data uses explicit text and timestamps, not only a color change.
- Optional alerts explain what is stored before notification permission is requested.

## Launch-release scope

The existing foundation shell proves theming, safe areas, app identity, and build health. The Launch Release replaces its horizontal section switcher with native, persistent, five-destination navigation and adds the approved Home, onboarding, saved-work, decision-intelligence, privacy, accessibility, resilience, and release-polish experiences defined in `../../docs/MOBILE_LAUNCH_RELEASE.md`.
