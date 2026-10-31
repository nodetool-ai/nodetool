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

The native palette uses these solid roles:

| Role | Dark | Light |
| --- | --- | --- |
| Canvas / panel | `#08090a` / `#101113` | `#f7f8f8` / `#ffffff` |
| Overlay / input | `#202226` / `#191b1f` | `#ffffff` / `#f1f2f3` |
| Primary / secondary text | `#f7f8f8` / `#b5bac3` | `#17191c` / `#535a64` |
| Disabled / on-accent text | `#858b95` / `#ffffff` | `#777d85` / `#ffffff` |
| Subtle / control border | `#454a52` / `#747b85` | `#c6cad0` / `#717883` |
| Strong / focus / error border | `#aeb5bf` / `#8ab4f8` / `#ff8383` | `#4e5661` / `#285bad` / `#b42323` |
| Accent / hover | `#3266af` / `#3267ae` | `#285bad` / `#1d498e` |
| Destructive / hover | `#a91f2a` / `#861923` | `#a91f2a` / `#861923` |
| Success / warning | `#80dca0` / `#ffd08a` | `#16713d` / `#825100` |
| Error / info | `#ff8383` / `#8ab4f8` | `#b42323` / `#285bad` |
| Warning surface / text | `#3d2b10` / `#ffd08a` | `#fff1d6` / `#825100` |
| Error surface / text | `#441d21` / `#ffb3b3` | `#ffebeb` / `#b42323` |

Action hover, pressed, selected, and disabled use respectively 8%, 16%, 12%,
and 4% white over dark surfaces, or 6%, 12%, 9%, and 4% black over light
surfaces. Media and modal scrims use 60% black. `Theme.qml` defines the same
roles in executable form. Normal primary and secondary text target
4.5:1 against the canvas, panel, input, and overlay surfaces. Text on primary,
hover, and destructive fills targets 4.5:1. Focus and control borders target
3:1 against their adjacent surfaces. The tests measure these solid pairs.
Disabled text and translucent recipes need review in their actual contexts.
Media and modal scrims remain dark in both schemes.

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
