---
name: launch-kit
description: "Produce a NodeTool campaign with shared product and cast entities, stills, and multiple video cuts. Use for a coordinated asset set."
---

**Load `/storyboard-core` first.** It carries the loop, the tool contract and
the gating this skill assumes. Everything below is what changes when the deliverable is
a set rather than a cut.

## What makes this job type its own

Keep the grade and cast consistent across the requested campaign deliverables.
Use the passes below as an organizing pattern, scaled to the brief.

So: one entity set, one board `style` string, one image model, one video model, fixed
at phase A and reused verbatim through phase D. Changing the image model mid-kit is how
a kit ends up looking like two kits.

## Produce the requested campaign

Use phases as progress checkpoints. Continue within the authorized deliverables
and budget. Pause for a user-requested review or a missing decision that changes
the output or spending scope. Do not reconfirm authorization already given.

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

Report entity ids, the grade, and model ids. Continue with the requested assets.

### B — Still campaign frames

Produce the requested number and mix of stills. Use take selection when the user
reserved that choice. A stills-only request ends here. Otherwise continue to the
authorized video deliverables with the selected frames.

Vary the crop in `camera.framing` and repeat it in `action`, since only framing reaches
the still prompt. Give product-only frames an explicit `entity_ids` naming the product
alone, so the model's descriptor does not season a frame she is not in.

Report the selected asset ids and continue within the requested scope.

### C — Social cuts

Use the brief's clip count, durations, and ratios, animated from the selected
phase-B stills. Honor any requested approval of those stills. Reuse them to keep
the look consistent.

A separate board per aspect ratio — `aspect_ratio` is a board field, not a shot field,
so one board cannot serve 9:16 and 16:9. Same entities, same style, same models on each.

Report clip asset ids. Continue if the requested kit includes a longer film.

### D — The long film

Build the longer piece at the requested duration and aspect ratio, with stable slugs and timing. Assemble it, then finish the sound:
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

Adapt these examples to the user's brief. Example deliverables, style choices,
and approval checkpoints apply only when the user adopts them.

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
