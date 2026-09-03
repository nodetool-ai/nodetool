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

Create a storyboard with `create_storyboard({ name, brief, style, aspect_ratio })`, using `storyboard_id` from its result. Put the full brief, lyrics, section map, bar grid, and roster in `brief`. Attach entity ids with `edit_storyboard({ storyboard_id, ops: [{ op: "set_board", entity_ids }] })`; `set_entities` does not exist. Add one `add_shot` op per section. Each action names visible entities in brackets, includes its sync point, and uses the section duration rounded to 0.5 seconds.

Stop at the planned board unless asked to render. Report the directions, selected treatment, and entity roster.

## When the treatment becomes a cut

The bar grid computed above is the plan; `beat-sync-editing` derives the real one from the track with `detect_audio_events` and snaps the cuts to it, so the two must agree before anything is trimmed. `motion-graphics` carries the timeline op contract, `color-motion` the per-section grade and any colour that moves on the drop, `frame-composition` the repeated hook framing across choruses, and `caption-titles` any lyric or artist card on screen.
