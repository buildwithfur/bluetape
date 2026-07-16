---
version: alpha
name: Bluetape
description: A warm, editorial household coordination app for household users and admins. Feels like printed paper sitting on a warm desk.
colors:
  # Foundation — warm paper, no stark white
  background: "#F5F2EB"
  background-alt: "#F0ECE4"
  surface: "#FBF8F2"
  surface-hover: "#F8F4EE"
  surface-active: "#F2EDE5"
  surface-floating: "#FFFFFF"
  # Borders — tinted toward warmth, never cool gray
  border-subtle: "#ECE5D9"
  border: "#E2DACD"
  border-strong: "#D5CBB9"
  # Ink — navy as primary text, replaces black
  ink: "#0A2950"
  ink-700: "#173C68"
  text-primary: "#171A20"
  text-secondary: "#5A5660"
  text-tertiary: "#8A7E6A"
  text-disabled: "#C9C0AE"
  text-on-accent: "#FFFFFF"
  # Brand accent — orange, restrained (≤8% of screen)
  accent: "#E3751B"
  accent-hover: "#CC6412"
  accent-soft: "#F7C99D"
  accent-bg: "#FFF7EF"
  # Navy ramp
  navy-900: "#06182E"
  navy-800: "#0A2950"
  navy-700: "#173C68"
  navy-600: "#29517E"
  navy-500: "#476C99"
  navy-400: "#7191B4"
  navy-300: "#A7BED6"
  navy-200: "#D5E3EF"
  navy-100: "#EEF5FA"
  # Orange ramp
  orange-900: "#8E4308"
  orange-800: "#B7560F"
  orange-700: "#CC6412"
  orange-600: "#E3751B"
  orange-500: "#F08D39"
  orange-400: "#F5A55C"
  orange-300: "#F8C38F"
  orange-200: "#FBE1CA"
  orange-100: "#FEF5EC"
  # Semantic — backgrounds are tints, accents are saturated
  success-bg: "#EEF8F2"
  success-text: "#2A6B43"
  success-accent: "#52B46B"
  warning-bg: "#FFF7E9"
  warning-text: "#996100"
  warning-accent: "#E6A325"
  error-bg: "#FCEEEE"
  error-text: "#B63D3D"
  error-accent: "#DF5A5A"
  info-bg: "#EEF5FD"
  info-text: "#2A609D"
  info-accent: "#4A89DD"
typography:
  h1:
    fontFamily: Satoshi
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.02em
  h2:
    fontFamily: Satoshi
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  h3:
    fontFamily: Satoshi
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Satoshi
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Satoshi
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Satoshi
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: Satoshi
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.1em
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  local:
    fontFamily: Noto Sans
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.4
  button-label:
    fontFamily: Satoshi
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
spacing:
  base: 16px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  page-margin: 22px
  gutter: 16px
rounded:
  xs: 8px
  sm: 12px
  md: 20px
  lg: 28px
  full: 9999px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-on-accent}"
    rounded: "{rounded.xs}"
    padding: 12px
    typography: "{typography.button-label}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.ink-700}"
    borderColor: "{colors.border}"
    rounded: "{rounded.xs}"
    padding: 12px
    typography: "{typography.button-label}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink-700}"
    rounded: "{rounded.xs}"
    padding: 8px
  tab-inactive:
    backgroundColor: transparent
    textColor: "{colors.text-tertiary}"
    typography: "{typography.label-caps}"
  tab-active:
    backgroundColor: transparent
    textColor: "{colors.accent}"
    typography: "{typography.label-caps}"
  wikilink:
    textColor: "{colors.navy-700}"
    borderColor: "{colors.navy-300}"
    typography: "{typography.body-md}"
  wikilink-hover:
    backgroundColor: "{colors.navy-100}"
    borderColor: "{colors.navy-500}"
  wikilink-broken:
    textColor: "{colors.text-tertiary}"
    borderColor: "{colors.border-strong}"
  list-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border-subtle}"
    minHeight: 56px
    padding: 16px
  list-row-hover:
    backgroundColor: "{colors.surface-hover}"
  checkbox-done:
    textColor: "{colors.success-accent}"
  topbar:
    backgroundColor: rgba(245,242,235,0.85)
    borderColor: "{colors.border-subtle}"
  tabbar:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border-subtle}"
---

# Bluetape Design Spec

## Overview

Bluetape is a household coordination app used primarily by a household user on their phone every morning, and secondarily by an admin to manage content. It coordinates routines, one-off tasks, household notes (with optional photos and local-language translations), rules, and a shared grocery list — all interconnected by wiki-style `[[links]]`.

The physical scene: a phone held in a kitchen, sometimes under fluorescent light, sometimes bright tropical daylight. The user opens it to see what to do today, taps through to reference notes, and marks work done. They may not be fluent in English.

The product should feel like **printed paper sitting on a warm desk**. Warm. Editorial. Premium. Technical. Not a cold SaaS dashboard. Restraint is the brand: warm neutral paper, navy ink, and a single orange accent that reads as signal — a heartbeat, never a shout. The interface must be calm enough that a stressed worker on her sixth task of the day can still parse it at a glance, and legible enough that a non-native English reader can navigate by photo and structure alone. Photos of household products pop against the cream; local-language script reads at full size.

The emotional target: trustworthy, quiet, slightly handcrafted, never clinical. Closer to a well-made household reference binder than an app.

## Colors

The palette is a single warm-neutral foundation, navy ink for permanence, and orange as the sole brand accent. Color strategy is **Restrained**: tinted neutrals carry 90% of the surface, navy carries secondary weight, and orange is reserved for ≤8% of any screen.

- **Background (`#F5F2EB`) — Warm Paper.** The application's body. A desaturated warm beige that reads as printed paper, never stark white. Sits deliberately in the cream band; it works only because orange + navy accent the warmth rather than relying on the background alone.
- **Surface (`#FBF8F2`) — Card Layer.** A 3%-lighter warmth used for app surfaces layered on the paper. Never pure white for ordinary content.
- **Surface Floating (`#FFFFFF`) — Overlays Only.** Pure white is reserved exclusively for search bars, command palettes, dropdowns, popovers, modals, and floating toolbars. Using white for a normal card is forbidden.
- **Ink (`#0A2950`) — Brand Navy.** Replaces black as the primary text color. A deep, slightly warm navy. Reads as authoritative but softer than pure black.
- **Secondary / Tertiary Text (`#5A5660`, `#8A7E6A`).** Warm-shifted grays. Cool grays (`#7C838B`, `#B2B7BE`) are forbidden — they fight the warm scene and read as "AI-generated." Tertiary text is a warm taupe that maintains ≥4.5:1 contrast on `background`.
- **Border (`#E2DACD`) — Warm Hairline.** Tinted toward the warm hue; never cool gray. Used for 1px separators.
- **Accent (`#E3751B`) — Brand Orange.** The single most important color decision. It is loud by nature; it stays premium by restraint. Used *only* for: the primary CTA, the active tab, the selected-state border, and small progress markers (today counts, the current date dot). Never a section background. Never a card fill. Never on every button.
- **Accent Hover (`#CC6412`).** A darker, more saturated orange. Used for orange hover states where `#E3751B` would fail WCAG AA on cream.
- **Accent Background (`#FFF7EF`) — Selected State.** A faint warm tint used as the selected/active row background, paired with an `accent`-colored border.
- **Semantic colors.** Backgrounds are light tints; text and accents are saturated. Success green appears *only* on the "done" checkmark — never as a tile, banner, or button background. Warning amber appears only for rule-reminder callouts (e.g., "don't use kitchen cloth on toilets") at the top of the Today list.

**Accent usage ratio (target):** 80% warm neutrals · 15% navy · 5% orange. Orange should never become the background of the application. Orange should always feel intentional.

## Typography

Typography is bilingual: **Satoshi** (geometric grotesque, via Fontshare) for English/UI, and **Noto Sans** for the local-language script. **JetBrains Mono** is reserved for dates, counts, and metadata — an editorial-technical signal.

- **Headlines** — Satoshi Semi-Bold (600) at 30px for page titles, with `-0.02em` tracking. Tight but not cramped. `text-wrap: balance` on H1–H3 for even line lengths.
- **Body** — Satoshi Regular (400) at 16px, line-height 1.5, capped at 65ch on long-form content such as rules.
- **Labels (uppercase)** — Satoshi Medium (500) at 11px, `+0.1em` letter-spacing, tertiary color. Used for type badges, section labels, and tab labels. Used sparingly — never as a reflexive eyebrow above every section.
- **Mono** — JetBrains Mono for dates ("Tue · 7 Jul"), counts ("3/7"), and quantified metadata. Restrained; feels like printed reference data.
- **Local-language text** — Noto Sans at 24px, weight 500. Rendered inline in the content flow, not boxed. The script is large enough to be legible to a non-Latin reader at arm's length.

**Forbidden fonts:** Geist, Inter, and the AI-default sans stack. They are the tell of a vibe-coded UI in 2025-2026. Satoshi (or a native system stack as fallback) is the brand voice.

## Layout

Mobile-first. The primary surface is a phone screen, max-width 420px, centered on desktop with a hairline frame. The employer's occasional desktop use renders the same content with a left rail replacing the bottom tab bar.

A **bottom tab bar** carries 4 destinations (Today, Routines, Shopping, More) — thumb-reachable, iOS/Android muscle-memory. The active tab's icon and label render in `accent`; inactive tabs render in `text-tertiary`. The bar sits on `surface` with a `border-subtle` top hairline.

A **sticky top bar** provides back navigation, contextual actions (Edit, overflow), and uses a translucent `background` with `backdrop-filter: blur(12px)` so content scrolls cleanly beneath.

**Spacing scale** is a strict 8px base with a 4px half-step. Page content uses a 22px horizontal margin (a touch wider than `lg` to give the editorial feel of page margins on paper). Rhythm is varied — section spacing is not uniform; the photo, title block, and content block each take a different breath.

**Containment discipline (critical).** Cards are the lazy answer and nested containers are always wrong. Content lives in the page flow, separated by hairline dividers (`border-subtle`), not by boxes. The only legitimate containers are: (1) the photo frame (a hairline border around a real image), (2) app chrome (top bar, tab bar), and (3) floating overlays (modals, dropdowns) which may be pure white. A "card inside a card" or "a labeled box inside content" is forbidden.

## Elevation & Depth

Depth is achieved through **tonal layers**, not shadows. The hierarchy:

1. `background` — the paper
2. `surface` — app layers on the paper (3% lighter)
3. `surface-floating` (`#FFFFFF`) — overlays only

**Shadows are reserved exclusively for floating overlays** (modals, dropdowns, command palettes). The shadow is tinted toward the navy hue: `0 4px 12px rgba(10,41,80,.025)`. The "ghost-card" pattern — a 1px border paired with a wide soft shadow on the same element — is forbidden. Pick one: a solid hairline border *or* a defined shadow, never both as decoration.

For normal content hierarchy, use hairline dividers and ~3% tonal steps. Never box content to show it's "grouped."

## Shapes

The shape language is **restrained softness**. Radii are small and intentional, not the AI-default of 28–40px that reads as "insanely rounded."

- **Hairline borders and dividers** — `1px solid {colors.border-subtle}`, used between content sections and as photo frames.
- **Interactive elements** — `8px` radius (inputs, buttons, icon buttons).
- **Photo frames** — `20px` radius with a 1px `border` hairline.
- **Selected-state rows** — no radius change; the affordance is the `accent` border + `accent-bg` fill, not a shape change.
- **Wiki links** — no radius, no background by default. They are underline-only blue text; the blue-tinted bg appears only on hover/tap.

Radius scale: `xs 8px` · `sm 12px` · `md 20px` · `lg 28px` (overlays only) · `full 9999px` (status dots only). `lg` is forbidden on normal cards.

## Components

- **Button — Primary.** Solid `accent` background, white text, `8px` radius, Satoshi Medium 14px. One per screen, maximum. Reserved for the single most important action (Save, Add). Hover darkens to `accent-hover`.
- **Button — Secondary.** Transparent background, `ink-700` text, 1px `border`. For secondary actions.
- **Button — Ghost.** Transparent, no border, `ink-700` text, `8px` radius. For icon-only actions and inline edits. Active state: `surface-active` bg + `scale(0.96)` press.
- **Bottom Tab.** 4-column grid, `surface` background, `border-subtle` top hairline. Inactive: `text-tertiary`. Active: `accent`. Label is `label-caps`. Icons are Phosphor or Radix at `strokeWidth: 1.75`. Tap: `scale(0.95)`, 120ms ease-out.
- **Wiki Link.** The signature component. Blue (`navy-700`) text with a 1px `navy-300` underline. No background, no border-radius by default. On hover/tap: `navy-100` appears. Broken (target page doesn't exist): `text-tertiary` + dashed `border-strong` underline in default state, becoming `navy-700` on hover. This makes it visually obvious what still needs creating without shouting.
- **List Row.** Full-width tappable row, `min-height: 56px` (above the 44px a11y floor for easy thumb use). `surface` background, `border-subtle` bottom hairline. Tap target is the whole row. Hover: `surface-hover`. Active: `surface-active` + `scale(0.98)`.
- **Checkbox — Done.** A circular outline; checked state is a filled circle in `success-accent`. No green tile or banner — green appears *only* on this 16px circle. The accompanying text gets a subtle strikethrough that fades in over 150ms.
- **Top Bar.** Sticky, translucent `background` (`rgba(245,242,235,0.85)`) + `backdrop-filter: blur(12px)`, with a `border-subtle` bottom hairline. Holds a back `Ghost` button on the left and contextual actions on the right.
- **Local-Language Name Block.** Inline in content flow — a `label-caps` "Local-language name" label, then the script at 24px in `ink`. No border, no background, no nesting.
- **Warning Callout.** Used for rule reminders on the Today screen. `warning-bg` background, `warning-text` text, no border. Reads as a quiet printed sticky note.
- **Photo Frame.** A real image frame: 1px `border` hairline, `20px` radius, `aspect-ratio: 4/3`. Not a content container — it mounts a photo on the page.

## Do's and Don'ts

**Do:**
- Use `accent` (orange) only for the single most important action per screen, the active tab, the selected-state border, and small progress markers.
- Maintain WCAG AA contrast (4.5:1 body, 3:1 large/bold). Use `navy-700` (`#173C68`) for wiki link text.
- Let content live in the page flow with hairline dividers, not in nested boxes.
- Use a 1px hairline border *or* a defined shadow — never both as decoration.
- Tap targets ≥44px; list rows ≥56px for comfortable one-handed use.
- Animate with `transform` and `opacity` only, `120ms` ease-out. Include `prefers-reduced-motion` fallbacks.
- Use Noto Sans at ≥22px so the script is legible at arm's length.
- Render broken wiki links with a dashed underline so unmade pages are visible but quiet.

**Don't:**
- Don't use Geist or Inter — they read as AI-generated. Use Satoshi (or a native system stack as fallback).
- Don't use pure white (`#FFFFFF`) for normal cards. White is for overlays only.
- Don't use cool grays (`#7C838B`, `#B2B7BE`). Warm-shift to taupe (`#8A7E6A`, `#C9C0AE`).
- Don't nest containers. No card-in-card, no labeled boxes inside content.
- Don't use orange as a section or card background. It is accent only.
- Don't use a 1px border + wide soft shadow on the same element (the ghost-card).
- Don't use radii above 20px on normal cards. `28px`+ is overlays only.
- Don't use green (success) anywhere except the done-checkmark circle.
- Don't use gradient text, side-stripe borders, or sketchy SVG illustrations.
- Don't put a tracked uppercase eyebrow above every section. One deliberate kicker as a system is voice; reflexive eyebrows on every section is AI grammar.
