---
name: api-timelines
description: "Call nodetool.timelines from a code action: create, read, edit or write a whole timeline, study the shipped example timelines, validate at the showcase tier, preview composited frames and contact sheets, compare versions, render the cut, manage versions and insert reusable compositions. Load before the first call into nodetool.timelines."
---

# nodetool.timelines

A timeline is a sequence: tracks of clips — media, text, shapes, groups, 3D
models and MIDI — with animations, transitions, masks, mattes, effects and
markers. This skill is the call reference and the build loop. The op
contract, the animation roles and the preset catalog are `motion-graphics`.
The craft is in `motion-direction`, `motion-principles`, `motion-curves`,
`frame-composition`, `color-motion` and `beat-sync-editing`.

## Calls

| Call | Does | Answers |
| :--- | :--- | :--- |
| `list({query, limit})` | Lists sequences, newest first. | `{timelines}` |
| `create(name, {fps, width, height, project_id})` | Creates an empty sequence. The defaults are 30 fps and 1920×1080. Vertical is 1080×1920. | `{timeline_id, …}` |
| `get(id)` | Reads the stored document: fps, size, duration, tracks, clips, markers. | The document with its metadata |
| `edit(id, ops)` | Applies up to 60 ops in order and saves. | `{applied, failed, ops, tracks, clips}`. Each entry of `ops` has its own `ok`. |
| `setDocument(id, document, {fps, width, height, expected_updated_at, snapshot_name})` | Writes a whole document. It is validated first and snapshotted before the write. | The validation of what landed |
| `validate(idOrDocument, {tier, normalize, fps, width, height})` | Checks the structure without a render. | `{ok, issues}` |
| `preview(idOrDocument, opts)` | Composites real frames. | Frames with image handles and layer reports, or one contact sheet |
| `compare(a, b, {times_ms, range, width})` | Differences the pixels of two sides. | A difference from 0 to 1 per frame, and a side-by-side sheet |
| `render(id, opts)` | Renders the cut to a video file as a job. | `{job_id}`, or the asset with `wait: true` |
| `versions(id, {save_type, limit})`, `getVersion(id, n)` | Lists and reads snapshots. | Version rows, newest first |
| `snapshot(id, {name})` (also `createVersion`) | Saves a manual version. Manual versions are never pruned. | The version number |
| `restore(id, n)` | Rolls back. The state it replaces is snapshotted first, and the result is validated. | The findings |
| `deleteVersion(id, n)` | Deletes one snapshot. This cannot be undone. | — |
| `examples.list({query})` | Lists the shipped example timelines. | Slugs, stats, poster and video locators |
| `examples.get(slug, {scene_id, clip_offset, clip_limit})` | Reads one example scene. | Metadata, a scene catalog and a bounded excerpt |
| `compositions.list({source, query, limit})`, `compositions.get(id)` | Lists and reads templates: title card, lower third, caption bar, callout, CTA end card, logo sting, and the user's own. | Rows with their parameters |
| `compositions.save(timelineId, groupTarget, name, params, {description})` | Saves a group as a template. | The composition id |
| `compositions.remove(id)` | Deletes a saved template. | — |

## Coordinates and units

- `transform.position.x/y` is in sequence pixels from the frame **centre**.
  Positive x moves right and positive y moves down. This holds for every
  clip, text and shapes included.
- Shape geometry `shape.x/y/width/height` is in 0..1 fractions of the frame
  from the **top-left**. It is not the transform position.
- Masks use the 0..1 space of the clip itself.
- Track order is z-order: index 0 draws on top. `add_track` appends to the
  bottom, so add the overlays last or fix the order with `move_track`.
- Times are in milliseconds. Custom-curve keyframes use `t` from 0 to 1 over
  the window of the animation.

## Three ways to build

1. **In code, for motion graphics.** Import `@nodetool-ai/sandbox-timeline`:
   scenes of shapes, text and images, keyframed in frames, and saved with
   `saveTimeline` in one call. Read `nodetool.packs.docs("@nodetool-ai/sandbox-timeline")`
   first. This is the path for a dense, layered piece.
2. **`setDocument`**, for a whole document you already hold. It replaces the
   stored document field for field, so read `get(id)` and send it back
   changed. Missing bookkeeping is filled in: track `index`, `visible`,
   `locked`; clip `sourceType`, `status`, `locked`, `versions`; animation and
   effect ids; `markers`. Pass `expected_updated_at` to refuse the write when
   someone changed the timeline after you read it.
3. **`edit(id, ops)`**, for targeted changes. Start with `{op: "get_state"}` to
   read the ids. Check `failed` and the `ok` of each entry in `ops` before a
   dependent edit. A batch
   can save its good ops even when a later one fails.

```js
await nodetool.timelines.edit(id, [
  { op: "add_track", type: "audio", name: "Music" },
  { op: "add_text_clip", text: "Hi", startMs: 0, durationMs: 2000 },
  { op: "animate_clip", target: "Hi", animations: [{ role: "in", preset: "fade" }] },
  { op: "set_effects", target: "Hi", effects: [{ type: "blur", radius: 8 }] }
]);
```

Existing media goes on with `{op: "add_media_clip", asset: "asset://<id>.mp4"}`,
which appends after the last clip on the track. One call for each asset lays
them end to end. `set_effects` replaces the whole chain, and an unknown effect
parameter is refused.

## The loop: validate, look, fix

1. **Study an example** before a showcase piece. `examples.list()`, then
   `examples.get(slug)` for the scene catalog, then
   `examples.get(slug, {scene_id})` for one scene. Page long scenes with
   `clip_offset: next_clip_offset` until `truncated` is false. Return only
   the fields you study; the excerpts are large.
2. **Validate.** `validate(id, {tier: "showcase"})` adds warnings about the
   count of scene groups, custom animations per visible second, effect
   variety, clip density, fast motion without blur, the finish, camera depth
   and concurrent layers. Each warning names an example. Warnings do not
   change `ok`. For an inline document, pass `normalize: true` to fill in the
   bookkeeping as `setDocument` does.
3. **Look.** Validation cannot judge the picture. Preview real frames:
   - `times_ms` (up to 8) or `count` (default 3) for single frames.
   - `range: {from_ms, to_ms, count}` (up to 24) to sweep a move, with
     `sheet: true` for one labelled contact sheet.
   - `width` (default 640, max 1280) and `motion_blur_samples` with
     `shutter_angle`.
   - The sheet comes back as `sheet.image`. Pass its `asset_id` to
     `view_image`. Without a sheet, each frame has its own `image`.
   - Sample the middle of an animation, not its ends.
   - A frame's `degraded` list names where the preview draws differently from
     the export, and `effects_not_applied` names effects it cannot draw.
4. **Fix and compare.** After a change nobody asked for, run
   `compare({timeline_id: id, version: n}, id)` to prove which frames it
   touched. A difference of 0 everywhere means the edit was cosmetic.
5. **Render** before you call the cut done. `render(id, {preview_scale: 0.5})`
   is a fast draft. `wait: true` blocks up to `timeout_ms` (default 180000,
   clamped to 300000). On a timeout the job keeps going; wait on it with
   `nodetool.jobs.wait(job_id)`.

## Render options

`format` is `mp4` (default), `webm`, `mov` or `png_sequence`. Only `webm`,
`mov` and `png_sequence` carry `alpha`. Also `video_codec`, `bitrate` (a
number or `"8M"`), `motion_blur_samples` with `shutter_angle`,
`include_audio` (default true) and `preview_scale`.

## Documents from other surfaces

A storyboard or a script assembles into a timeline of its own media
(`nodetool.storyboards.assembleTimeline`, `nodetool.scripts.assembleTimeline`).
For anything else, create your own timeline instead of editing one the user
has open.
