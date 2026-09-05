---
name: music-video-treatment
description: Turn confirmed track metadata into a shootable, beat-synced music-video treatment and NodeTool storyboard. Use for music videos and promos, not workflows, pipelines, or finished renders.
---

# Music Video Treatment → Storyboard Agent

Create a complete, shootable music-video treatment as a NodeTool storyboard. Work directly through storyboard and entity capabilities. Do not build a workflow or pipeline. Do not render or assemble a timeline unless asked.

## Brief and truthfulness

Require artist and persona, track title, genre, BPM, time signature, track length, a timecoded section map, performance-to-narrative ratio, platform, tone, and any mandatory or forbidden content. BPM and section map are hard inputs. If neither a section map nor audio is available, ask rather than invent bar counts. Mark unknown artist, label, release, lyric, or production facts as `[ARTIST INPUT NEEDED]`.

## Entity roster

Resolve the roster before drafting sections: user references first, then `list_entities`, then generate only missing references. The artist is always a character entity and a provided press image is never regenerated. Resolve style first; apply it to generated artist, locations, and props. Keep a typical roster to 4–7 entities: style, artist, 1–2 locations, and 0–2 signature props. Show the roster and flag a generated artist as a stand-in before treatment drafting.

## Music grid and treatment

Compute seconds per bar as `(60 / BPM) × beats per bar`, convert every section into bars and timecodes, and make every transition land on a bar, beat, or lyric. Build three distinct directions with a performance/narrative ratio, repeatable chorus hook shot, drop event, risk, and entity roster. Recommend one in two sentences or fewer.

For each section, provide timecode and bar range, musical and visual jobs, framing, lens/angle, movement, visual/action, sync point, entities, performance, lyric text when applicable, lighting, grade/effect, transition, and why it cuts. Interleave performance and narrative. The biggest event lands on the drop or first chorus downbeat; every chorus repeats the hook shot; include one deliberate rhythmic break before the final chorus; the outro echoes the intro.

## Persist the board

Create a storyboard with `create_storyboard({ name, brief, style, aspect_ratio })`, using `storyboard_id` from its result, never `.id`. Put the full brief, lyrics, section map, bar grid, and roster in `brief`. The call shapes every board skill shares — entity id equals the asset id you passed in, the five `edit_storyboard` ops, what `set_board` accepts, what text the generator actually reads — are in `commercial-beat-sheet` § Tool contract.

Attach entity ids with `edit_storyboard({ storyboard_id, ops: [{ op: "set_board", entity_ids, image_model, video_model }] })` (`set_entities` is only an alias). The two models are the `.ref` of a `find_model` call each, for `text_to_image` and `image_to_video`; load the `prompting_skill` each one names before writing shot text, since `motion` then `action` is the clip prompt verbatim and a performance section is worded differently for Kling's shot list, Hailuo's ordered beats or Seedance's sound brief.

Add one `add_shot` op per section. Each action names visible entities in brackets, includes its sync point, and uses the section duration rounded to 0.5 seconds. The render attaches the artist or a prop to a shot only when its name appears in that shot's text (style and location always apply), so the artist's name goes in every performance shot, or on that shot's own `entity_ids`. Lyric text on screen is a note for the cut and goes on as a text clip after assembly (`caption-titles`), not into the render prompt.

Stop at the planned board unless asked to render. Report the directions, selected treatment, and entity roster.

## Render (only on request)

Stills first with `render_storyboard_stills`; look at each with `view_image` asking what is wrong, and fix a drifting artist at the entity, never in one shot's prompt. Clips with `render_storyboard_clips`; ask for longer clips than the section needs (bump `duration_seconds` with `update_shot`, restore after) so the cut has frames to choose from on the beat. A clip wrong where its still was right is one `revise_storyboard_clip`. Then `assemble_storyboard_timeline`.

## When the treatment becomes a cut

The bar grid computed above is the plan; `beat-sync-editing` derives the real one from the track with `detect_audio_events` and snaps the cuts to it, so the two must agree before anything is trimmed. The track is the continuity here, so section clips render separately and mute their own audio — `video-audio-continuity` for the case where a piece has no track of its own. `motion-graphics` carries the timeline op contract, `color-motion` the per-section grade and any colour that moves on the drop, `frame-composition` the repeated hook framing across choruses, and `caption-titles` any lyric or artist card on screen.
