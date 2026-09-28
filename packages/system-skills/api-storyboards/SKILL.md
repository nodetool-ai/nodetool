---
name: api-storyboards
description: "Call nodetool.storyboards from a code action: create a storyboard, write and reorder its shots, set the board's style, entities and models, render stills and clips, revise a clip, and assemble the board into a timeline. Load before the first call into nodetool.storyboards."
---

# nodetool.storyboards

A storyboard turns a brief into shots: an action, a camera, a motion and a
duration for each, with cast entities. Stills are the cheap step, clips the
expensive one, and the board assembles into a timeline. The directing
contract is `storyboard-core`. The brief shapes are the board skills
(`commercial-beat-sheet`, `explainer-storyboard`, `music-video-treatment`,
`trailer-template`, and the job skills such as `product-commercial` and
`short-film`). Search for them with `list_skills`.

| Call | Does | Answers |
| :--- | :--- | :--- |
| `list({limit})` | Lists boards, newest first, with shot, still and clip counts. | Board rows |
| `create(name, {brief, style, aspect_ratio, project_id, id})` | Creates a blank board. `aspect_ratio` defaults to `"16:9"`. `style` is added to every shot prompt. | `{id, storyboard_id, …}` |
| `get(id)` | Reads the brief, style, aspect ratio, models, and every shot with its id, index, slug, action, camera, motion, duration, status, `has_still`, `has_clip` and `covered_by`. | The board |
| `edit(id, ops)` | Applies ops in order and saves. It spends nothing. | The result of each op |
| `renderStills(id, {targets, provider, model, style, stale_only, concurrency})` | Makes keyframe stills with the image model. | The stills it made |
| `renderClips(id, {targets, provider, model, resolution, mode, stale_only, concurrency})` | Makes clips with the video model. This is the expensive step. | The clips it made, and the shots it skipped |
| `reviseClip(id, target, instruction, {provider, model})` | Changes one clip with a video-to-video edit: "make it darker, add rain". | The new take |
| `assembleTimeline(id, {name, fps})` | Lays the rendered clips end to end into a timeline. | The timeline id, and what it skipped |

`targets` and `target` take a shot id, a 0-based index or a slug. Omit
`targets` to render every shot that needs the step.

## Ops

| Op | Arguments |
| :--- | :--- |
| `add_shot` | `action`, `slug?`, `camera?`, `motion?`, `dialogue?`, `narration?`, `duration_seconds?`, `duration_source?`, `render_mode?`, `entity_ids?`, `location_id?`, `covered_by?`, `notes?`, `index?` |
| `update_shot` | `target` and the same fields |
| `remove_shot`, `duplicate_shot` | `target` |
| `reorder_shot` | `target`, `index` |
| `move_shot` | `target`, `scene_id?`, `position` (0-based inside the scene) |
| `set_board` | `brief?`, `style?`, `aspect_ratio?`, `entity_ids?`, `image_model?`, `video_model?` |
| `set_setup` | `brief?`, `genre?`, `stage?` |
| `set_style` | `entity_id` (a style entity becomes the board preset) or `style` (the descriptor alone) |
| `create_scene`, `update_scene`, `merge_scene` | `after_scene_id?`; `scene_id`, `slugline?`, `lighting?`; `scene_id` |
| `select_version`, `delete_version` | `target`, `kind`, `version` (0-based, oldest first) |
| `add_keyframe_version` | `target`, `asset_id`, `flip_of?` |

- `image_model` and `video_model` take a model object from
  `nodetool.models.pick` and become the render defaults of the board.
- `covered_by: {shot_id, start_seconds?, end_seconds?}` says that this shot's
  picture is a window into another shot's clip, for one generation whose
  length covers several beats. The covered shot counts as rendered. Pass
  `null` to undo it.

## Render modes

A shot renders the way its `render_mode` says, or the way `mode` says for one
call:

- `keyframe` (default) animates the selected still with `image_to_video`. A
  shot with no still is reported, not rendered. Render its still first.
- `direct` makes the clip from the prompt with `text_to_video`. No still is
  needed.
- `reference` uses the reference images of the cast entities with
  `reference_to_video`.

Earlier stills and clips are kept as versions. `stale_only: true` renders
only shots whose current version was made against a style, model, aspect
ratio or prompt they no longer have.

## The loop

```js
const { id } = await nodetool.storyboards.create("Lamp launch", { brief, style });
await nodetool.storyboards.edit(id, [
  { op: "set_board", image_model: await nodetool.models.pick("text_to_image"),
    video_model: await nodetool.models.pick("image_to_video") },
  { op: "add_shot", action: "Wide of the lamp on a desk at dusk", duration_seconds: 4 },
  { op: "add_shot", action: "Close on the switch as a hand reaches in", duration_seconds: 3 }
]);
await nodetool.storyboards.renderStills(id);   // cheap: look at them first
// … view the stills, fix shots with update_shot, render again with stale_only …
await nodetool.storyboards.renderClips(id);    // expensive
const cut = await nodetool.storyboards.assembleTimeline(id);
```

When the board links a script, assembly times each shot to the takes it
covers and adds a voiceover clip for each voiced line. Validate the timeline
with `nodetool.timelines.validate` before a render.
