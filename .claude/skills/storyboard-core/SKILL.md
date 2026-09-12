---
name: storyboard-core
description: "Use NodeTool storyboard, entity-casting, rendering, and timeline-assembly tools for video production or debugging their contracts."
---

The shared half of every NodeTool video job. The use-case skills carry the style,
the shot pattern and the briefs; this carries the machinery they all assume.

Direct video on the **storyboard** surface, then finish in the **timeline**. Use a node graph when the user requests one or needs a reusable template, as
described in [video-workflow](../video-workflow/SKILL.md).

Read the relevant section of [tool-contract.md](references/tool-contract.md)
before the first call in that tool family. Use the live tool schema when it differs
from an example. Load other sections only when the task reaches them.

## Pick the use-case skill

| Job | Skill |
|---|---|
| Phone-shot video with a person: UGC ad, testimonial, comedy, day-in-the-life, vlog | `/ugc-video` |
| Product film: pack shot, hero, brand spot, with or without talent | `/product-commercial` |
| Rebuild an existing ad or clip you were given | `/video-clone` |
| Voiceover drives the picture: explainer, faceless video, narrated piece | `/script-video` |
| Narrative with dialogue, score and a title: short film, trailer, scene | `/short-film` |
| A campaign, not one video: entity sheets, still set, several cuts | `/launch-kit` |
| A template to re-run on new inputs | `/video-workflow` |

If none fits, run the loop below directly.

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
11. **Finish** with `edit_timeline` ops (`references/tool-contract.md` § Timeline).

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
  system skill through `load_skill`, or read its
  [repository source](../../../packages/system-skills/video-audio-continuity/SKILL.md): either the whole piece is one shot carrying the cuts, or the
  continuity comes from a narration or music track and the shot audio is muted.
  A silent cut is also valid when sound is not requested. Reuse existing audio
  or keep the cut silent when extra generation would exceed the authorized scope.

## Where the models will not do what the cut wants

Four constraints that are not bugs and have no tool to fix them. Each has a working
shape.

**A video model returns a fixed length.** It ignores `duration_seconds` — the same
model gives 5.184s whether the shot was directed at 1.5s or 5s. For a fast cut,
render one generation per *run* of short beats with bracketed timecodes in the prompt
and record the split with `covered_by`. `references/tool-contract.md` § Fusing shots
has the call.

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

## Reference files

- `references/tool-contract.md` — every tool, its arguments, and the fields it refuses.
- [standing-orders.md](references/standing-orders.md) contains an optional brief
  for users who explicitly want approval between stages. Its sample checkpoints
  do not add requirements to a different request.
