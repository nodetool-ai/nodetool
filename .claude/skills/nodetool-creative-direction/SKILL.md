---
name: nodetool-creative-direction
description: Direct a NodeTool storyboard from a brief to a cut timeline — cast entities, shot list, stills, clips, revisions, assembly. Use when the user asks for an ad, UGC video, trailer, explainer, launch kit, product film, vlog, spec spot, or any multi-shot video, or mentions storyboards, shots, keyframes, stills, entities, screenplays, or "direct this". Also use when they ask to clone a reference video or build a repeatable video graph.
---

Direct video on the **storyboard** surface, then finish in the **timeline**. Do not
author a node graph for a one-off piece; a graph is only worth it when the user
wants a template they will re-run.

Read `references/tool-contract.md` before the first tool call — it carries the exact
tool names, argument shapes, and the fields each one can and cannot set.

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
3. **Attach the cast to the board:** `edit_storyboard` → `{op: "set_board", entity_ids: [...]}`.
   An entity not on the board seasons nothing, no matter what the shots say.
4. **Pin the models.** `find_model` with `capability` `text_to_image`, then
   `image_to_video` or `text_to_video`; write both through
   `{op: "set_board", image_model, video_model}`. There is no default — an unset
   model fails the render rather than spending on a model nobody chose.
5. **Direct.** One `{op: "add_shot", ...}` per shot. Then **stop.** Report the shot
   count and the two models, and wait.
6. **Stills.** `render_storyboard_stills {storyboard_id}` — omit `targets` for every
   shot that still needs one. Cap 24 shots per call.
7. **The user picks takes.** Every render keeps the old still in
   `keyframe_versions`. Selecting a different one is a click in the board's takes
   gallery; no tool does it. Never claim you switched takes.
8. **Clips.** `render_storyboard_clips {storyboard_id}` — the expensive step. Wait
   for the user's word.
9. **Revise one shot:** `revise_storyboard_clip {target, instruction}`. Needs an
   existing clip; it is video-to-video and touches no other shot.
10. **Cut.** `assemble_storyboard_timeline`, then `validate_timeline`. Re-running
    rebuilds the same sequence in place and keeps tracks the board does not own.
11. **Finish** with `edit_timeline` ops (`references/tool-contract.md` § Timeline).

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

## Gating and spend

Permission mode decides what runs without asking. `read` tools always run.

| Mode | write / execute / external |
|---|---|
| `auto` | runs |
| `default` | asks the user |
| `plan` | **blocked** |

`plan` blocks `create_storyboard` and `edit_storyboard` too, so the board cannot be
written in it. To write the board and stop before spending, use **`default`** and let
the user deny the render calls. `ui_storyboard_*` calls are not gated at all — in a
browser session the human's word is the only gate on `ui_storyboard_generate_clip`.

**You cannot price a render.** No tool estimates it, and `Shot.cost_estimate` is not
populated. Say "7 shots × <video model>" and let the user decide; report actual spend
afterwards with `get_cost_summary`.

## Memory

`memory_save` is durable across every conversation — use it for the style bible, the
cast and the grade, with the entity and board ids in `resources`. `share_result` /
`read_shared` are **run-scoped and discarded**; they are for passing values inside one
turn, not for locking a look across sessions.

## Reference files

- `references/tool-contract.md` — every tool, its arguments, and the fields it refuses.
- `references/standing-orders.md` — the block to paste as message 1 of a thread.
- `references/job-briefs.md` — twelve ready briefs (UGC, luxury pack shot, street CPG,
  comedy, locker-room, night vlog, spec ad, short, reference-video clone, launch kit,
  faceless explainer, reusable graph).
