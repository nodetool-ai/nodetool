# Agent parity inventory: music, MIDI and timeline editing

Status: C = covered before this pass, N = closed in this pass, G = gap left, X = excluded (view or session state, not a document edit).
Path: ops = `packages/timeline/src/ops` (op, parse, apply) with the contract in `packages/protocol/src/api-schemas/timeline-tool-contracts.ts`. Bridge = `packages/agents/src/capabilities/timeline-bridge.ts`. Web = `web/src/lib/tools/builtin/timeline.ts`. Every contract tool is registered on all three, and `packages/agents/tests/timeline-op-parity.test.ts` runs each fixture through bridge and op. Capability coverage: all tools run under the `edit_timeline` capability (`packages/cli-harness/src/harness/capability-table.ts`, checked by `npm run capabilities:check`, current).

| # | Area | Editor action | Status | Agent path |
|---|------|---------------|--------|------------|
T1 | Tracks | add track | C | add_track |
T2 | Tracks | insert track at index | C | add_track + move_track |
T3 | Tracks | duplicate track | G | none. Needs clip cloning with new ids and link remap. |
T4 | Tracks | remove track | C | delete_track |
T5 | Tracks | reorder tracks | C | move_track |
T6 | Tracks | name, mute, solo, lock, visible, height | C | set_track |
T7 | Tracks | channel volume, pan | C | set_track |
T8 | Mixer | track insert effects: add, update, remove, move | N | set_track `effects` (whole chain) |
T9 | Mixer | master fader | N | set_track `track: master` `volumeDb` |
T10 | Mixer | master effects: add, update, remove, move | N | set_track `track: master` `effects` |
T11 | Devices | track instrument and its parameters | C | set_track_instrument (whole instrument) |
T12 | Devices | browse instrument presets | C | list_instruments |
T13 | Tracks | track folder create and assign | N | set_track `folder` (name, null removes) |
T14 | Tracks | track folder rename, remove | G | none. `folder` creates and assigns only. |
T15 | Music | track stem role | N | set_track `musicRole` |
T16 | Tracks | track targeting, sync lock, linked selection | X | session edit mode, not stored |
T17 | Tracks | script lane toggle | X | view toggle |
T18 | Project | canvas size, fps | G | none. Stored outside the op document (`timeline.update` top-level fields). |
T19 | Project | tempo, offset, time signature | C | set_tempo |
T20 | Project | project key | N | set_tempo `key` (also fixed: a tempo change dropped the key) |
T21 | Project | audio auto crossfade length | N | set_tempo `auto_crossfade_ms` |
T22 | Project | guided flow: setup | C | set_setup |
T23 | Project | guided flow: update beat | C | update_beat |
T24 | Project | guided flow: remove beat | C | remove_beat |
T25 | Project | guided flow: plan, generate beats | C | plan_beats, generate_from_beats |
K1 | Clips | move clip or selection | C | move_clip |
K2 | Clips | trim start or end | C | trim_clip |
K3 | Clips | ripple trim, roll, slide edit | G | none. trim_clip and move_clip do not move neighbours. |
K4 | Clips | slip (source in/out) | C | set_clip_params inPointMs, outPointMs |
K5 | Clips | rate stretch, speed | C | set_clip_params speedMultiplier, durationMs |
K6 | Clips | split at playhead, cut all tracks | C | split_clip |
K7 | Clips | split keeping notes (crossing split) | C | split_clip `crossing` |
K8 | Clips | delete, ripple delete | C | delete_clip, ripple_delete |
K9 | Clips | close gap | C | close_gap |
K10 | Range | extract range | C | delete_time |
K11 | Range | lift range (clear, keep the gap) | G | none. delete_clip plus split_clip can do it clip by clip. |
K12 | Clips | duplicate, duplicate with gap | C | duplicate_clip |
K13 | Clips | repeat / loop region | C | loop_clip (CE3) |
K14 | Range | cut, copy, paste, paste insert | C | duplicate_range, paste_range (CE4) |
K15 | Range | insert silence, delete section, duplicate section | C | insert_time, delete_time, duplicate_range (CE4) |
K16 | Clips | paste attributes | G | none |
K17 | Clips | join clips | C | join_clips (CE5) |
K18 | Clips | rename | C | set_clip_params name |
K19 | Clips | label color | C | set_clip_params labelColor |
K20 | Clips | lock, unlock, enable, disable | C | set_clip_params locked, hidden, muted |
K21 | Clips | fades, apply fades, shapes | C | set_clip_params fadeIn/Out, shapes |
K22 | Clips | transitions, default transition, duration, remove | C | set_transition, apply_transition_at_cut |
K23 | Clips | opacity, blend, transform, gain, audio effects | C | set_clip_params |
K24 | Clips | mask, matte, time remap, effects, reframe | C | set_mask, set_matte, set_time_remap, set_effects, reframe tools |
K25 | Clips | keyframe presets and custom curves | C | animate_clip, clear_animations, set_baked_animation |
K26 | Clips | keyframe diamonds: add, move, remove one keyframe | G | none. animate_clip rewrites whole curves. |
K27 | Clips | link, unlink clips | G | none |
K28 | Clips | group, ungroup | C | add_group, set_parent |
K29 | Clips | add media, text, shape, 3D, generated clips | C | add_media_clip, add_text_clip, add_shape_clip, add_model3d_clip, generate_clip |
K30 | Clips | regenerate, takes: select, rename, delete | C | set_clip_binding, apply_take, select_take, rename_take, delete_take |
K31 | Clips | replace clip asset | G | none |
K32 | Clips | source monitor insert, overwrite | G | none. add_media_clip appends or places at a time. |
K33 | Clips | detect beats, set tempo from clip | C | set_markers_from_beats, snap_to_beats, set_tempo |
K34 | Markers | add, delete marker, scene marker | C | add_marker, delete_marker |
K35 | Markers | mark in, mark out, locators | X | transport range, not document |
K36 | View | playhead, selection, tool, zoom, scroll, snap, panels, workspaces, shuttle, play | X | view and transport state (seek, select_clip exist but only move view state) |
R1 | Region | transpose | C | set_clip_params transpose (CE6) |
R2 | Region | velocityOffset | C | set_clip_params velocityOffset (CE6) |
R3 | Region | quantize (grid, strength) | C | set_clip_params quantize (CE6) |
R4 | Region | label color | C | set_clip_params labelColor |
R5 | Region | rename | C | set_clip_params name |
R6 | Region | loop | C | loop_clip |
R7 | Region | arp, comp, scale snap | C | set_clip_harmony |
P1 | Piano roll | draw, erase, move, resize, split, duplicate notes | C | set_notes (whole list, full fidelity) |
P2 | Piano roll | copy, cut, paste notes | C | set_notes |
P3 | Piano roll | per-note velocity, channel, release velocity | C | set_notes |
P4 | Piano roll | expression lanes (pitch, volume, pan, brightness) | C | set_notes `expression` |
P5 | Piano roll | scale velocity | C | scale_velocity; N for a selection (`note_ids`) |
P6 | Piano roll | transpose | C | transpose_clip; N for a selection (`note_ids`) |
P7 | Piano roll | quantize | C | quantize_notes; N for `swing` and `note_ids` |
P8 | Piano roll | scale quantize | N | set_notes `function: scale_quantize` |
P9 | Piano roll | force legato | N | set_notes `function: legato` |
P10 | Piano roll | remove overlaps | N | set_notes `function: remove_overlaps` |
P11 | Piano roll | delete duplicates | N | set_notes `function: delete_duplicates` |
P12 | Piano roll | glue notes | N | set_notes `function: glue` |
P13 | Piano roll | mute, unmute notes | N | set_notes `function: mute, unmute` |
P14 | Piano roll | delete selected notes | N | set_notes `function: delete` |
P15 | Piano roll | set velocity on selection | N | set_notes `function: set_velocity` |
P16 | Piano roll | controller lanes: CC, pitch bend, pressure, interpolation | N | set_notes `controllers` |
P17 | Piano roll | read notes and lanes back | N | get_state `clip` |
P18 | Piano roll | select all, following, same pitch, muted, invert | X | selection state |
P19 | Piano roll | note names off, scale highlight, grid, lane heights, quantize settings | X | view state |
S1 | Step editor | toggle, draw, erase steps; step velocity, length | C | set_notes |
S2 | Step editor | row mute | N | set_notes `function: mute` with `pitches` |
S3 | Step editor | controller lane steps | N | set_notes `controllers` |
S4 | Step editor | lane set (Automatic, GM Drums), step size | X | view state, rows derive from notes |
H1 | Chords | add, edit, delete chord | C | set_chords, clear_chords |
H2 | Chords | progressions: browse, apply | C | list_progressions, apply_progression |
H3 | Chords | transpose chords, detect chords | C | transpose_chords, detect_chords |
H4 | Chords | key | N | set_tempo `key` |
H5 | Chords | time signature | C | set_tempo |
H6 | Chords | fit notes to chords | C | fit_notes_to_chords |
H7 | Chords | clip harmony (comp, arp) | C | set_clip_harmony, list_harmony_presets |
H8 | Chords | chord snap, numeral display | X | view state |
A1 | Automation | add, delete lane | N | set_track `automation` |
A2 | Automation | add, move, delete points; multi-select move, delete | N | set_track `automation` (lane points replaced whole) |
A3 | Automation | easing, bend | N | set_track `automation` point `easing` |
A4 | Automation | enable, disable lane | N | set_track `automation` `enabled` |
A5 | Automation | modes off, read, touch, latch, write | N | set_track `automationMode` |
A6 | Automation | device and clip parameter lanes | N | set_track `automation` target kind device, clip |
A7 | Automation | record a pass while playing | X | live gesture, its document effect is A2 |
A8 | Automation | show lanes, lane heights | X | view state |
M1 | Mixer | fader, pan, mute, solo | C | set_track |
M2 | Mixer | metronome, loop toggle, transport | X | transport state |
