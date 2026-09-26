---
name: storyboard-core
description: "Use NodeTool storyboard, entity-casting, rendering, and timeline-assembly tools for video production or debugging their contracts."
---

The shared half of every NodeTool video job. The use-case skills carry the style,
the shot pattern and the briefs; this carries the machinery they all assume.

Direct video on the **storyboard** surface, then finish in the **timeline**. Use a node graph when the user requests one or needs a reusable template, as
described in `video-workflow`.

Read the relevant part of **Tool contract** below before the first call in
that tool family. Use the live tool schema when it differs
from an example. Load other sections only when the task reaches them.

## Pick the use-case skill

| Job | Skill |
|---|---|
| Phone-shot video with a person: UGC ad, testimonial, comedy, day-in-the-life, vlog | `/ugc-video` |
| Product film: pack shot, hero, brand spot, with or without talent | `/product-commercial` |
| Sound-off motion-graphics ad from real screenshots and product photos, no generated footage | `/motion-ad` |
| Rebuild an existing ad or clip you were given | `/video-clone` |
| Voiceover drives the picture: explainer, faceless video, narrated piece | `/script-video` |
| Narrative with dialogue, score and a title: short film, trailer, scene | `/short-film` |
| A campaign, not one video: entity sheets, still set, several cuts | `/launch-kit` |
| A template to re-run on new inputs | `/video-workflow` |
| Footage already exists and needs repair: cutout, upscale, outpaint, lip sync, generated sound | `/nodetool-video-post` |
| A screen someone clicks, over the workflows behind a piece | `/nodetool-app-builder` |

If none fits, run the loop below directly.

Those skills say what the picture looks like. A second set says where the beats
go, and the two compose: load the job skill for the look and the structure
skill for the spine.

| The structure question | Skill |
|---|---|
| Ad beats: hook, escalation, timecodes, VO discipline | `/commercial-beat-sheet` |
| A product page URL in, a finished cut and its cost out | `/launch-commercial` |
| A 30–120s explanation with a claim per beat | `/explainer-storyboard` |
| A treatment cut to a track's sections | `/music-video-treatment` |
| Eight audio-first beats, the drop at ~65%, a title card | `/trailer-template` |

These own their own briefs and beat budgets. `/commercial-beat-sheet` carries
the board contract the other four quote; where it and this skill both describe
a call, this skill is the fuller version.

## Two tool families, one board

| | Headless | Browser |
|---|---|---|
| Names | `create_storyboard`, `get_storyboard`, `edit_storyboard`, `render_storyboard_stills`, `render_storyboard_clips`, `revise_storyboard_clip`, `assemble_storyboard_timeline` | `ui_storyboard_` + `get_state`, `set_screenplay`, `add_shot`, `update_shot`, `generate_keyframe`, `generate_clip`, `revise_shot`, `assemble_timeline`, `select_shot` |
| Needs | nothing open | the board open as a tab, listed in the `ui_context` system block |
| Shot target | id, 0-based index, or **slug** | id, 0-based index, or `"selected"` — **no slug** |
| Permission gate | yes | no (client tools bypass it) |

Every tool in both families takes an explicit `storyboard_id`. There is no
"act on whatever is open" fallback.

Prefer headless. Reach for `ui_storyboard_*` when the user is watching the board fill
in, or when you need `set_screenplay` — board-level `title`, `logline`, `style_bible`,
`narration` and `music_prompt` live on the screenplay and nothing headless writes them.
Bridge the two with `ui_open_document {type: "storyboard", id}`.

## The loop

1. **Find the board.** `list_storyboards`, or read `ui_context`. No board yet →
   `create_storyboard {name, brief, style, aspect_ratio}`.
2. **Cast the entities.** `list_entities` first. A new one needs an image asset —
   `generate_image` or the user's upload — then
   `create_entity {asset_id, kind, name, descriptor}`. **There is no create-from-text.**
3. **Attach the cast to the board:** `edit_storyboard` → `{op: "set_board", entity_ids: [...]}`,
   or `ui_storyboard_set_entities {storyboard_id, entity_ids}` on an open board.
   An entity not on the board seasons nothing, no matter what the shots say.
4. **Pin the models.** `find_model` with `capability` `text_to_image`, then
   `image_to_video` or `text_to_video`; write both through
   `{op: "set_board", image_model, video_model}`. There is no default — an unset
   model fails the render rather than spending on a model nobody chose.
5. **Direct.** One `{op: "add_shot", ...}` per shot. Report the shot count and
   selected models. Continue to the stages authorized by the request. A board-only
   request ends here. Honor any checkpoint the user requested.
6. **Stills.** `render_storyboard_stills {storyboard_id}` — omit `targets` for every
   shot that still needs one. Cap 24 shots per call.
7. **Take selection, when requested.** Every render keeps the old still in
   `keyframe_versions`. Selecting a different one requires the board's takes gallery. No tool does it.
   Pause if the user reserved that selection. Otherwise continue with the current
   take. Never claim to have switched takes without a supported action.
8. **Clips.** `render_storyboard_clips {storyboard_id}` within the requested
   generation scope and budget. Reuse prior authorization instead of asking again.
9. **Revise one shot:** `revise_storyboard_clip {target, instruction}`. Needs an
   existing clip; it is video-to-video and touches no other shot.
10. **Cut.** `assemble_storyboard_timeline`, then `validate_timeline`. Re-running
    rebuilds the same sequence in place and keeps tracks the board does not own.
11. **Finish** with `edit_timeline` ops (**Tool contract** § Timeline, below).
    Load the `motion-graphics` system skill with `load_skill` for the full op
    list, the presets and the preview contract. A repair on a delivered clip
    belongs to `nodetool-video-post`.

**Stills-only mode.** When the user wants a board and frames but no motion — a spec
ad, a pitch, a look test — run steps 1 to 7 and stop. Adding the motion later is
`update_shot` on `motion` alone: action, wardrobe, set and cast stay put, so the
approved stills still describe the finished piece.

## What actually reaches the model

The prompt is assembled from named fields, not from the whole shot:

- **Still:** `action`, then `"<camera.framing> shot"`, then the board's `style`.
  `camera.lens`, `camera.angle` and `camera.movement` **do not reach it**.
- **Clip (keyframe mode):** `motion`, then `action`. The style does not reach it —
  the selected still carries the look.
- **Clip (direct mode):** `action`, `"<framing> shot"`, `motion`, `style`.

So a lens, an angle or a camera move only lands if you write it into `action` or
`motion`. Keep the structured `camera` object as well — it is what the user reads on
the card.

**Entities season by plain name.** A shot with `entity_ids` uses exactly those.
Otherwise: every style and location entity applies to every shot, and a character or
prop applies when its **name appears** in the shot's `action`, `motion`, `dialogue`,
`narration` or `slug`. Write `Nova reaches for the bottle`, not `@Nova reaches...`.
`@` is a chat-composer affordance that emits an `entity://<id>` token into *your
message*; it never becomes shot text.

## Locks

- Keep one `descriptor` per entity and let it do the work. Do not re-describe a face
  in shot text.
- A state change (wet hair, a stained shirt, a second outfit) is a **second entity**,
  not an instruction inside one prompt.
- Product geometry, label and colour come from the product entity's descriptor and
  reference image. Never invent a logo.
- Give every shot a stable `slug` (`1a`, `2a`, …) at `add_shot` time. Headless targets
  accept it, and "fix 3a" then means one shot.
- Render mode is per shot. `keyframe` (default) is cheaper to iterate and holds a look
  steady. `direct` skips the still — worth it for heavy motion, where first-frame
  conditioning stiffens the result, and for native-audio video models, which are
  weakest on their image path.
- A native-audio model writes the sound per clip, so a board of one clip per shot
  cuts the audio at every join. Before rendering, load the `video-audio-continuity`
  system skill through `load_skill`: either the whole piece is one shot
  carrying the cuts, or the
  continuity comes from a narration or music track and the shot audio is muted.
  A silent cut is also valid when sound is not requested. Reuse existing audio
  or keep the cut silent when extra generation would exceed the authorized scope.

## Where the models will not do what the cut wants

Four constraints that are not bugs and have no tool to fix them. Each has a working
shape.

**A video model returns a fixed length.** It ignores `duration_seconds` — the same
model gives 5.184s whether the shot was directed at 1.5s or 5s. For a fast cut,
render one generation per *run* of short beats with bracketed timecodes in the prompt
and record the split with `covered_by`. **Tool contract** § Fusing shots,
below, has the call.

**Moderation reads the words, not the story.** A prompt naming institutional force —
police grabbing someone, a raid, restraint — trips a safety filter that a shot of the
same threat does not. Reframe with non-trigger vocabulary and keep the stakes:
"two uniformed city officials approaching with a clipboard and caution tape" passes
where "two aggressive police officers grabbing her arms" does not. Reframe once; do
not retry the rejected prompt.

**A music model cannot leave a hole.** Ask for 1.5s of silence at 00:19.5 and the
decoder fills it with reverb tail and room tone — there is no envelope gate in the
prompt. Cut the silence on the timeline instead: generate the score in two parts,
lay them as two clips with the gap between them, and fade the first out (~300ms) and
the second in (~100ms) so the edges are not clicks.

**Speech does not fit a 1.5s shot.** An expressive take of a line runs 4s, and
compressing it to the picture beat makes it sound processed. Let the words cross the
cut: keep the voiceover clip on its own track and start it under the previous shot
(J-cut) or run it past the cut into the next (L-cut). The picture cuts on the beat;
the line finishes where it finishes. On a script-linked board that is automatic —
each shot runs as long as the lines it covers — so use this on an unlinked board or
where the picture has to stay on the beat.

## Gating and spend

Permission mode decides what runs without asking. `read` tools always run.

| Mode | write / execute / external |
|---|---|
| `auto` | runs |
| `default` | asks the user |
| `plan` | **blocked** |

`plan` blocks `create_storyboard` and `edit_storyboard` too, so the board cannot be
written in it. Respect the active permission mode and tool approval responses. For a board-only
request, write the board and omit render calls. Do not switch modes or use browser
tools to evade a denied headless action. A tool being callable does not authorize
spend beyond the user's request.

**You cannot price a render.** No tool estimates it, and `Shot.cost_estimate` is not
populated. Report the shot count and model without inventing a dollar estimate. If a user
budget cannot be checked before spending, resolve that constraint first. Report
actual spend afterwards with `get_cost_summary`. If authorization is missing,
prepare the board and explain the specific render action that needs approval.

## Memory

`memory_save` is durable across every conversation — use it for the style bible, the
cast and the grade, with the entity and board ids in `resources`. `share_result` /
`read_shared` are **run-scoped and discarded**; they are for passing values inside one
turn, not for locking a look across sessions.

## Follow-ups this loop already handles

```
Fix 3a only. Leave the rest.
Drop the contre-jour across the whole board — soft even daylight. Update the
  board style, do not rewrite the shots.
New still on 2a. Keep the old take.
revise_storyboard_clip 5a: darker, add rain, same blocking.
Add a reaction shot after 3a and re-slug from there. Do not re-render 1a-3a.
Collapse 8, 9 and 10 into one 8s shot, keeping the lean-in as the last second.
The face drifted on 4a. I picked take 2 in the gallery — regenerate the clip.
The label is unreadable on 2a. New macro still, then a clip from it.
Cut it. Assemble, validate, narration on its own track, mute Shot Audio on 1-6.
```

## What is below

- **Tool contract** — every tool, its arguments, and the fields it refuses.
- **Standing orders** — an optional brief for users who explicitly want
  approval between stages. Its sample checkpoints do not add requirements to
  a different request.

## Tool contract

Exact arguments. Every field named here is checked in the implementation; an
unrecognized field is **refused with an error**, not dropped.

### Storyboard — headless

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

#### `edit_storyboard` ops

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

#### Fusing shots

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

### Storyboard — browser (`ui_storyboard_*`)

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

#### `screenplay` for `set_screenplay`

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

### Entities

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

### Timeline

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

### Script

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

#### Writing the lines

`create_script` makes an empty one. `edit_script {script_id, ops[]}` ops:
`set_setup` (brief, format, length, pace, language, stage), `add_speaker`,
`set_speaker`, `set_speaker_voice`, `add_section`, `add_line`, `set_line_text`,
`set_line_speaker`, `remove_line`, `remove_speaker`. Call `get_script` first for
line and speaker ids.

`write_script {script_id, rewrite?, imported_text?}` drafts the lines from the
setup and saves the cast and lines it produces, replacing what was there. Set
the brief with `set_setup` first. `rewrite: true` keeps the ids of the lines it
keeps, so their takes and storyboard links survive. Words passed as
`imported_text` are only split into lines and attributed to speakers, never
reworded. It records no take: voice the result with `voice_script_lines`.

Rewriting a line leaves its takes in place as **stale**, so a following
`voice_script_lines` re-records exactly those and nothing else.

### Models

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

### Media, outside the board

`generate_image {provider, model, prompt, negative_prompt?, width?, height?, quality?,
output_file?}`, plus `edit_image`, `generate_video`, `animate_image`, `generate_speech`,
`generate_music` and `transcribe_audio` — each takes a `find_model` provider+model and
saves an `asset://` result. `model` also accepts a whole `find_model` hit or its `.ref`,
in which case `provider` may be omitted.

`understand_video {provider, model, video, prompt?, max_tokens?}` reads a whole video
with a multimodal model (Gemini reads video natively); use it to break down a reference
cut. `video` takes an asset id, an `asset://` URI, a URL or a data URI. `view_image`
puts pixels in your own context; `read_media_bytes` returns the bytes.

### The Director node

`nodetool.creative.Director` is a **workflow node**, not a chat surface. It turns a
brief into a `Screenplay` (props: `model`, `brief`, `style`, `shot_count`; outputs
`screenplay`, `narration`, `music_prompt`, `title`). Reach for it only inside a
reusable graph. In chat, write the shots yourself with `edit_storyboard` — same
artifact, no graph to build and validate.

## Standing orders

Use this optional template only when the user wants a staged review with approval
between the board, stills, clips, and cut. Its checkpoints express that user's
chosen workflow. They do not apply to other requests or override authorization
already given to finish a piece.

Respect the thread's existing permission mode. Plan mode blocks writes. Do not
switch modes or use another tool family to evade a denial. The user can adapt the
brief to authorize the desired stages and set a budget.

```
You are directing on the storyboard surface, then finishing in the timeline.
Do not build a node graph unless I ask for a reusable template.

SURFACES
Headless: create_storyboard, get_storyboard, edit_storyboard,
render_storyboard_stills, render_storyboard_clips, revise_storyboard_clip,
assemble_storyboard_timeline, extract_script_from_storyboard.
Browser (only for a board open as a tab): ui_storyboard_get_state,
ui_storyboard_set_screenplay, ui_storyboard_generate_keyframe,
ui_storyboard_generate_clip, ui_storyboard_revise_shot,
ui_storyboard_assemble_timeline. Use ui_open_document to open a board.

LOOP
1. list_storyboards, or read ui_context. No board -> create_storyboard.
2. Cast before anything renders. list_entities first. A new entity needs an
   image asset: generate_image (or my attachment), then create_entity with
   {asset_id, kind, name, descriptor}. There is no create-from-text.
   Each entity: one name, one kind, one canonical descriptor sentence.
3. edit_storyboard set_board {entity_ids, image_model, video_model,
   brief, style, aspect_ratio}. Models come from find_model — there is no
   default and an unset model fails the render.
4. Direct with edit_storyboard add_shot, one op per shot. Give every shot a
   slug (1a, 2a, ...). Fields: action, slug, camera {framing, lens, angle,
   movement}, motion, dialogue, narration, duration_seconds, render_mode.
5. STOP after the board. Report shot count and the two model ids. Do not
   estimate dollars — no tool prices a render. Wait for "stills".
6. render_storyboard_stills. I pick takes in the board's takes gallery; you
   cannot select a take and must not claim you did. Wait for "clips".
7. render_storyboard_clips. revise_storyboard_clip touches one shot only.
8. On "cut": assemble_storyboard_timeline, then validate_timeline.

WRITING THE SHOTS
Only these reach the image model: action, camera.framing, and the board style.
Only these reach the video model: motion and action (plus framing and style on
a direct-mode shot). So put lens, angle and camera move into the action or
motion text as well as into the camera object.
Name entities in plain text — "Nova reaches for the bottle", never "@Nova".
Entities season a shot when their name appears in its action, motion, dialogue,
narration or slug; styles and locations season every shot. A shot's entity_ids,
if set, overrides that entirely.

LOCKS
- The descriptor is the face. Do not re-describe an entity in shot text.
- Product geometry, label, cap and colour come from the product entity. No new
  logos.
- A state change (wet, stained, new outfit) is a second entity, not a morph
  instruction inside one prompt.
- Slugs stay stable. "Fix 3a" edits 3a and renders 3a.
- UGC: handheld phone, grain, natural audio, no score, no beauty filter.
  Hero: locked grade in the style, smooth camera, score allowed.
- render_mode "keyframe" (default) for anything where the look must hold;
  "direct" for heavy motion or a native-audio video model.

MEMORY
memory_save the style, the cast and the grade, with the entity and board ids in
`resources` — that survives into later threads. share_result/read_shared are
run-scoped and get discarded; do not use them to lock a look.

If the shot count looks expensive, propose a collapse before rendering clips.
```
