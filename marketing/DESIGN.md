---
name: NodeTool Marketing
description: The open creative AI workspace — one canvas, every model, your keys.
colors:
  blue-cta: "#2563eb"
  blue-bright: "#3b82f6"
  blue-light: "#60a5fa"
  fuchsia: "#e879f9"
  rose: "#fb7185"
  amber-glow: "#fcd34d"
  emerald: "#34d399"
  canvas: "#020617"
  void: "#020816"
  surface: "#0f172a"
  surface-glass: "#0f172a99"
  border-quiet: "#1e293b"
  border-active: "#334155"
  text-primary: "#ffffff"
  text-secondary: "#e2e8f0"
  text-muted: "#94a3b8"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(3rem, 6vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(2.25rem, 4vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.18em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  card: "16px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "24px"
  lg: "40px"
  section: "5rem"
components:
  button-primary:
    backgroundColor: "{colors.blue-cta}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "14px 24px"
  button-primary-hover:
    backgroundColor: "{colors.blue-bright}"
    textColor: "{colors.text-primary}"
  button-ghost:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.xl}"
    padding: "14px 24px"
  card-glass:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.card}"
    padding: "24px"
  badge-pill:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.blue-light}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
---

# Design System: NodeTool Marketing

## 1. Overview

**Creative North Star: "The Midnight Studio"**

This is a dark professional studio where the work is the only thing lit. The canvas is near-black slate (`#020617`); everything visible, product screenshots, nodes, headlines, floats in pools of colored light: blue, fuchsia, and amber glows blooming softly behind the surfaces. The mood is focused and after-hours, a maker deep in a session with every model at their fingertips. Color is atmosphere, not chrome. Nothing is bright for the sake of brightness; the light has a source and a job.

The system is vivid but disciplined. Surfaces are translucent slate glass with hairline borders and a faint white ring, so they read as panes of frosted material lifted off the canvas rather than flat boxes. Type is Inter, set large and confident for headlines, quiet and readable for body. The one technical accent, JetBrains Mono, appears only where code or terminals are literally shown. Motion is a gentle fly-in on scroll and soft hover lifts, never bounce, never choreography for its own sake.

This explicitly rejects three things. **Generic SaaS**: no cream backgrounds, no identical icon-heading-text card grids marching down the page, no hero-metric template. **Enterprise stiffness**: no navy-and-gray corporate flatness, no stock photography. **Crypto hype**: no neon-on-black, no gradient overload, no breathless copy. The Midnight Studio is dark because the work glows best in the dark, not because dark looks edgy.

**Key Characteristics:**
- Near-black slate canvas with atmospheric colored glows (blue / fuchsia / amber)
- Translucent glass surfaces: backdrop-blur, hairline borders, faint white ring
- Blue as the action color; fuchsia and rose as creative energy; amber as warmth
- Inter throughout, JetBrains Mono only for real code
- Soft, exponential motion: fly-in reveals and 2px hover lifts, never bounce

## 2. Colors

A near-black slate base lit by a cool-to-warm accent arc, blue into fuchsia into amber, used as light rather than as fills.

### Primary
- **Action Blue** (`#2563eb`): The single action color. Primary CTAs, focused hover borders on cards, the "live/open-source" badge. This is what the user clicks. Bright Blue (`#3b82f6`) is its hover; Sky Blue (`#60a5fa`) carries small inline accents and icons.

### Secondary
- **Studio Fuchsia** (`#e879f9`) and **Studio Rose** (`#fb7185`): Creative energy. They appear in the hero headline gradient (rose into fuchsia) and in the atmospheric glows, never as button fills. These say "creative tool" where blue says "click here."

### Tertiary
- **Amber Glow** (`#fcd34d`): Warmth at the end of the hero gradient and in the lower glow washes. A small, deliberate counterweight to all the cool. **Not** the old amber link color (see the Legacy Amber Rule).
- **Signal Emerald** (`#34d399`): Reserved for affirmative micro-signals ("pay providers directly", checkmarks). Tiny doses only.

### Neutral
- **Canvas** (`#020617`, slate-950): The page background. Everything sits on this.
- **Void** (`#020816`): Deepest overlay tone, modal scrims at high opacity.
- **Surface** (`#0f172a`, slate-900): Card and panel base, almost always at 55–80% opacity so the canvas and glows bleed through.
- **Quiet Border** (`#1e293b`, slate-800) and **Active Border** (`#334155`, slate-700): Hairline edges; active is the lit-on-hover state before blue takes over.
- **Primary Text** (`#ffffff`), **Secondary Text** (`#e2e8f0`, slate-200), **Muted Text** (`#94a3b8`, slate-400): Headlines, sub-copy, and supporting detail respectively.

### Named Rules
**The Light-Has-A-Source Rule.** Color appears as glow (radial blooms behind surfaces) or as a single solid (the blue CTA), never as decorative gradient fills on content blocks. If a color is on screen, it is either lighting something or marking an action.

**The Legacy Amber Rule.** The old amber-and-teal system (`--text-link: #f59e0b`, `.hero-title`/`.section-title` gradient-clip headings, the amber wordmark) is deprecated. New work uses Action Blue for links and solid white or near-white for headings. Do not extend amber as the link or heading color.

## 3. Typography

**Display / Body Font:** Inter (with `-apple-system, BlinkMacSystemFont, sans-serif`)
**Label/Mono Font:** JetBrains Mono (with `ui-monospace, monospace`)

**Character:** One humanist sans does almost all the work, large and bold for impact, quiet and roomy for reading. JetBrains Mono is the studio's instrument panel: it shows up only where something is genuinely code or terminal, and that restraint is what gives it meaning.

### Hierarchy
- **Display** (700, `clamp(3rem, 6vw, 4.5rem)`, line-height 1.05, tracking -0.02em): Hero headlines only. Solid white, with at most one gradient span (rose→fuchsia→amber) per headline for the key phrase.
- **Headline** (400, `clamp(2.25rem, 4vw, 3.75rem)`, line-height 1.15): Section titles. Set in near-white, normal weight; the scale carries the hierarchy, not a gradient.
- **Title** (600, 1.25–1.5rem, line-height 1.3): Card and feature headings.
- **Body** (400, 1.125rem, line-height 1.65): Paragraph copy in Secondary or Muted text. Cap measure at 65–75ch.
- **Label** (600, 0.6875rem, tracking 0.18em, UPPERCASE): Eyebrow badges and pills ("OPEN SOURCE • BYOK"). The wide tracking is the signature.
- **Mono** (400, 0.875rem, line-height 1.6): Code blocks, CLI snippets, terminal UI only.

### Named Rules
**The One-Gradient-Span Rule.** A headline gets at most one gradient-colored phrase, and only on the hero. Everywhere else, headings are solid white or near-white. Hierarchy comes from size and weight (≥1.25 ratio between steps), never from coloring whole headings.

## 4. Elevation

Depth is atmospheric, not boxy. Surfaces are lifted off the canvas by a combination of colored radial glows behind them, soft long shadows beneath them, and backdrop-blur that frosts whatever shows through. A card does not look stamped onto the page; it looks suspended in lit haze. There is no hard drop-shadow vocabulary, the shadows are wide, soft, and tinted toward warm-black and faint amber so they read as ambient light loss, not as a 3D bevel.

### Shadow Vocabulary
- **Soft** (`box-shadow: 0 20px 60px -28px rgba(2,6,23,0.7), 0 8px 24px -10px rgba(120,53,15,0.35)`): Default resting elevation for glass cards.
- **Strong** (`box-shadow: 0 30px 90px -32px rgba(2,6,23,0.8), 0 16px 40px -16px rgba(120,53,15,0.45)`): Hover / featured elevation.
- **Glow bloom** (radial-gradient layers in blue/fuchsia/amber at 10–35% alpha, blurred 120px, behind hero media): Pure atmosphere; never attached to content edges.

### Named Rules
**The Lit-Haze Rule.** Elevation is glow + soft shadow + blur, together. Never a single crisp dark drop-shadow. If a surface looks like a 2014 Material card (tight blur, hard gray shadow), it's wrong: widen the blur, tint the shadow, add the glow behind it.

## 5. Components

### Buttons
- **Shape:** Generously rounded (`rounded-xl`, 12px).
- **Primary:** Action Blue (`#2563eb`) fill, white text, `14px 24px` padding, `text-sm font-semibold`, with a tinted blue shadow (`shadow-blue-900/40`).
- **Hover / Focus:** Lightens to Bright Blue (`#3b82f6`), shadow deepens; focus shows a visible 2px offset ring (mandatory on this dark canvas).
- **Ghost (secondary):** Glass — `bg-slate-900/60`, `border-slate-700`, secondary text; hover lifts the border to `slate-500` and the background to `slate-800/60`. Used for "See it in action" next to the primary CTA.

### Badges / Pills
- **Style:** `rounded-full`, glass blue tint (`bg-blue-500/10`, `border-blue-500/30`), text in Sky Blue (`#60a5fa`).
- **Content:** UPPERCASE label type with 0.18em tracking, often a small pulsing dot and a `•` separator ("OPEN SOURCE • BYOK").

### Cards / Containers
- **Corner Style:** `rounded-2xl` (16px).
- **Background:** Translucent Surface (`bg-slate-900/60`) so canvas and glows bleed through.
- **Border:** Hairline `border-slate-800/60` plus a faint inner `ring-1 ring-white/5`, the frosted-glass edge.
- **Shadow Strategy:** Soft at rest, Strong on hover (see Elevation).
- **Hover:** A 2px lift (`lift`) and the border warms to `border-blue-500/50`; optional inner blue glow fades in.
- **Internal Padding:** 24px (`p-6`).
- **Media inside cards** is slightly desaturated at rest (`saturate(0.75)`) and recovers on hover, so screenshots sit calmly until attended to.

### Inputs / Fields
- **Style:** Glass surface, hairline `slate-700` border, `rounded-lg`.
- **Focus:** Border shifts to Action Blue with a soft blue ring glow; never a bare browser outline on this dark ground.

### Navigation
- **Style:** Secondary-text links (`text-slate-200`) that warm to Action Blue on hover, `text-base font-medium`. Active link is Action Blue.
- **Mobile:** Right-side slide-over panel on a `slate-950/90` scrim, glass gradient background, hairline left border.

### Signature: The Glow-Backed Hero Media
The product screenshot sits in a glass frame (`rounded-2xl`, `slate-900/80`, white ring) above a multi-stop radial glow (blue + fuchsia + amber at low alpha, blurred huge). This is the system's hallmark: the work, framed in glass, suspended in colored light. Reuse this pattern for any flagship screenshot.

## 6. Do's and Don'ts

### Do:
- **Do** keep the canvas near-black slate (`#020617`) and let colored glows do the lighting.
- **Do** use Action Blue (`#2563eb`) as the one action color: CTAs, focused borders, active nav, links.
- **Do** build surfaces as glass: `slate-900/60` + hairline border + `ring-white/5` + backdrop-blur.
- **Do** elevate with the Lit-Haze recipe: wide soft tinted shadow + glow + blur, together.
- **Do** restrict gradients to one phrase on the hero headline and to atmospheric glows.
- **Do** keep visible 2px focus rings on every interactive element; the dark ground demands it.
- **Do** hold body copy to 65–75ch and verify Muted Text (`#94a3b8`) hits WCAG AA on its actual surface; lift to `#cbd5e1` (slate-300) wherever it doesn't.

### Don't:
- **Don't** revive the legacy amber-and-teal system: no `--text-link: #f59e0b`, no gradient-clip headings (`.hero-title`/`.section-title`), no amber wordmark. Gradient-clipped heading text is banned outright.
- **Don't** use the shadcn `ui/Button` (pink→cyan) or `ui/Card` (white) defaults; they are stale and off-system. Use the glass card and blue CTA patterns above.
- **Don't** ship a generic SaaS landing: no cream backgrounds, no identical icon-heading-text card grids repeated down the page, no big-number hero-metric template.
- **Don't** drift enterprise: no navy-and-gray corporate flatness, no stock photography, no jargon.
- **Don't** go crypto-hype: no neon-on-black, no gradient overload, no breathless "revolutionary" copy.
- **Don't** use a single crisp dark drop-shadow (the 2014-Material look); widen and tint it.
- **Don't** add side-stripe borders (`border-left`/`border-right` >1px as a colored accent). Use full hairline borders or background tints.
