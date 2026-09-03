---
name: caption-titles
description: Add a consistent, timed text layer to an existing picture-locked NodeTool timeline. Use for titles, lower-thirds, captions, callouts, and end cards, not workflow building or video rendering.
---

# Caption & Titles → Timeline Agent

Work directly with timeline capabilities and open-timeline tools. Do not build a workflow, fabricate a cut, or render video.

`motion-graphics` carries the op contract for every call named here. `motion-principles` gives the entry and exit durations and easing behind each tier's presets, `frame-composition` fixes the safe inset and where a tier sits, and `logo-reveal` owns the brand mark at the head or tail.

## Hard gate

List and read the selected timeline first. It must contain picture clips. If it is missing or empty, stop and ask for a real cut; route users to storyboard or script-to-timeline work instead. Snapshot the timeline before editing with `create_timeline_version`.

## Lock one type system before adding text

Resolve type family and tier weights, five size tiers as fractions of frame height, text/accent/scrim palette, safe inset and maximum width, and per-tier motion presets. Prefer a supplied brand kit, then existing text on the timeline, then a platform-safe system. Keep these tiers consistent: T1 title/end card, T2 lower-third, T3 captions, T4 callouts, T5 CTA.

Each tier has a shipped composition. Insert it with `{"op": "insert_composition", "composition_id": "<id>", ...}` and override its `params` rather than building the rig from bare clips — the timing and motion inside it are already balanced.

| Tier | Composition id |
|---|---|
| T1 title | `title-card` |
| T2 lower-third | `lower-third` |
| T3 captions | `caption-bar` |
| T4 callouts | `callout` |
| T5 CTA / end card | `cta-end-card` |

A brand mark at the head or tail is `logo-sting`.

Every live-picture T2–T4 element gets a matching scrim unless the plate is demonstrably controlled.

## Caption map

Write the timed map before editing: tier, exact text, start/end, position, and scrim. Caption duration is at least `max(1200ms, words × 350ms)`. Titles/end cards hold at least 2000ms. Lower-thirds arrive about 500ms after a person appears and hold 2500–4000ms. One text idea per frame. Unknown facts use `[INPUT NEEDED: …]`.

## Build and verify

Add separate overlay and subtitle tracks. For each map item, add scrim before text, apply the locked tier style, then animate it with that tier’s entry and exit preset. No hard cut-on. Use stagger only for tone-appropriate kinetic captions. Keep all text within safe margins and clear of faces and product moments. Re-read timeline state and verify timing, reading floors, scrim ordering, single CTA at the end, and structural timeline validation. Stop after authoring the text layer unless rendering is requested.
