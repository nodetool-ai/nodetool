---
name: caption-titles
description: Add a consistent, timed text layer to an existing picture-locked NodeTool timeline. Use for titles, lower-thirds, captions, callouts, and end cards, not workflow building or video rendering.
---

# Caption & Titles → Timeline Agent

Work directly with timeline capabilities and open-timeline tools. Do not build a workflow, fabricate a cut, or render video.

`motion-graphics` carries the op contract for every call named here. `motion-principles` gives the entry and exit durations and easing behind each tier's presets, `frame-composition` fixes the safe inset and where a tier sits, `color-motion` the scrim and contrast fixes when type does not read, and `logo-reveal` owns the brand mark at the head or tail.

## Type is post, never a render prompt

Every board skill and every video prompting skill sends its on-screen copy here. A title card, a super, a lyric or a CTA is a text clip on the timeline, not words in a `generate_video` or `generate_image` prompt: generators letter unreliably, and copy baked into pixels cannot be corrected, translated or re-timed. When a board's shot `action` carries `Text: …`, that is the caption map's input, and the render prompt should not have asked for it.

## Hard gate

List and read the selected timeline first. It must contain picture clips. If it is missing or empty, stop and ask for a real cut; route users to storyboard or script-to-timeline work instead. Snapshot the timeline before editing with `create_timeline_version`.

Read `fps`, `width` and `height` off `get_timeline` before setting a size: `fontSizePx` is authored against the sequence resolution, and the tiers below are fractions of `height`.

## Lock one type system before adding text

Resolve type family and tier weights, five size tiers as fractions of frame height, text/accent/scrim palette, safe inset and maximum width, and per-tier motion presets. Prefer a supplied brand kit, then existing text on the timeline, then a platform-safe system. Keep these tiers consistent: T1 title/end card, T2 lower-third, T3 captions, T4 callouts, T5 CTA.

The family is one NodeTool ships — `Inter`, `Space Grotesk`, `Bebas Neue`, `Playfair Display`, `Lora`, `JetBrains Mono` — or every host resolves it against its own installed fonts, the editor and the render disagree on line widths, and `validate_timeline` reports `font_not_portable`. Sizes below 2.5% of frame height report `text_illegible`; body copy sits at 2.5–4%. `motion-direction` holds the same rule for the whole piece, so when a motion language already exists, take its type family rather than picking a second one.

Motion per tier follows `motion-principles`: `fade` or `slide` in at 300–500ms, out at 200–300ms, role-default easing. Stagger only on a T1 or a kinetic T3 line of five words or fewer, and work out the span (`durationMs + offsetMs × (words − 1)`) against the clip — a span that does not fit is compressed silently and only `stagger_compressed` says so.

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

Add separate overlay and subtitle tracks. For each map item, add scrim before text, apply the locked tier style, then animate it with that tier’s entry and exit preset. No hard cut-on. Use stagger only for tone-appropriate kinetic captions. Keep all text within safe margins and clear of faces and product moments.

Two facts about stacking decide whether the text is seen at all. The lowest track `index` draws on top, so the scrim's track index sits between the picture's and the text's — picture, scrim, text, in descending index. And word-level captions generated from a voiceover clip composite above every real track regardless of where that clip sits, so no title can cover them: time a T1 around the narration rather than over it.

Verify in two passes, and they answer different questions. `validate_timeline` reads the document: `text_illegible` (size, or under 3:1 contrast against the text's own `background` plate or a full-frame shape behind it), `font_not_portable`, `stagger_compressed`, `animation_exceeds_clip`, overlaps, and clips shorter than a frame. Its contrast check refuses to guess — a translucent scrim, gradient type or a plate it cannot prove is behind the text produces no finding — so a silent pass is not a pass. Then `preview_timeline_frame` at each item's entry midpoint, a held moment, and its exit: that is where text over a busy plate, a scrim covering a face, or a caption still finishing when its clip ends shows up. Re-read the map against the frames: timing, reading floors, scrim ordering, one CTA at the end. Stop after authoring the text layer unless rendering is requested.
