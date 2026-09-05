---
name: explainer-storyboard
description: Turn a confirmed product or feature brief into a shootable 30–120 second explainer storyboard with a consistent entity roster. Use for explanatory product videos, not workflows, pipelines, or finished renders.
---

# Explainer Storyboard → Storyboard Agent

Create a complete, shootable explainer beat sheet as a NodeTool storyboard. Work directly through the storyboard and entity capability modules. Do not build a workflow or run a pipeline. Do not render stills, clips, or assemble a timeline unless the user asks.

## Truthful brief

Collect these facts before creating a board: product or feature, brand and traits, category, audience, core problem, shift, 2–4 concrete mechanism steps, proof assets, CTA, runtime (30, 60, 90, or 120 seconds), platform, tone, mandatory content, and forbidden claims. The core problem, shift, and mechanism are required. Never invent a capability, integration, metric, screen, or customer. Write `[CLIENT INPUT NEEDED]` wherever proof is not confirmed.

## Resolve entities before beats

Every recurring person, location, product UI, device, metaphor object, brand mark, and visual style is an entity. Start with `list_entities`; reuse user-provided references and existing entities before generating anything. A real product screenshot is a `prop` reference and must never be regenerated.

Resolve a style entity first. Generate only missing references, applying that style before generating each other entity. A typical 60-second explainer has 4–7 entities: style, persona, optional location, product UI prop, and metaphor prop. Label generated UI as a mock.

Use `create_entity` with a dense visual descriptor. The descriptor specifies the exact recurring appearance: character features and wardrobe; location materials and lighting; UI layout, palette, typography, and content boundaries; metaphor geometry and material; or style medium, palette, lighting, and lens. An entity id is the asset id supplied to `create_entity`.

## Teaching arc

Compute timecodes from the selected runtime, rounded to 0.5 seconds. Use this arc:

| Beat | Runtime share |
| --- | --- |
| Problem | 0–15% |
| Stakes | 15–25% |
| Shift | 25–40% |
| Mechanism 1 | 40–55% |
| Mechanism 2 | 55–68% |
| Outcome / proof | 68–82% |
| CTA | 82–93% |
| Sign-off | 93–100% |

For 30 seconds, combine problem and stakes and use one mechanism beat. For 90–120 seconds, use at most three mechanism beats. Use one concept and one literal metaphor. Put the visual aha at the shift-to-mechanism boundary and leave a deliberate half-beat of silence after it. Voice-over must be at most `runtime × 2.2` words.

## Deliverables

Produce, in order: three concept directions with a recommendation, the full beat sheet, and an entity roster with id, kind, descriptor summary, and referenced beats. Each direction states its entry problem, metaphor, aha, fit, risk, and referenced entities.

For every beat include timecode, teaching job, framing, visual, action, visible entities, verbatim VO, on-screen text of five words or fewer, exact UI/demo input and output or `NONE`, sound, music, transition, and why it teaches. Mechanism beats must show the real UI or a labelled mock. Brand marks wait until the shift. Use verbs in VO and nouns on screen. The sign-off echoes the opening problem.

## Persist the board

Create the storyboard with `create_storyboard({ name, brief, style, aspect_ratio })`. Use `board.storyboard_id`, never `.id`. Put the complete brief, chosen direction, and entity roster into `brief` so the project can be reconstructed later. The exact call shapes and return fields — entity id equals the asset id you passed in, the five `edit_storyboard` ops, what `set_board` accepts — are in `commercial-beat-sheet` § Tool contract; every board skill builds against that one section.

Attach roster ids with `edit_storyboard({ storyboard_id, ops: [{ op: "set_board", entity_ids }] })` (`set_entities` is only an alias for `set_board`). Resolve the render models in the same op: `find_model` for `text_to_image` and `image_to_video`, each result's `.ref` on `image_model` / `video_model`, and each result's `prompting_skill` loaded before the shot text is written — the shot `action` is the prompt the still model reads, with the framing and board style appended.

Add one shot per beat with `edit_storyboard` and an `add_shot` op. The dense `action` field names the teaching job, visible entity names in brackets, on-screen text, and UI demonstration. The render attaches a persona or prop entity to a shot only when its name appears in that shot's text (style and location always apply), so every visible entity must be named in `action` or `motion`, or listed on the shot's own `entity_ids`. On-screen text in `action` is a note for the cut: it goes on as a text clip after assembly (`caption-titles`), not into the render prompt.

Stop after the planned board unless the user explicitly requests rendering or a cut. Report the directions, chosen board, and entity roster.

## Render (only on request)

Stills first with `render_storyboard_stills` — they cost cents, and you look at every one with `view_image` asking what is wrong, then `score_image_adherence` against the shot text. A persona or UI mock that drifts is fixed at the entity (descriptor or reference), then every shot using it re-renders; a shot that fails on composition is fixed in its `action`. Clips with `render_storyboard_clips`; a clip wrong where its still was right is one `revise_storyboard_clip`. Then `assemble_storyboard_timeline`.

## When the board becomes motion

When a cut is asked for, `motion-graphics` carries the timeline tool contract and routes to the craft skill for the job: `video-audio-continuity` for whether the beats render as one clip or under a narration track, `caption-titles` for the on-screen text and callouts this beat sheet already specifies, `frame-composition` for where a UI mock sits and whether it survives 9:16, `motion-direction` to hold one motion language across the mechanism beats, and `beat-sync-editing` when the cut has to sit on a music bed. The half-beat of silence after the aha is a hold, not a gap — keep it in the cut.
