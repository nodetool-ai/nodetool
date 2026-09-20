---
name: nodetool-video-post
description: "Repair or re-generate footage already on a NodeTool timeline: cutouts, tracking, outpainting, upscaling, generated sound, voice replacement, lip sync. Covers the candidate review protocol these return."
---

# Post on a saved timeline

Footage already exists and something about it has to change. These tools act on
one clip of a **saved** timeline sequence, not on a storyboard shot and not on a
loose asset.

Directing a new piece belongs to `storyboard-core`
and its job skills. Cutting, animating, transitions and titles belong to the
`motion-graphics` system skill: load it with
`load_skill {name: "motion-graphics"}` before the first `edit_timeline` call, as
it carries the full op list, the presets and the preview contract.

## Pick the operation

| The problem | Tool | What it writes |
|---|---|---|
| Replace what is behind the subject | `isolate_subject` | A `generatedMatte` on that clip |
| Make another clip follow a moving subject | `track_object` | A document-level track others `bind_to_track` |
| The frame is the wrong aspect ratio | `expand_frame` | An inactive video candidate |
| The footage is too soft or too small | `upscale_video` | An inactive video candidate |
| The shot has no sound | `video_to_audio` | An aligned inactive audio candidate |
| The recorded voice is wrong | `recorded_voice_replacement` | An inactive audio candidate |
| The mouth does not match the new audio | `lip_sync` | An inactive video candidate |
| A title or shape should move with the music | `bake_audio_animation` | A `custom` animation on the target clip |

Every tool above except `bake_audio_animation` takes `provider` and `model` from
`find_model`. There is no default: an unset model fails the call rather than
spending on a model nobody chose.

## Nothing is applied until it is accepted

`expand_frame`, `upscale_video`, `video_to_audio`, `recorded_voice_replacement`
and `lip_sync` all return an **inactive candidate** with its provenance. None of
them changes the accepted take, the sequence dimensions, or the existing
framing. Applying the result is a separate, explicit step:

1. `inspect_video_production_candidates {candidates, preview?}` refreshes their
   state and optionally builds a Preview take or draft from an explicit
   destination-to-candidate `selection`. Inspection writes nothing.
2. `accept_video_production_candidates {action, batch_id, document_id,
   project_id, candidates, selection, targets}` applies one atomic manifest.
   `action` is `use_take` or `use_draft`. Each entry in `targets` carries
   `expected_target_revision`, which the server rechecks before the apply, so a
   document that moved underneath is refused rather than overwritten.

Report the candidate ids and what each one is, then let the user choose. Never
describe a candidate as applied before an `accept` returned.

## Generating a new take for a slot

A slot that needs fresh footage rather than a repair goes through the reviewed
production path, which covers all three document kinds:
`timeline_clip`, `storyboard_shot` and `script_line`.

`prepare_video_production` → `submit_video_production` → inspect → accept.

`prepare` is non-mutating. It resolves linked script speech, verifies owner,
project, target, references, capability route and timing, then freezes one to
three stable candidate identities **before** any provider spend. It requires
`review: {status: "reviewed", plan_fingerprint}` — the fingerprint of every
authoring input the reviewed plan read. The `route` is
`reference_to_video`, `text_to_video`, or `audio_driven_performance`, and
on-camera speech (`speech_mode: "on_camera"`) requires
`audio_driven_performance`. `submit` re-runs preflight and authorization and
recovers an existing request id instead of resubmitting it, so a retry after a
dropped connection does not pay twice.

## Per-tool notes

**`isolate_subject`** sends the clip's *whole* source asset and reads the mask
back at the clip's own source time, which is what lets a later trim, split or
speed change keep the cutout aligned. A clip with a current cutout is handed it
back for free unless `regenerate: true`, and a failed regenerate leaves the
working matte in place. Tune the result with the free `set_generated_matte` op
(invert, strength, feather, or an earlier version). Use `set_matte` instead for
a keyhole authored from another clip.

**`track_object`** needs `initial_region` normalized 0..1 over the source frame
plus `start_ms` and `end_ms` in absolute source milliseconds. The initial box
sits at `start_ms` for `forward` and `both`, at `end_ms` for `backward`. Box
tracks only in this build. A new run is refused before saving or spending when
the provider does not implement `track_object`.

**`lip_sync`** consumes an **accepted** `recorded_voice_replacement` candidate:
`replacement_audio {asset_id, status, provenance}`. Run the voice replacement,
accept it, then sync.

**`bake_audio_animation`** measures a clip's audio, with an envelope follower or
one pulse per onset in `mode: "beats"`, and writes a source-anchored `custom`
animation on another clip's property, commonly `scale`. The write is additive: a
hand-authored `pop` or `slide` on the same channel composes with it rather than
being replaced. A re-bake replaces only the curve it produced before.

**`source_asset_id`** on the native media tools is an optional pin captured
before the call. A mismatch is stale and the call is refused. Pass it when
anything else may be editing the document.

## Check the result

- `validate_timeline {timeline_id}` after every edit pass.
- `preview_timeline_frame {timeline_id, ...}` composites one or more timecodes
  and returns a per-layer report. It is the cheap way to see a matte, a bake or
  an accepted take without rendering. A `model3d` layer needs headless Chromium:
  with none on the host the layer is left out and reported as a
  `model3d_unavailable` degradation, never as an empty clip.
- `compare_timeline_frames` puts before and after side by side.
- `render_timeline` is the paid, final pass. Do not render to check an edit.
- Snapshot before a destructive pass with `create_timeline_version`.
  `restore_timeline_version` snapshots the pre-restore state first and
  re-validates against today's schema, so an old document may fail what it used
  to pass.

## Verify from a shell

These are the `nodetool` CLI. From a NodeTool checkout the same commands run
as `npm run dev:nodetool -- <command>`.

```bash
nodetool timeline validate <timeline_id|sequence.json> --json
nodetool timeline debug <id> --interact '[{"tool":"add_track","input":{"type":"audio","name":"Music"}}]'
nodetool timeline versions list <timeline_id> --save-type manual
```

Rendering, playback, decode and generation are not simulated by the harness. The
report says so under `notSimulated`.

## Reference

- The `storyboard-core` system skill, § Timeline of its tool contract —
  `load_skill` it for the board-to-timeline calls.

In a NodeTool checkout, these repository sources go further:

- `docs/harnesses.md` § nodetool timeline validate / debug
- `docs/harnesses.md` § Generated mattes
- `docs/harnesses.md` § Audio-driven timeline motion
