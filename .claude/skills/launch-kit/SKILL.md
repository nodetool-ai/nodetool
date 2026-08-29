---
name: launch-kit
description: Produce a whole campaign in NodeTool rather than one video — entity sheets for a product and model, a set of still campaign frames, several short social cuts and a long film, all on one locked grade. Use when the user asks for a launch kit, a campaign, an asset pack, a content set, "a bunch of assets", or names several deliverables in different aspect ratios from one product. Not for a single video (use product-commercial or ugc-video).
---

**Load `/storyboard-core` first.** It carries the loop, the tool contract and
the gating this skill assumes. Everything below is what changes when the deliverable is
a set rather than a cut.

## What makes this job type its own

Every other job renders once. This one renders in four passes over days, and the thing
that must not drift between them is the **grade** and the **cast**. Consistency is the
deliverable; the individual frames are almost incidental.

So: one entity set, one board `style` string, one image model, one video model, fixed
at phase A and reused verbatim through phase D. Changing the image model mid-kit is how
a kit ends up looking like two kits.

## Run it in phases, and stop between them

Each phase ends with a report and a wait. The user approves before the next spends.

### A — Cast and lock

1. Product entity from the flat: save the asset, `create_entity {kind: "prop"}` with a
   descriptor of geometry and finish. Keep the other angles (three-quarter, back, top,
   on-figure) as plain assets — only the first reference image rides into a prompt.
2. Character entity from the on-body photo. Descriptor is face, hair and build, with
   **no wardrobe** — wardrobe belongs in shot text so the same person can change
   outfits across the kit.
3. Optionally a style entity: `create_entity {kind: "style", palette}`. A style entity
   applies to every shot on every board, which is exactly what a kit wants.
4. `find_model` once each for `text_to_image` and `image_to_video`. Write them and the
   entities onto the board with `set_board`.
5. `memory_save` the grade, the model ids, the board id and the entity ids, with the
   ids in `resources`. This is what makes the kit resumable next week — `share_result`
   would be discarded with the run.

Report: entity ids, the grade string, both model ids. Stop.

### B — Still campaign frames

Twelve or so, mixed crops, on-figure and product-only. This is stills-only mode from
the core loop: run through take selection and **stop before clips**.

Vary the crop in `camera.framing` and repeat it in `action`, since only framing reaches
the still prompt. Give product-only frames an explicit `entity_ids` naming the product
alone, so the model's descriptor does not season a frame she is not in.

Report the approved asset ids. Stop.

### C — Social cuts

Three vertical clips, 6–8 seconds, animated from **stills the user already approved in
B**. Do not re-render those stills; a new still is a new look.

A separate board per aspect ratio — `aspect_ratio` is a board field, not a shot field,
so one board cannot serve 9:16 and 16:9. Same entities, same style, same models on each.

Report clip asset ids. Stop.

### D — The long film

One 30-second 16:9 piece, slugged and timed. Assemble it, then finish the sound:
`edit_timeline` → `get_state`, then `set_clip_params {muted: true}` on the "Shot Audio"
clips under any voiceover, and add music with `generate_music` + `add_track` +
`add_media_clip` at a low `volumeDb`.

`validate_timeline` before calling it done.

## Spend

Report shot and frame counts per phase before each render — never a dollar figure, as
nothing prices a render. Afterwards, `get_cost_summary` gives what the kit actually
cost.

A twelve-frame still pass is cheap; three clip passes plus a 30-second film is not.
If the user is deciding, that is the ratio to tell them.

## Recovering a kit later

`list_storyboards` shows shot counts and how many shots have a still and a clip.
`memory_search` finds the phase-A note with the grade and the entity ids. Together
those are enough to resume without re-deriving the look.

## Brief

```
Launch kit for [BRAND] [SKU] from the attached flat and on-body photos.
Stop after each phase and wait for me.

A. Cast and lock. Product entity from the flat (descriptor = geometry and
   finish). Character entity from the on-body photo (descriptor = face, hair and
   build, no wardrobe). Pick one image model and one video model with find_model
   and write both onto the board. Grade: [cold film / warm daylight / black
   studio]. memory_save the grade, both model ids and every entity id.
B. Twelve still campaign frames, mixed crops, on-figure and product-only. Stills
   only — stop before clips. Product-only frames get entity_ids naming the
   product alone.
C. Three 9:16 clips, 6-8s, animated from stills I approved in B. Do not
   re-render those stills. A separate board for the vertical ratio.
D. One 30s 16:9 film, slugged and timed. Assemble, mute the Shot Audio clips
   under the voiceover, add a music bed low, then validate_timeline.

Same grade and the same two models from A through D. Report counts before each
render, not dollars.
```
