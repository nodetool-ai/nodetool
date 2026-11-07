# Native design

The native editor supports sustained work in bright and dim environments.
Chrome is compact and flat, with contrast reserved for focus, selection, and
state. Qt layout uses device-independent coordinates. Device pixel ratio is
applied by Qt rather than multiplied into layout values.

## Appearance

The shell supplies System, Dark, or Light preference, the resolved system
scheme, positive UI and text scales, and reduced motion. System resolves to
Dark when the platform scheme is unknown. The module owns no settings or OS
subscriptions. Metrics scale with UI scale. Font sizes scale with UI scale and
text scale. Theme changes update presentation without changing document data.

The native palette follows the web palette in
[`paletteDark.ts`](../../web/src/components/themes/paletteDark.ts) and
[`paletteLight.ts`](../../web/src/components/themes/paletteLight.ts). Change
both together. Translucent web values are flattened over the panel surface.

| Role | Dark | Light | Web source |
| --- | --- | --- | --- |
| Canvas / panel | `#08090a` / `#101113` | `#f5f5f6` / `#ffffff` | `background.default` / `background.paper` |
| Overlay / input | `#17181b` / `#17181a` | `#f2f2f4` / `#f9f9f9` | `Paper.overlay` / `c_overlay_subtle` |
| Primary / secondary text | `#f7f8f8` / `#8a8f98` | `#18181b` / `#5b5b66` | `text.primary` / `text.secondary` |
| Disabled / on-accent text | `#686969` / `#ffffff` | `#a1a1aa` / `#ffffff` | `text.disabled` / `primary.contrastText` |
| Subtle / control border | `#232426` / `#27292e` | `#e4e4e7` / `#dcdce1` | `divider` / `grey.700`, `Chip.defaultBorder` |
| Strong / focus / error border | `#8a8f98` / `#3d68a8` / `#ff5555` | `#5b5b66` / `#2f62c4` / `#d92d20` | `text.secondary` / `primary.main` / `error.main` |
| Accent / hover | `#3d68a8` / `#2a4d80` | `#2f62c4` / `#244e9e` | `primary.main` / `primary.dark` |
| Destructive / hover | `#c62828` / `#a32020` | `#b42318` / `#912018` | `error.dark` |
| Success / warning | `#50fa7b` / `#ffb86c` | `#16a34a` / `#dc6803` | `success.main` / `warning.main` |
| Error / info | `#ff5555` / `#22d3ee` | `#d92d20` / `#0e7490` | `error.main` / `info.main` |
| Warning surface / text | `#3d2b10` / `#ffd08a` | `#fff1d6` / `#825100` | native |
| Error surface / text | `#441d21` / `#ffb3b3` | `#ffebeb` / `#b42323` | native |

Action hover, pressed, selected, and disabled use respectively 2%, 8%, 5%,
and 10% white over dark surfaces, or 4%, 10%, 7%, and 8% of `#18181b` over
light surfaces, as in the web `action` palette. Media and modal scrims use 60%
black. `Theme.qml` defines the same roles in executable form. Primary and
secondary text target 4.5:1 against the canvas, panel, input, and overlay
surfaces. Text on primary, hover, and destructive fills targets 4.5:1. Focus
borders target 3:1 against the panel. Control borders are quiet, as on the
web, and controls are identified by their fill and label. The tests measure
these solid pairs. Media and modal scrims remain dark in both schemes.

Borders are one logical pixel and focus is two. Focus does not change control
geometry. Persistent chrome is flat. Transient overlays use an overlay surface
and border.

## Type and spacing

| Role | Family | Logical px | Weight | Line height |
| --- | --- | ---: | ---: | ---: |
| SansTitle | Inter | 18 | 600 | 1.30 |
| SansBody | Inter | 15 | 400 | 1.45 |
| SansLabel | Inter | 13 | 500 | 1.35 |
| SansCaption | Inter | 11 | 400 | 1.40 |
| MonoCode | JetBrains Mono | 13 | 400 | 1.50 |
| MonoStrong | JetBrains Mono | 13 | 600 | 1.50 |
| MonoLabel | JetBrains Mono | 13 | 500 | 1.35 |
| MonoCaption | JetBrains Mono | 11 | 400 | 1.40 |

Proportional line height splits its extra space evenly above and below the
glyphs, as CSS half-leading does. `Ui.Text` shifts top-aligned text down by half
the space and moves its bottom edge up by the same amount, so implicit size is
unchanged and glyphs sit in the middle of the line. `Typography` measures each
role's natural line height once. An instance that sets its own top or bottom
padding adds `halfLeading` to keep the shift. Text with another vertical
alignment needs no shift. Rich text needs none either, because its layout
ignores the line height. A control that needs its minimum height sets
`lineHeight: 1`, which removes the extra space.

The bundled fonts are Latin subsets. [The interface guide](README.md) records
the tested coverage and fallback limits. Use a complete type role for UI text.
Document-authored fonts and colors remain document data.

Spacing roles are 0, 2, 4, 6, 8, 12, 16, 24, and 32 logical pixels before
scaling. Control minima are 24, 28, 32, 36, and 44 logical pixels. Compact
inspector controls use 28. Standard fields use 32. A control grows when its
measured text and padding exceed its minimum.

## Motion and recipes

Use the named durations in `Metrics`. `Theme.reducedMotion` stops the running
indicator animation and retains its static state. The supported recipes are
`Theme.None`, `Theme.RunningIndicator`, and `Theme.MediaReadabilityScrim`.
RunningIndicator uses a conical perimeter. MediaReadabilityScrim stays dark in
either scheme. `Metrics.layerContent` and `Metrics.layerOverlay` name local
presentation stacking levels. Hidden and inactive indicators do not animate.

The named icon sizes are 14, 16, 18, and 20 logical pixels. Control radius is
6, card and overlay radius are 8, and pill radius is 999 logical pixels.
These values and border widths scale with UI scale.

Buttons own normal, hover, pressed, checked, disabled, loading, and focus
presentation. Fields keep an editable draft and emit preview, commit, and
cancel events. Escape and canceled pointer gestures restore the host's prior
value. Dialogs and popovers use the overlay surface, remain within the window,
and return focus to their trigger. See the [interface guide](README.md) for
control APIs and transaction details.

Quick and normal motion take 150 and 200 milliseconds. A full indicator cycle
takes 1000 milliseconds and tooltip delay is 500 milliseconds. Local content
and overlay stacking levels are 0 and 100. When the preference is System, the
current Qt 6.12 public-hint hosts resolve motion to Full because they do not
receive a reduced-motion system hint. An explicit Reduce preference stops
optional animation.
