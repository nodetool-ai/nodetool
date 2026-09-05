# Tool contract

Exact arguments. Every field named here is checked in the implementation; an
unrecognized field is **refused with an error**, not dropped.

## Storyboard — headless

Work with no editor open. Shot `target` = shot id, 0-based index as a string, or slug.

| Tool | Arguments |
|---|---|
| `list_storyboards` | `limit?` → id, name, shots, with_keyframe, with_clip, timeline_id, updated_at |
| `create_storyboard` | `name` (required), `brief?`, `style?`, `aspect_ratio?` (default `16:9`), `project_id?`, `id?` |
| `get_storyboard` | `storyboard_id` → brief, style, aspect ratio, narration, music_prompt, image_model, video_model, script link, and every shot with id/index/slug/action/camera/motion/duration/status/has_keyframe/has_clip/covered_by |
| `edit_storyboard` | `storyboard_id`, `ops[]` — see below |
| `render_storyboard_stills` | `storyboard_id`, `targets?`, `provider?`, `model?`, `style?`, `concurrency?` |
| `render_storyboard_clips` | `storyboard_id`, `targets?`, `provider?`, `model?`, `resolution?`, `mode?` (`keyframe`\|`direct`), `concurrency?` |
| `revise_storyboard_clip` | `storyboard_id`, `target`, `instruction`, `provider?`, `model?` |
| `assemble_storyboard_timeline` | `storyboard_id`, `name?`, `fps?` (default 30) |
| `extract_script_from_storyboard` | `storyboard_id`, `name?`, `relink?` |
| `delete_storyboard` | `storyboard_id` |

Render limits: **24 shots per call**, `concurrency` default 3, max 8.

Omitting `targets` selects every shot that still needs that step. For stills that is
every shot with no keyframe that is not set to render directly; for clips, every shot
with no picture — its own or one it is covered by (§ Fusing shots). A `keyframe`-mode
shot that reaches `render_storyboard_clips` with no
still is reported in the results, not rendered — render its still first, or set its
`render_mode` to `direct`. Each render appends to `keyframe_versions` /
`clip_versions` and makes the new one selected.

### `edit_storyboard` ops

`{"op": "add_shot", ...}` · `update_shot {target, ...}` · `remove_shot {target}` ·
`reorder_shot {target, index}` · `set_board {...}`

Shot fields (add and update both): `action`, `slug`, `camera`, `motion`, `dialogue`,
`narration`, `notes`, `duration_seconds`, `duration_source` (`audio`\|`manual`),
`render_mode` (`keyframe`\|`direct`), `entity_ids`, `location_id`, `covered_by`, `index`.

`camera` is `{framing?, lens?, angle?, movement?}`.

`covered_by` is `{shot_id, start_seconds?, end_seconds?}` — this shot's picture is a
window into another shot's clip. See § Fusing shots below. `null` undoes it.

Board fields (`set_board` only): `brief`, `style`, `aspect_ratio`, `entity_ids`,
`image_model`, `video_model`. The two model fields take a model **object** from
`find_model`, or null.

**An edit cannot set `keyframe`, `clip` or `status`.** Those belong to the render
tools; passing them raises an error naming the right tool. `covered_by` is the one
exception: coverage is a picture that arrived without a render, so setting it marks
the shot `rendered` and clearing it puts the shot back to `keyframe_ready`/`planned`.

**An edit cannot set `title`, `logline`, `style_bible`, `narration` or `music_prompt`
at the board level.** Those live on the screenplay, which only
`ui_storyboard_set_screenplay` writes. Per-*shot* `narration` is an ordinary shot
field and works fine headlessly. Board narration and music matter because
`assemble_storyboard_timeline` turns them into draft audio clips.

### Fusing shots

A video model returns a fixed window — 5.184s, 6s, 8s — whatever length the shot was
directed at. A cut whose beats run 1.5-2.5s is therefore cheaper to render as one
generation covering a run of shots and split afterwards, than as one generation per
shot: fifteen 1.5-2.5s beats bought one at a time is ~77s of footage for a 30s cut.

Direct the run as one prompt with bracketed timecodes
(`[00:00 to 00:02.5] Event … [00:02.5 to 00:05.2] Reception`), render it on the first
shot of the run, then tell the board which slice each sibling uses:

```json
{"op": "update_shot", "target": "06",
 "covered_by": {"shot_id": "05", "start_seconds": 2.5, "end_seconds": 5.184}}
```

The covered shot then reads `has_clip: true` with `status: "rendered"`, is skipped by
`render_storyboard_clips` (so it is never generated twice), and
`assemble_storyboard_timeline` lays it down as that window of the covering clip
instead of skipping it, and the covering shot ends where the first covered shot takes
over. Without `end_seconds` the covered shot runs to the end of the covering clip.

One hop only: `shot_id` must name a shot that owns its clip, not another covered shot.
Removing the covering shot clears the coverage and reports which shots it uncovered.

## Storyboard — browser (`ui_storyboard_*`)

The board must be open as a workspace tab; its id comes from the `ui_context` system
block. Not open → `ui_open_document {type: "storyboard", id, focus?}`. Target =
shot id, index as a string, or `"selected"`. **Slugs are not resolved here.**

| Tool | Arguments |
|---|---|
| `ui_storyboard_get_state` | `storyboard_id` |
| `ui_storyboard_set_screenplay` | `storyboard_id`, `screenplay` |
| `ui_storyboard_set_entities` | `storyboard_id`, `entity_ids` (replaces the cast; `[]` clears it) |
| `ui_storyboard_add_shot` | `storyboard_id`, `action`, `camera?`, `motion?`, `durationSeconds?`, `index?` |
| `ui_storyboard_update_shot` | `storyboard_id`, `target`, `action?`, `camera?`, `motion?`, `status?` |
| `ui_storyboard_generate_keyframe` | `storyboard_id`, `target` |
| `ui_storyboard_generate_clip` | `storyboard_id`, `target` |
| `ui_storyboard_revise_shot` | `storyboard_id`, `target`, `instruction` |
| `ui_storyboard_assemble_timeline` | `storyboard_id` |
| `ui_storyboard_select_shot` | `storyboard_id`, `target` (nullable) |
| `ui_storyboard_extract_script` / `_relink_script` / `_reproject_shots` | `storyboard_id` (+ `targets?`) |
| `ui_storyboard_set_duration_source` | `storyboard_id`, `targets`, `source` |

`ui_storyboard_add_shot` and `update_shot` take **no** `slug`, `dialogue`,
`narration`, `entity_ids` or `render_mode`. In the browser those arrive only through
`set_screenplay`; headless, through `edit_storyboard`.

Generation is asynchronous: `generate_keyframe` / `generate_clip` start the job and
return the shot. Poll `ui_storyboard_get_state` for `status`.

Statuses: `planned` → `keyframe_generating` → `keyframe_ready` → `clip_generating` →
`rendered`, or `failed`. (`approved` is legacy and reads as "still ready"; nothing
sets it. Do not use it as a gate.)

### `screenplay` for `set_screenplay`

```json
{
  "type": "screenplay",
  "title": "…",
  "logline": "…",
  "brief": "…",
  "styleBible": "…",
  "aspectRatio": "9:16",
  "narration": "…",
  "musicPrompt": "…",
  "entityIds": ["<asset id>"],
  "shots": [
    {
      "slug": "1a",
      "action": "Nova touches untreated hair, front-camera close",
      "camera": { "framing": "close-up", "lens": "26mm", "angle": "eye", "movement": "handheld" },
      "motion": "she lifts one section of hair and lets it fall, once",
      "dialogue": "I wanted lighter hair…",
      "durationSeconds": 4,
      "entityIds": ["<asset id>"]
    }
  ]
}
```

Ids, indexes and statuses are filled in. `style` is accepted as an alias of
`styleBible`. Only `action` is required per shot.

The top-level `entityIds` casts those entities on the **board** — that cast is what
seasons every shot's still and clip prompt. Use `ui_storyboard_set_entities` to
recast without replacing the shots; `ui_storyboard_get_state` reports the current
cast as `entityIds`. A shot's own `entityIds` overrides the board cast for that shot
(`[]` means "no entities on this shot"); without one, styles and locations apply to
every shot and characters and props apply to the shots whose text names them.

## Entities

| Tool | Arguments |
|---|---|
| `list_entities` | `kind?` (`character`\|`location`\|`style`\|`prop`), `query?`, `limit?` |
| `get_entity` | `entity_id` |
| `create_entity` | `asset_id`, `kind`, `name`, `descriptor` (all required), `description?`, `voice_id?`, `tags?`, `lora?`, `palette?` |
| `update_entity` | `entity_id` + any field, including `asset_id` to move it to a new photo |
| `delete_entity` | `entity_id` — clears the marker, keeps the image |
| `apply_entities` | `text`, `entity_ids?` → seasoned prompt + reference asset ids |

An entity **is** an image asset carrying a marker. Its id is the asset id. To make one
from nothing: `find_model` (`text_to_image`) → `generate_image` → `create_entity` with
the returned asset id. To make one from a photo the user attached: find it with
`asset_search` / `list_assets`, then `create_entity`.

`apply_entities` is for seasoning a prompt you are about to send yourself
(`generate_image`, `generate_video`). The storyboard render tools season internally —
do not pre-season shot text with it.

## Timeline

`assemble_storyboard_timeline` lays rendered clips end to end, stamps each with its
board and shot id, and gives every shot clip an **audio twin on a "Shot Audio" track**
(each surface mutes video elements and mixes audio clips only). Board narration and
music become draft clips on their own tracks.

**Each shot is as long as its render**, not as long as its `duration_seconds` — a shot
directed at 1.5s that came back at 5.184s occupies 5.184s of the cut. Shots that came
back off their directed length are returned in `retimed_shots` and warned about, so a
cut that runs longer than planned is visible without playing it. `duration_seconds`
only decides a shot whose footage has no measurable length. A board linked to a script
is the exception: there the words decide, and `trimmed_shots` names the shots whose
footage does not fill the slot its lines gave it.

`edit_timeline {timeline_id, ops[]}` ops: `get_state`, `add_track`, `add_media_clip`,
`add_text_clip`, `add_shape_clip`, `split_clip`, `trim_clip`, `move_clip`,
`duplicate_clip`, `delete_clip`, `set_clip_params`, `set_clip_binding`,
`animate_clip`, `clear_animations`, `list_animation_presets`, `select_clip`, `seek`.
Start with `get_state` for ids.

To duck the shots' own sound under a voiceover: `set_clip_params` on the Shot Audio
clips with `muted: true`, or `volumeDb: -18`. `set_clip_params` also takes `name`,
`opacity`, `speedMultiplier`, `fadeInMs`, `fadeOutMs`, `blendMode`, `borderRadius`,
`hidden`, `locked`, `textStyle`, `shapeStyle`.

Every field goes on the op itself. A `params` / `props` wrapper is unwrapped, but the
flat form is the contract:

```json
{"op": "set_clip_params", "target": "clip_1",
 "textStyle": {"fontFamily": "Space Grotesk", "fontWeight": 800}}
```

`textStyle` is **merged** over the clip's own, so send only what you are changing —
re-sending the whole object is how the fields you did not mean to touch get
overwritten. `fontWeight` is a number, and the CSS keywords (`bold`, `semibold`,
`extrabold`) are accepted and stored as one.

**Set a bundled family or none at all.** `sans-serif`, `serif`, `system-ui` and the
other CSS generics are refused where the clip is authored: they name no typeface, so
the editor preview, the render and `preview_timeline_frame` each pick a different one.
NodeTool ships Inter (the default), Space Grotesk, Bebas Neue, Playfair Display, Lora
and JetBrains Mono. A named system font is still allowed and `validate_timeline`
reports it as `font_not_portable`.

`validate_timeline {timeline_id | document, fps?}` after every edit pass. It catches
overlaps, fades longer than their clip, unknown presets and incomplete bindings.

Other timeline tools: `list_timelines`, `create_timeline`, `get_timeline`,
`delete_timeline`, and the version family (`list_`/`get_`/`create_`/`restore_`/
`delete_timeline_version`). Browser twins are `ui_timeline_*`.

## Script

Use a script when the words drive the cut. `extract_script_from_storyboard` projects a
board's dialogue and narration into a script and links the two: each shot keeps the
line ids it covers, and from then on the script owns the words. `derive_storyboard_from_script`
goes the other way, one shot per line, optionally with a director pass over the scaffold.

`voice_script_lines` synthesizes each line with its cast voice; `assemble_script_timeline`
lays the takes end to end.

**Give the cast their voices first, then voice with no override.** A voice is the
triple `{provider, model, voice}` where `voice` is the voice's own name (`Aoede`,
`Charon`, `alloy`) — a provider and a model alone do not pick one, so
`voice_script_lines {provider, model}` is refused. Set each speaker once:

```json
{"op": "set_speaker_voice", "target": "MOM",
 "provider": "gemini", "model": "tts-hd", "voice": "Aoede"}
```

The three keys sit on the op, though a `voice: {provider, model, voice_id}` object —
the shape `get_script` reports a voice in — is flattened onto it. Then call
`voice_script_lines {script_id}` with no override and every speaker resolves its own. On a linked board, `assemble_storyboard_timeline` cuts words
and picture together: each shot runs as long as the takes it covers and every voiced
line gets its own voiceover clip.

Others: `list_scripts`, `get_script` (line status: `draft`, `stale`, `voiced`,
`no_voice`), `create_script`, `edit_script`, `delete_script`. Browser twins are
`ui_script_*`.

## Models

`find_model {capability, query?, task?, provider_hint?, model_hint?, prefer_local?,
limit?}` is the only way to name a model. **`capability` is required** and is one of
`text_to_image`, `image_to_image`, `text_to_video`, `image_to_video`, `text_to_speech`,
`text_to_music`, `automatic_speech_recognition`, `generate_embedding`,
`generate_message`. `query` is the search box (`"flux schnell"`); `task` is a hint
matched against a model's supported tasks, not a search.

NodeTool ships curated ids under the `nodetool` provider, which are the sane defaults
when the user has no preference:

| Id | Use |
|---|---|
| `nodetool/flux-schnell` | cheapest stills, text prompts only |
| `nodetool/nano-banana` | sharper stills, takes reference images |
| `nodetool/seedream` | most detail, slowest |
| `nodetool/hailuo-fast` | cheapest clips, for blocking out a cut |
| `nodetool/kling-turbo` | steadier motion, mid price |
| `nodetool/kling-standard` | most faithful motion |
| `nodetool/kokoro` | eight TTS voices |

## Media, outside the board

`generate_image {provider, model, prompt, negative_prompt?, width?, height?, quality?,
output_file?}`, plus `edit_image`, `generate_video`, `animate_image`, `generate_speech`,
`generate_music` and `transcribe_audio` — each takes a `find_model` provider+model and
saves an `asset://` result. `model` also accepts a whole `find_model` hit or its `.ref`,
in which case `provider` may be omitted.

`understand_video {provider, model, video, prompt?, max_tokens?}` reads a whole video
with a multimodal model (Gemini reads video natively); use it to break down a reference
cut. `video` takes an asset id, an `asset://` URI, a URL or a data URI. `view_image`
puts pixels in your own context; `read_media_bytes` returns the bytes.

## The Director node

`nodetool.creative.Director` is a **workflow node**, not a chat surface. It turns a
brief into a `Screenplay` (props: `model`, `brief`, `style`, `shot_count`; outputs
`screenplay`, `narration`, `music_prompt`, `title`). Reach for it only inside a
reusable graph. In chat, write the shots yourself with `edit_storyboard` — same
artifact, no graph to build and validate.
