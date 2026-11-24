---
layout: page
title: "Creative Agent Tools"
description: "The agent tools behind the creative editors: storyboards, video production, entities, scripts, presets, timelines, sketches, 3D, audio, documents, and games, with traces, argument rules, and errors."
---

The creative editors' pages describe what a person does in the app. This page is the builder's view of the same features: the tool names an agent calls, their argument rules, recorded traces, and the errors they return. The chat assistant, MCP clients, and `nodetool agent run` all reach these tools. With an editor open, the assistant prefers the `ui_*` tools that edit the open document. Without one, it uses the backend tools that read and write the saved document. See [MCP Server](../mcp-server.md) for connecting an outside agent, and the capability table in the [agent architecture notes](https://github.com/nodetool-ai/nodetool/blob/main/docs/AGENTS.md#built-in-capabilities) for every module.

| Section | Creator page |
|---|---|
| [Storyboard and Creative Agent tools](#storyboards) | [Creative Agent](../creative-agent.md) |
| [Storyboard editor internals](#storyboard-editor) | [Storyboard Editor](../storyboard-editor.md) |
| [Video production tools](#video-production) | [AI Video Production](../ai-video-production.md) |
| [Entity tools](#entities) | [Entities](../entities.md) |
| [Script tools](#scripts) | [Script Editor](../script-editor.md) |
| [Preset tools](#presets) | [Presets](../presets.md) |
| [Timeline tools](#timelines) | [Video Editor](../video-editor.md), [AI Timeline Editing](../ai-timeline-editing.md) |
| [Sketch and 3D tools](#sketch-3d) | [Sketch Editor](../sketch-editor.md), [3D Editor](../3d-editor.md), [Blender](../blender.md) |
| [Audio tools](#audio) | [Audio Editor](../audio-editor.md) |
| [Document and game tools](#documents-games) | [Document Editor](../document-editor.md), [Text and SVG Documents](../text-and-svg-documents.md), [Game Editor](../game-editor.md) |

## Storyboard and Creative Agent tools {#storyboards}

A Director agent turns a brief into a typed screenplay on a [storyboard](../storyboard-editor.md). The same steps are available from the UI, from chat (the agent calls the `ui_storyboard_*` tools while an editor is open, and the backend storyboard capabilities otherwise), and from an external agent over MCP. Creator-facing guide: [Creative Agent](../creative-agent.md).

### Trace: brief to timeline

The agent works through frontend tools registered in `web/src/lib/tools/builtin/storyboard.ts`. Every tool takes a `storyboard_id`.

User prompt in chat:

> Make a 6-shot ad for a trail-running shoe. Direct it, render stills, and show me before you spend on clips.

Tool calls, in order:

```json
{ "tool": "ui_storyboard_set_setup",
  "args": { "storyboard_id": "<board id>", "brief": "Trail-running shoe ad", "shotCount": 6 } }
{ "tool": "ui_storyboard_direct",
  "args": { "storyboard_id": "<board id>", "redirect": false } }
{ "tool": "ui_storyboard_generate_keyframe",
  "args": { "storyboard_id": "<board id>", "target": "all" } }
```

Document change after each call:

| Call | Change to the board document |
|---|---|
| `ui_storyboard_set_setup` | `brief` and `shotCount` are stored on the board. |
| `ui_storyboard_direct` | The screenplay loads: title, logline, style bible, narration, music prompt, and one shot per card with `action`, `camera`, `motion`, and `durationSeconds`. Every shot starts as `planned`. |
| `ui_storyboard_generate_keyframe` | Jobs start for every shot. The call returns the enqueued shots and skipped ids. Shot statuses move through `keyframe_generating` to `keyframe_ready`. Poll `ui_storyboard_get_state`. |

After you pick stills, the agent continues with `ui_storyboard_generate_clip` (`target: "all"`, or one shot id, index, or `"selected"`), then `ui_storyboard_assemble_timeline` with only `storyboard_id`. Assembly returns the new `sequenceId`, `skippedShotIds`, and a `url` for the timeline. `ui_storyboard_revise_shot` takes `target` and `instruction` (for example "make it darker, add rain"), and adds a new clip take without replacing the current one.

### Rules enforced by the tools

- `ui_storyboard_direct` refuses a board that already has a screenplay unless `redirect: true`. A re-direct keeps the ids, media, and status of shots it retains.
- Directing without a brief fails. Write it with `ui_storyboard_set_setup` first.
- `ui_storyboard_generate_clip` needs a selected still on the shot. `ui_storyboard_revise_shot` needs a current clip.
- `staleOnly: true` on either generate tool renders only shots whose current version no longer matches the style, model, aspect ratio, or prompt.
- `ui_storyboard_remove_shot` deletes the shot and its media and cannot be undone from the agent side.
- A write that cannot be saved fails the tool call with "was applied to the open storyboard but did not persist".

The full `ui_storyboard_*` set also covers `get_state`, `set_screenplay`, `set_entities`, `add_shot`, `update_shot`, `select_shot`, `extract_script`, `relink_script`, `reproject_shots`, `set_duration_source`, scenes, versions, and style.

Without an open editor, the backend capabilities in `packages/agents/src/capabilities/storyboards.specs.ts` do the same work: `list_storyboards`, `create_storyboard`, `get_storyboard`, `render_storyboard_stills`, `render_storyboard_clips`, `revise_storyboard_clip`, `assemble_storyboard_timeline`, `edit_storyboard`, `extract_script_from_storyboard`, `delete_storyboard`.

### Directing nodes

The board uses the same Director prompt and screenplay schema as the `nodetool.creative.Director` node (shot count 1 to 20, default 5). Two sibling nodes use the screenplay in a graph: `nodetool.creative.ScreenplayShots` streams each shot with a composed image-generation prompt, and `nodetool.creative.ApplyEntities` injects entity descriptors. The `ui_entity_apply` tool does the same for entities in an editor.

An example board ships as package assets, so installing one writes a single row and copies no bytes. Regenerating a shot replaces the shipped render on that card only.

### Assembly details

**Create timeline** turns the shots into a persisted timeline sequence. Shots lay end to end on a **Shots** video track at the length of the returned footage. A shot with only a still becomes an image clip. Each clip's own sound goes on a linked **Shot Audio** track, and the screenplay's narration and music become draft text-to-audio clips on **Narration** and **Music** tracks. A board linked to a script is cut jointly, so each voiced line gets its own voiceover clip. Shots without an accepted clip are skipped. Timeline playback and export mix audio clips, never a video element's track.

Every assembled clip stays linked to its shot. Selecting a new clip take afterward replaces the asset in the persisted cut. **Rebuild linked timeline…** replaces every clip the storyboard owns, including trims, and keeps tracks and clips the user added.

### Cost estimation

The workflow editor's **Cost estimate** section under the Inspector prices the graph before it runs. It uses fal and kie unit pricing and model price lookups, counts fan-out properties (`num_images`, `num_outputs`, `num_samples`, `batch_size`), and lists nodes with no known price as unknown. Caps apply per agent run (a USD cap on a chat turn and its sub-agents) and per published mini app (a spend budget).

### Storyboard workflow nodes

The pipeline ships as workflow templates for batch runs:

- **Script to Screen**: brief, direction document, style-frame-anchored keyframes, per-shot animation, cut with voiceover and score (Concat assembly).
- **Directed Film to Timeline**: the same direction assembled onto the timeline with `nodetool.timeline.AddClips` then `RenderTimeline`.

For continuity across cuts, `nodetool.creative.ShotChain` generates clips sequentially, extracting each clip's last frame to seed the next shot.

#### The approved document as a graph value

These nodes start from a document a person already approved and re-run it (a board per SKU, a script per language, a cut per aspect ratio) without re-directing. A ref is read-only unless the run derived it, so a batch cannot overwrite the template.

| Node | Takes | Gives |
|---|---|---|
| `nodetool.constant.Storyboard` / `.Entity` | a picked board or entity | `storyboard` / `entity` |
| `nodetool.entity.LoadEntity` | `entity`, or a name and kind | `entity`, `descriptor`, `name`, `kind`, `reference_image`, `voice_id` |
| `nodetool.entity.ListEntities` | `kind`, `tags`, `name_contains`, `project` | `entities`, streams one `entity` per row |
| `nodetool.entity.CreateEntity` | `image`, `kind`, `name`, `descriptor`, `key` | `entity`, `created`. Upserts on `key`, so a re-run reuses the row |
| `nodetool.storyboard.StoryboardShots` | `storyboard` | streams `shot`, `index`, `slug`, `keyframe`, `clip` |
| `nodetool.storyboard.CreateStoryboard` | `screenplay` (from `Director`), `name`, `cast`, both models, `reuse_existing` | a new writable `storyboard`, `shots`, `created`. A re-run returns the board it made |
| `nodetool.storyboard.RecastStoryboard` | `storyboard`, `cast`, `replaces`, `reuse_existing` | the copy, `invalidated`, `kept`. Keeps every frame whose prompt did not move |
| `nodetool.storyboard.RenderStills` | the derived `storyboard`, `targets`, `max_shots`, `only_stale` | `keyframes`, `rendered`, `skipped`, `failed` |
| `nodetool.storyboard.RenderClips` | the same, plus `require_keyframe` | `clips`, `rendered`, `skipped`, `failed` |
| `nodetool.storyboard.AssembleTimeline` | the derived `storyboard` | `timeline`, `skipped_shots`, `retimed`. A copy inherits the template's cut, titles and music |
| `nodetool.script.WriteScript` | `model`, `brief`, `format`, `cast`, `language` | a new `script`, `line_count` |
| `nodetool.script.FillScript` | `script`, `values` | a new `script`, `filled`, `unresolved` |
| `nodetool.timeline.FillTimelineText` | `timeline`, `values` | a new `timeline`, `filled`, `unresolved` |
| `nodetool.timeline.RetargetTimeline` | `timeline`, `aspect_ratio`, `fit` | a new `timeline`, `cropped` |
| `nodetool.game.LoadGameTemplate` | `template` | `manifest`, `slots`, streams one `slot` |
| `nodetool.game.SlotPrompt` | `slot`, `style`, `cast` | `prompt`, `width`, `height`, `kind`, `checker`, `seconds` |
| `nodetool.game.StageGameAssets` | `template`, `game_id`, `fills` | `bindings`, `paths`: candidates for a native game revision |

`RenderStills`, `RenderClips` and `AssembleTimeline` refuse a board this run did not derive. `allow_writes` is the per-node override for a graph whose whole purpose is to render the board a person picked. Four shipped examples wire them: **Per-SKU Ad Factory**, **Localized Explainer**, **Top-down Native Asset Pack**, **Three Ratios**.

### Driving it from outside

`nodetool mcp serve` exposes NodeTool over MCP (stdio) as an `execute_code` action tool plus a few direct tools. Inside an action, the storyboard, script, entity, and timeline tools are available, so an external agent can search nodes, build and run workflows, and generate media. `nodetool mcp install` writes the config for Claude Code, Codex, or OpenCode. See [NodeTool as an MCP Server](../mcp-server.md).

## Storyboard editor internals {#storyboard-editor}

User-facing behavior is in [Storyboard Editor](../storyboard-editor.md). This section holds the tool traces, the Markdown text syntax with its raw identifiers, and the camera preset storage rules.

### Agent builds a board

Without an open editor, the agent uses the backend tools in `packages/agents/src/capabilities/storyboards.specs.ts`. With the editor open, it uses the `ui_storyboard_*` tools (see [Storyboard and Creative Agent tools](#storyboards)).

User prompt: "Break this brief into six shots and render stills."

```json
{ "tool": "create_storyboard", "args": { "name": "Trail shoe ad", "aspect_ratio": "16:9" } }
{ "tool": "edit_storyboard", "args": { "storyboard_id": "<id>", "ops": [ { "op": "set_setup", "brief": "30-second trail-running shoe ad" } ] } }
{ "tool": "direct_storyboard", "args": { "storyboard_id": "<id>", "shot_count": 6 } }
{ "tool": "render_storyboard_stills", "args": { "storyboard_id": "<id>" } }
```

| Call | Change to the board document |
|---|---|
| `create_storyboard` | A new board row. `name` is required. Passing an existing `id` you own returns that row instead of a duplicate. |
| `edit_storyboard` `set_setup` | The brief is stored. `direct_storyboard` needs it. |
| `direct_storyboard` | Scenes with sluglines and shots with action, camera, and motion are written. A board that already has shots is refused unless `redirect: true`. Renders nothing. |
| `render_storyboard_stills` | With no `targets`, one still renders for every shot that has none and is not set to render directly. Each still is saved as an asset and becomes the shot's selected keyframe. Earlier stills stay as versions. |

`render_storyboard_clips` then animates each selected still (`mode` overrides the shot's `render_mode` for one call). A keyframe-mode shot with no still is reported, not rendered. `assemble_storyboard_timeline` takes `storyboard_id`, optional `name` and `fps` (default 30). `revise_storyboard_clip` takes `target` and `instruction`, and swaps the result in as the selected take while keeping the previous one as a version. `edit_storyboard` takes `expected_revision` and rejects the edit if the board changed since it was read.

### Backend storyboard tools

`list_storyboards`, `create_storyboard`, `get_storyboard`, `direct_storyboard`, `render_storyboard_stills`, `render_storyboard_clips`, `revise_storyboard_clip`, `assemble_storyboard_timeline`, `edit_storyboard`, `extract_script_from_storyboard`, and `delete_storyboard`. `delete_storyboard` removes the board with its saved version history and cannot be undone.

### Text view syntax

The **Text** view shows the whole board as Markdown. Each edit is read back into the same scenes and shots the grid shows.

```markdown
# Mars Greenhouse {#5f2c…}
A twenty second opening.

- **Style:** Warm practicals against cold Martian blue
- **Aspect ratio:** 2.39:1

# Act I (Setup) {#9a41…}
Show how fragile the greenhouse is.

## INT. GREENHOUSE DOME - DAWN {#c3d0…}
- **Lighting:** Cold blue dawn through the panels

### First light {#b7e2…}
![Still](asset://c0a1….png)

[Nova](entity://0f1e…) kneels by a single green shoot under the dome.

- **Framing:** wide
- **Motion:** Slow push in
- **Duration:** 5s
- **Continuity:** until [Shot 2](#d4f9…) — One breath of the score {#c1}
```

| You write | It becomes |
|-----------|------------|
| The first `#` heading, and the text under it | The screenplay title and the board brief |
| `- **Style:**`, `Logline`, `Aspect ratio`, `Genre`, `Cast`, `Music`, `Narration` under the title | The board's fields |
| A later `#` heading, and the text under it | An act and its objective |
| `## Slugline` and `- **Lighting:**` | A scene. Shots below it belong to it |
| `### Slug` and the text under it | A shot and its action. Shot numbers are computed |
| `Framing`, `Lens`, `Angle`, `Camera movement`, `Rig`, `Motion`, `End`, `Sound`, `Dialogue`, `Narration`, `Duration`, `Render`, `Notes` | The shot's fields |
| `[Nova](entity://<id>)` in a shot, or `- **Cast:**` and `- **Location:**` | The shot's entities |
| `![Still](asset://<id>.png)` under a shot heading | The selected still. A video file selects the clip |
| `- **Transition:**` | A transition to the next shot |
| `- **Continuity:** until [Shot 7](#<id>)` | Intent that runs from this shot through shot 7 |

The `{#…}` marks are shot, scene and act ids. They keep a shot's takes, render records, status and models with it. The marks and link targets show only on the line that holds the caret, and a new heading gets its mark when you type it. Deleting a still line clears the selection and keeps the takes. Moving a shot's lines moves the shot. Deleting a heading's mark gives the shot a new id, and its takes stay with the old one.

The selection prompt in the Text view calls `generate_text`, billed by the provider at its rates.

### Camera movement presets

- Picking presets saves their ids on the shot and writes their names into `movement`, so the screenplay camera pass and the CSV export still read one text string.
- Typing in the field replaces `movement` and detaches the presets.
- A board saved before presets has only `movement`. The preset card whose alias matches the saved text is preselected and nothing is written until the field changes (`web/src/components/storyboard/shotCameraPresets.ts`, `ShotMovementField.tsx`).
- At render time the presets compile for the board's video model, so the same move is worded differently per model family. **Prompts** in the shot editor shows the compiled camera wording and lists presets with no wording for that model. Camera and effective look selections share a three-preset limit. See [Presets](../presets.md).

## Video production tools {#video-production}

The agent runs the same four steps the buttons do, through tools in `packages/agents/src/capabilities/video-production.specs.ts`.

User prompt in chat:

> Generate two takes of the product close-up in the Northline bottle ad. Show me before you use one.

| Step | Tool call | Effect on the document |
|---|---|---|
| 1 | `prepare_video_production` with `project_id`, `destination` (`document_id`, `target_type: "timeline_clip"`, `target_id`), `review` (`status: "reviewed"`, `plan_fingerprint`), `operation: "initial_generation"`, `visual_treatment: "product_close_up"`, `speech_mode: "none"`, `route: "reference_to_video"`, `provider`, `model`, `prompt`, `reference_asset_ids`, `timing`, `candidate_count: 2` | None. Returns a manifest with two frozen candidate and request ids, before any provider spend. |
| 2 | `submit_video_production` with `prepared` (the manifest, unedited) | Generation starts. Results stay inactive and unaccepted. Existing request ids are recovered, not resubmitted. |
| 3 | `inspect_video_production_candidates` with `candidates` and optionally `preview: { kind: "preview_take", batch_id, document_id, selection }` | None. Refreshes candidate state and builds a preview. It writes no accepted media. |
| 4 | `accept_video_production_candidates` with `action: "use_take"`, `batch_id`, `document_id`, `project_id`, `candidates`, `selection`, `targets` | The chosen take becomes the clip's media. Only that destination changes. |

`provider` and `model` come from `find_model`. `action: "use_draft"` applies one selection per destination as a single atomic manifest.

Rejections the tools return, from `packages/timeline/src/production.ts`:

- "Production take count must be between 1 and 3."
- "Product close-up generation requires a resolved product reference asset."
- "The selected generation route cannot consume the required reference assets."
- "Speech duration Nms exceeds the Nms production slot."
- A destination whose host has no shared adapter is rejected and no media changes.


### On-camera performance

The route `audio_driven_performance` requires recorded speech audio, a character entity with a character reference, a source face video, an audio-driven or lip-sync model, and a shot long enough for the complete speech take. Errors the tools return:

- "On-camera performance requires recorded speech audio before video generation."
- "The selected generation route does not support audio-driven on-camera performance."

The guided Video and Storyboard editors block generation with "On-camera speech is unavailable in this guided flow" if a shot carries on-camera speech.

Related: [AI Video Production](../ai-video-production.md).

## Entity tools {#entities}

### Trace: save a render as a character

A user asks the agent to "save this render as a character called Nova". The agent calls

```json
{ "tool": "create_entity",
  "args": { "asset_id": "<image asset id>", "kind": "character", "name": "Nova",
            "descriptor": "A young astronaut with cropped black hair and a worn orange flight suit" } }
```

The image asset gets the entity marker and keeps its bytes. Its asset id becomes the entity id. A later `apply_entities` call with `text: "Nova opens the airlock"` returns the seasoned prompt and the reference image asset ids.

`create_entity` fails when the asset is not yours, is not an image, or is already an entity (use `update_entity`). Source: `packages/agents/src/capabilities/entities.specs.ts`.

| Tool | What it does |
|------|--------------|
| `list_entities` | Lists entities with id, name, kind, and descriptor. Filters by kind, text in the name or descriptor, and project. |
| `get_entity` | Reads one entity in full, including tags, reference images, voice, palette, and LoRA. |
| `apply_entities` | Returns a prompt seasoned with descriptors, plus the asset ids of the reference images. |
| `create_entity` | Tags an image asset as an entity. The image must exist already, so generate it first. |
| `update_entity` | Changes any field, or swaps the picture. Only the fields you pass change. |
| `delete_entity` | Removes the entity marker and keeps the image. |
| `ui_entity_list`, `ui_entity_apply` | The same list and apply behavior from the browser. |

Tools take the entity id, which is the id of its image asset.

### Notes

- In prompt boxes outside storyboard shots and the timeline Generate dialog, a picked entity is stored in the prompt as an `entity://` reference and expanded when the prompt is sent.
- A script speaker linked to a removed entity keeps the stale entity id until cleared.
- Entity properties are stored as metadata on the image asset. The first reference image is the primary one.
- Related: [Entities](../entities.md), [Creative Agent](../creative-agent.md#entities-reusable-ingredients).

## Script tools {#scripts}

Agents work on scripts without the editor. Tools are defined in `packages/agents/src/capabilities/scripts.specs.ts`. With the Script Editor open, the assistant edits the open script live through the `ui_script_*` tools. See [Chat & Agents](../global-chat-agents.md) and the user-facing [Script Editor](../script-editor.md).

`voice_script_lines` transcribes each take for word timings by default with provider `openai`, model `whisper-1`, so it uses `OPENAI_API_KEY` unless you pass `transcribe: false`. `asr_provider` and `asr_model` override the transcription provider and model.

Trace: the user asks "write a two-line ad read and voice it".

```json
{ "tool": "create_script", "args": { "name": "Bottle ad" } }
{ "tool": "edit_script", "args": { "script_id": "<id>", "ops": [
    { "op": "add_speaker", "name": "Narrator", "provider": "<provider>", "model": "<model>", "voice": "<voice id>" },
    { "op": "add_line", "text": "Cold water, all day.", "speaker": "Narrator" } ] } }
{ "tool": "voice_script_lines", "args": { "script_id": "<id>" } }
```

| Call | Change to the script document |
|---|---|
| `create_script` | An empty script. An existing `id` is returned as is, so a retry does not duplicate it. |
| `edit_script` | Ops apply in order. An argument an op does not take is refused instead of ignored. |
| `voice_script_lines` | With no `targets`, every unvoiced or stale line is voiced (3 at a time by default, 8 at most). Each take is saved as an audio asset, appended to its line, and made current. Earlier takes stay. Word timings are transcribed best-effort. |

Passing `provider`, `model`, and `voice` to `voice_script_lines` overrides every line's voice.

| Tool | Purpose |
|---|---|
| `list_scripts`, `get_script` | Find and read scripts. `get_script` reports each line's status: `draft`, `stale`, `voiced`, or `no_voice`. |
| `create_script`, `edit_script`, `write_script` | Create a script, change its cast, sections, and lines, or write lines with a language model. |
| `voice_script_lines` | Voice lines with the cast's voices. |
| `assemble_script_timeline` | Build the timeline the toolbar button builds. |
| `derive_storyboard_from_script` | Create a linked storyboard, as **Create storyboard** does. |
| `delete_script` | Delete a script. |

## Preset tools {#presets}

| Capability | Use |
|---|---|
| `list_presets` | Filter the catalogue by `kind`, `mode` and `family`. `kind: "studio"` lists the studios |
| `get_preset` | Read one preset or studio by id |
| `compile_presets` | Compile up to three ids for a `model` and `mode`, with an optional `provider` and `prompt`. Returns the same result as the CLI |

`generate_image`, `edit_image`, `generate_video` and `animate_image` accept `preset_ids`. The storyboard render capabilities compile each shot's `camera.preset_ids` for the board's video model. `edit_storyboard` can set a shot's `camera.preset_ids`. `compile_presets` returns `{ error }` on a failure, so the agent can correct the call.

`generate_media` accepts `preset_ids` for modes `image`, `image_edit`, `video` and `video_edit`. Agents can pass `preset_ids` to `revise_storyboard_clip`. `edit_storyboard` sets `look_preset_ids` on `set_board`, `add_shot` or `update_shot`. The frontend bridge exposes the board field through `ui_storyboard_set_style` and shot fields through the add and update tools.

Example call:

```json
{ "tool": "compile_presets",
  "args": { "preset_ids": ["camera.dolly-zoom"], "model": "<model id>", "mode": "video",
            "prompt": "A runner stops at a trail fork" } }
```

The result is `{ prompt, params, applied, warnings }`. Compiling makes no model call and costs nothing. Generating with `preset_ids` bills the chosen provider at its rates. See [Preset Catalog Reference](presets.md) for the compiler rules and stacking limits.

## Timeline tools {#timelines}

Agent and developer material for the timeline editor. The creator guides are [Video Editor](../video-editor.md) and [AI Timeline Editing](../ai-timeline-editing.md).

### Video editor: runtime and storage

- Preview uses WebGPU with a Canvas2D fallback. The fallback skips chroma key, vignette, and sharpen. Export runs in the browser or server-side.
- A timeline opens at `/timeline/:sequenceId` or as a workspace tab. Each open timeline runs in its own set of stores.
- A clip bound to a workflow clones it into a clip-private variant and exposes the workflow's `Input*` nodes as Inspector parameters.
- Each generated clip tracks a content hash of the bound workflow plus its parameter overrides. A changed hash flags the clip stale.
- Generation runs on the standard `WorkflowRunner` and reports status over the WebSocket connection, keyed by job.
- The timeline keymap preset is stored in the `timelineKeyboardPreset` setting (`premiere` default, `fcp`).
- Transition types in the render pipeline (`packages/timeline/src/render/transition.ts`): `crossfade`, `dipToColor`, `wipe`, `push`, `slide`, `zoom`, `whip`, `zoomBlur`, `glitch`, `gradientWipe`, `iris`, `lightLeak`. The clip Inspector's **Transition** section offers only the first six plus Auto and None. The storyboard beat planner labels all of them.
- Animation presets are the ids in `ANIMATION_PRESETS`: In/Out `fade`, `slide`, `pop`, `spin`, `wipe`, `blur`, `colorFade`, `typewriter` (text); Emphasis `pulse`, `flash`, `shake`, `bounce`, `squash`, `followPath`; Loop `kenBurns`, `float`, `breathe`, `rotate`, `hueShift`, `orbit`, `followPath`. Preview and export sample the same animation resolver. Word stagger is the `stagger` argument of `ui_timeline_animate_clip` and is described in [plans/motion-typography.md](../plans/motion-typography.md). Timeline document fields are in [Timeline Motion Design](../timeline-motion-design.md) and [Timeline Custom Animations](../timeline-custom-animations.md).
- Image to Video needs a model that supports the `image_to_video` capability.

### Trace: agent edits a timeline

The agent edits a saved timeline with `edit_timeline` (`packages/agents/src/capabilities/timelines.specs.ts`), up to 60 ops per call, run in order. With the editor open it picks the change up live.

User prompt: "Add a music track and lay these two clips end to end."

```json
{ "tool": "edit_timeline",
  "args": { "timeline_id": "<id>", "ops": [
    { "op": "add_track", "type": "audio", "name": "Music" },
    { "op": "add_media_clip", "asset": "asset://<id>.mp4" },
    { "op": "add_media_clip", "asset": "asset://<id>.mp4" } ] } }
```

| Step | Change to the timeline document |
|---|---|
| `add_track` | A new audio track named "Music". |
| `add_media_clip` | Each call appends a clip after the last one. |
| Result | Each op reports its own `ok`. A partial batch may already have saved the ops that succeeded, so check each result before dependent edits. |

`edit_timeline` authors the cut and renders nothing. `validate_timeline` checks it. `render_timeline` renders it as a job (`get_job` polls, `cancel_job` stops) to `mp4` (default), `webm`, `mov`, or `png_sequence`. `alpha: true` is refused with mp4. `set_timeline_document` replaces the whole document and takes `expected_updated_at`, refusing the write as a conflict if the stored row changed since you read it. A timeline of a project is also a file in the project's folder, and an edit to that file passes the same checks ([Timelines are files in the folder](../workspaces.md#timelines-are-files-in-the-folder)).

### Server-side render

The `render_timeline` agent tool and the `nodetool.timeline.RenderTimeline` node render the same sequence server-side. They run the browser exporter in headless Chrome or Chromium, so the server render matches the export. Without a browser they fall back to a Node compositor and say so in the job log. `render_timeline` returns a job id: poll it with `get_job` and stop it with `cancel_job`.

Agent authoring of motion: timeline tools can list presets, apply or clear motion, and inspect fixed-time frames before export.

### Takes and generative edits

The agent reads each clip's active take id with `ui_timeline_get_state` and edits through `ui_timeline_apply_take`, `track_object`, `ui_timeline_retarget_format`, `ui_timeline_set_reframe_subject`, `ui_timeline_add_reframe_keyframe`, and `ui_timeline_generatively_edit_clip`.

A media track stores a subject's position over source time. A clip's follow binding and reframing keys use source time rather than the timeline's absolute position, so they follow trims and moves. A changed source asset makes its media tracks stale. `track_object` needs a provider that implements `track_object` and a box around the subject at the start of the range. The **AI** panel sections are **Tracking**, **Follow object** (**Position** or **Position + scale**), **Subject matte**, and **Smart Reframe**.

`ui_timeline_generatively_edit_clip` operations: `extend`, `replace_range`, `remove_object`, `replace_object`, `restyle`, `regenerate`. The clip must be a video clip with a current asset and a positive duration. Object operations require a ready media track for the active source. The requested operation is checked against the selected model's capabilities before it runs.

### Trace: generative edit

The prompt is illustrative. The arguments and result fields come from `packages/agents/tests/timeline-generative-edit.test.ts`, where `fal` and `video-edit-model` are fixture values.

```text
User: Make this station deserted at night.
```

```json
{
  "tool": "ui_timeline_generatively_edit_clip",
  "arguments": {
    "clip_id": "clip-1",
    "instruction": "Make this station deserted at night",
    "provider": "fal",
    "model": "video-edit-model"
  }
}
```

The result is a candidate take. The clip keeps its active take (`take-1`) and its trimmed source range:

```json
{
  "generationId": "<candidate id>",
  "activeTakeId": "take-1",
  "candidate": { "id": "<candidate id>", "status": "success", "source": "video_to_video" },
  "clip": { "currentAssetId": "asset-1", "inPointMs": 40000, "outPointMs": 44000 }
}
```

The candidate's `mediaEdit` records the instruction, provider, model, and the source context (sequence, clip, source asset, source range, timeline start and duration). The edit takes effect only after a second call:

```json
{ "tool": "ui_timeline_apply_take", "arguments": { "clip_id": "clip-1", "take_id": "<candidate id>" } }
```

The clip then points at a `generative://clip-1/...` asset with `inPointMs` 0 and `outPointMs` 4000.

Errors:

- Unknown `clip_id`: the tool throws a "clip with id" error. Clip ids must be explicit.
- `ui_timeline_apply_take` on a take that is not an AI edit candidate throws an "AI edit candidate" error.
- `provider` without `model` (or the reverse) is rejected before any call.

### Interchange export

`exportInterchange` in `@nodetool-ai/timeline` writes an editable project document for another editor. The native editor's **File > Export to Premiere Pro** calls it through the server, and **File > Import Premiere XML** reads a sequence back. Both need a timeline opened from a server. No other editor menu, CLI command, or agent tool calls it yet.

| Target | Output | Carries |
|---|---|---|
| Final Cut Pro | FCPXML | sequence format, active media, timing, tracks, and markers |
| Premiere Pro | Legacy FCP XML | sequence format, active media, audio and video tracks, timing, markers, Basic Motion (scale, rotation, position, anchor), opacity, constant speed and reverse, clip volume, fades, track fader and pan, with keyframes |

The export report names missing media and edits that need baking, including effects, masks, 3D transforms, speed ramps and freezes, presets and keyframes on other properties, captions, and unsupported clip types. FCPXML also lists transforms, opacity, speed, volume, and fades. NodeTool never reports an incomplete editable export as lossless.

## Sketch and 3D tools {#sketch-3d}

Creator pages: [Sketch Editor](../sketch-editor.md), [3D Editor](../3d-editor.md), [Blender Nodes](../blender.md).

### Sketch tools

The agent edits a saved sketch's layer structure with `edit_sketch`, which takes `ops` that run in order against the stored document. An open editor picks the change up live. It never reads or writes pixels: painting and generation happen in an open editor or a workflow run.

From `packages/agents/tests/capabilities-sketches.test.ts`, on a sketch created with `create_sketch`:

```json
{
  "tool": "edit_sketch",
  "arguments": {
    "image_document_id": "<sketch id>",
    "ops": [{ "op": "add_layer", "name": "Ink" }]
  }
}
```

The result reports `applied: 1` and the layer list changes from `["Layer 1"]` to `["Layer 1", "Ink"]`. The id may be the full 32-character id or its first 12 characters. Run `validate_sketch` afterwards. Other sketch tools are `list_sketches`, `get_sketch`, `render_sketch`, and the `*_sketch_version` tools.

An open editor receives the `ui_sketch_*` tools. `nodetool sketch debug` replays them headlessly (see [CLI: nodetool sketch](../cli.md#nodetool-sketch)).

Details the creator page leaves out:

- Typing `@` in a layer's generation prompt inserts an `entity://` reference. The server replaces it with the entity's name, descriptor, and reference image at generation time.
- A layer is flagged stale (by content hash) when its prompt, parameters, or an upstream layer change. **Re-generate Stale** runs stale layers in dependency order and skips locked layers.
- Layer generation runs as a job over the WebSocket connection, with progress on the layer.
- A workflow bound to a layer needs an image output node (`ImageOutput`, `MaskOutput`, or `Output`).
- Transform: Perspective and Deform produce a four-point quad (a projective transform via axis projection). A multi-layer union applies one affine delta and cannot carry a quad, so a layer carrying a quad is transformed on its own. `.` resets the box to identity.

### 3D model tools

#### Live editor tools

While the 3D Editor is the visible tab, the agent works on the live scene and every change is an undoable step. It can list the scene and read an object in full, add shapes, lights, and groups, select, rename, duplicate, hide, and delete objects, reparent them, set transforms (rotation in degrees), change material and light values, resize a shape's geometry, undo and redo, frame the scene, and capture a screenshot of the viewport. The screenshot shows the model only. Objects are addressed by id or by name (case-insensitive).

#### Tools without an editor

With no editor open, the agent edits a model by asset id through `list_model3ds`, `create_model3d`, `get_model3d`, `edit_model3d`, `validate_model3d`, and `render_model3d`. These edits save straight to the asset, and an open editor reloads it. See the [nodetool-3d-scene skill](https://github.com/nodetool-ai/nodetool/blob/main/packages/system-skills/nodetool-3d-scene/SKILL.md) for the operation list. Framing the scene and capturing the viewport need an open editor with WebGL.

#### Trace: building a scene by asset id

From `packages/agents/tests/capabilities-model3d.test.ts`. The prompt is illustrative.

```text
User: Add a crate and a sun, then lift the crate, color it orange, and call it Cargo.
```

```json
{
  "tool": "create_model3d",
  "arguments": {
    "name": "studio",
    "ops": [
      { "op": "add_object", "kind": "box", "name": "Crate" },
      { "op": "add_object", "kind": "directionalLight" }
    ]
  }
}
```

The result holds `model_id`, `name` (`studio.gltf`), and `url` (`asset://<model_id>.gltf`). The scene has two objects: `Crate` (a mesh) and `Directional Light`. Then:

```json
{
  "tool": "edit_model3d",
  "arguments": {
    "model_id": "<model_id>",
    "ops": [
      { "op": "set_transform", "target": "Crate", "position": [0, 2, 0] },
      { "op": "set_material_color", "target": "Crate", "color": "#ff8800" },
      { "op": "rename_object", "target": "Crate", "name": "Cargo" }
    ]
  }
}
```

The result reports `validation.ok: true` and the first object as `{ "name": "Cargo", "position": [0, 2, 0], "materialColor": "#ff8800" }`. A fresh `get_model3d` returns the same state, because the edit is written to the asset.

#### If an edit fails

- A failing operation rejects the whole call and leaves the asset unchanged. The error names the operation, for example `ops[1] (set_material_color) failed: No object found matching "Ghost"`.
- An unknown `op` returns an error that lists the valid operations. An operation with missing arguments, such as `set_visibility` without a boolean, returns an error and applies no default.
- An empty `ops` array fails with "non-empty array". One call takes at most 60 operations.

#### `render_model3d`

`render_model3d` renders the saved model through headless Blender and stores a PNG image asset. Defaults match the common Blender node properties: orbit camera (azimuth 45, elevation 25, field of view 35, plus a zoom multiplier) when the model has no scene camera, 1024 x 1024 plus a resolution percentage, `studio` lighting (`studio`, `soft`, or `flat`, used only when the scene has no lights), light intensity 1, background `#808080` or transparent, engine `eevee` (`cycles` is slower and cleaner), 16 samples, denoise on (applies to Cycles).

- Blender 5.2 or newer must be installed on the server machine. Discovery order and `BLENDER_PATH` are in [Blender Nodes](../blender.md#set-up-blender).
- On a cloud deployment the tool answers "Rendering 3D models is not available on this deployment."
- A server without Blender answers "this server has no Blender installed. Rendering needs a desktop install with Blender 5.2 or newer (set BLENDER_PATH to its executable)."
- The render reads the **saved** asset, not unsaved editor state.
- A render can run in the background. The agent gets a generation id and collects the image later (see `await_generation`).
- The graph equivalents are the Blender node types `nodetool.blender.RenderImage`, `RenderAnimation`, `RenderPasses`, `PrepareForEngine`, and `ExportModel`.

#### File format details

- Lights are written with the glTF `KHR_lights_punctual` extension.
- Hidden objects are saved with a `nodetool_hidden` value in the node's `extras`. Other glTF tools ignore it and show the objects.
- In a workflow, a model asset becomes a `nodetool.constant.Model3D` node.

### Blender node details

- Node types live in the `nodetool.blender` namespace.
- Settings and environment: a saved `BLENDER_PATH` setting (ignored on cloud deployments), the `BLENDER_PATH` environment variable, `blender` on `PATH`, then OS locations. A server with no Blender can use a worker named by `NODETOOL_WORKER_URL`. Local Blender wins over a worker. See [Configuration](../configuration.md).
- `RenderPasses` depth: `png16` is normalized between `depth_near` and `depth_far`, with background 65535. `exr` is raw float depth with background infinity.
- `ExportModel` output `file` is an asset with the format and MIME type in its metadata.

## Audio tools {#audio}

The audio editor's assistant edits the open audio through the `ui_audio_*` tools. Source: `web/src/lib/tools/builtin/audio.ts`, with names, descriptions and argument shapes from the shared contracts. The user page is [Audio Editor](../audio-editor.md).

Each edit is one undo step, and nothing is saved until the assistant calls `ui_audio_save`. The tools are `ui_audio_get_state`, `ui_audio_edit`, `ui_audio_list_effects`, `ui_audio_apply_effect`, and `ui_audio_save`.

`ui_audio_get_state` returns the duration, sample rate, channel count, unsaved state, the user's selection, and a peak level from 0 to 1 per window, which is how the assistant finds silence. `ui_audio_edit` takes `op` (`trim`, `delete`, `silence`, `fade_in`, `fade_out`, `normalize`, `reverse`, `gain` with `gain_db` from -60 to 24) and an optional `start` and `end` in seconds.

The editor decodes the asset into samples with Web Audio, and **Save** encodes 16-bit PCM WAV and sets the content type to `audio/wav`. A silent region is left unchanged by normalize. Amplify and Quieten multiply by 1.4 and 0.7, and peaks above full scale clip.

### Trace: trim leading silence

From `packages/agents/tests/audio-tool-loop.test.ts` (the `trim-leading-silence` case, on a 5 second recording with 2 seconds of silence first). The audio fixture is the test's, and the call order is its golden transcript.

```text
User: This recording starts with dead air before anyone speaks. Remove the silence at the start and save the audio.
```

```json
[
  { "tool": "ui_audio_get_state", "arguments": {} },
  { "tool": "ui_audio_edit", "arguments": { "op": "delete", "start": 0, "end": 2 } },
  { "tool": "ui_audio_save", "arguments": {} }
]
```

The state call shows peaks of 0 for the first 2 seconds. After the delete, the duration is 3 seconds and the first peaks are above 0.1. After the save, the draft is clean.

### If a call fails

The tool throws and the audio is unchanged. Messages from the same test file:

- `trim` or `delete` without a range: `"trim" needs a range`.
- `start` without `end`: "Pass both `start` and `end`".
- `gain` without `gain_db`: "needs gain_db".
- Unknown effect id: `Unknown effect "nope"`. Unknown or out-of-range parameter: `"reverb" has no parameter "wet"` or `"mix" must be between 0 and 100`.
- If the audio changed while an effect rendered, the result is dropped and the tool asks the assistant to read the state again and retry.

## Document and game tools {#documents-games}

### Document editor

These tools work on a Markdown document whether or not it is open. An open editor shows each change without reloading. Source: the document tools in `packages/agents/`.

| Tool | Does |
|---|---|
| `create_document` | Create a document from Markdown. A name that exists gets a numbered copy. |
| `read_document` | Return the Markdown with name, path and `updated_at`. |
| `edit_document` | Apply exact-text replacements, replace the whole content, or append. |
| `list_document_versions`, `create_document_version`, `rename_document_version`, `delete_document_version`, `restore_document_version` | Manage snapshots. Delete always asks the user first. |
| `import_document`, `export_document` | Import a file, or write `.md`, `.txt`, `.pdf` or `.html`. |
| `import_google_doc`, `export_google_doc` | Google Docs in and out. |

`write_file` and `edit_file` on a document path keep the same pre-turn snapshot as `edit_document`.

```text
User: Tighten the Tone section of Trailer brief.md.
```

The agent calls `read_document`, then `edit_document` with an `edits` list. Opening **Snapshots** afterwards shows the brief as it was before the turn.

#### Embed syntax

Every embed is saved as Markdown image syntax, so the file still reads in any other Markdown editor. A project file is written as a path relative to the document, and any other asset as its `asset://` locator.

```markdown
![Teaser](assets/teaser.mp4)
![Hero still](asset://<asset id>)
![Unmasked](storyboard://<storyboard id>#shot=<shot id>)
![Cut v3](timeline://<timeline id>)
![Voiceover](script://<script id>)
```

### Text and SVG documents

The SVG assistant edits the same draft as the editor through `ui_svg_get_state`, `ui_svg_set_markup`, `ui_svg_replace`, and `ui_svg_save`. Edits show in the preview and undo like the user's own. The file is not saved until `ui_svg_save` runs.

Trace from the `recolor-and-save` case in `packages/agents/src/evals/surfaces/svg.ts`, whose fixture is an SVG with a blue circle (`fill="#1e64ff"`). The golden transcript is in `packages/agents/tests/svg-tool-loop.test.ts`.

```text
User: The SVG has a blue circle. Make the circle red, then save the SVG.
```

```json
[
  { "tool": "ui_svg_get_state", "arguments": {} },
  { "tool": "ui_svg_replace", "arguments": { "find": "fill=\"#1e64ff\"", "replace": "fill=\"#ff0000\"" } },
  { "tool": "ui_svg_save", "arguments": {} }
]
```

The draft markup changes from `#1e64ff` to `#ff0000` and the draft is marked unsaved. After `ui_svg_save` the asset holds the new markup.

If a call fails, the draft stays as it was:

- `ui_svg_set_markup` with markup that does not parse: "The markup was not applied".
- `ui_svg_replace` whose result does not parse: "The replacement was not applied".
- `find` that is absent: "does not occur". `find` that occurs more than once: add surrounding markup until it matches one place.

The live preview runs the markup through `sanitizeSvgMarkup` (`web/src/utils/sanitizeSvg.ts`, DOMPurify with the SVG profiles). It forbids the `script` and `foreignObject` tags and the `onload`, `onerror` and `onclick` attributes. The stored asset is not changed, and the preview can differ from the raw file if the file relies on them.

### Game editor

Source: `packages/agents/` (tests in `packages/agents/tests/capabilities-game.test.ts`). The creator page is [Game Editor](../game-editor.md). Agent authoring guidance is on [Agent authoring](../game-engine/agent-authoring.md), so this section lists only the tools the editor assistant has.

**Show assistant** opens a chat beside the viewport. The agent knows the open game, your selected entities, and the script you are editing. It follows the `native-game` skill and edits the draft through these tools:

| Tool | Use |
|---|---|
| `get_native_game` | Read an outline, one entity, or the whole document |
| `edit_native_game` | Apply ordered operations. The whole edit is validated before it is written |
| `capture_native_game_frame` | Render frames to look at the result |
| `playtest_native_game` | Run recorded inputs and check assertions |
| `autoplay_native_game` | Steer a 2D player toward a target or win. 3D is not supported, so give a route |
| `generate_game_asset`, `install_native_game_asset` | Generate or import an asset and bind it to a slot, or install a staged candidate |
| `publish_native_game` | Publish, only when you ask |
| `build_native_game` | Write a standalone web build or a Tauri or Expo project |
| `list_example_games`, `get_example_game`, `install_example_game` | Study or copy a shipped game |

For a new game or an art overhaul the agent also loads `game-direction`, which fixes a player promise, style string, layer plan, feel parameters, and pacing sheet before asset prompts.

#### Trace: adding a HUD label

From `packages/agents/tests/capabilities-game.test.ts`. The prompt is illustrative.

```text
User: Show the score in the top right.
```

```json
{
  "tool": "edit_native_game",
  "arguments": {
    "game_id": "<game id>",
    "ops": [{
      "op": "set_ui",
      "ui": { "nodes": [
        { "kind": "panel", "id": "scorePanel", "anchor": { "x": 1, "y": 0 }, "width": 120, "height": 32 },
        { "kind": "text", "id": "score", "parent": "scorePanel", "text": "Score 0" }
      ] }
    }]
  }
}
```

The result carries the updated `document`, and `document.ui` equals the tree sent. A tree whose `parent` names a node that is not an earlier node is rejected whole:

```json
{ "error": "Game edit rejected",
  "issues": [{ "op_index": 0,
    "message": "HUD node orphan names parent missing, which is not an earlier node of this tree" }] }
```

The draft is unchanged after a rejection. `{ "op": "set_ui", "ui": null }` removes the HUD.

Agent edits land in your draft. The **Changes** list groups them by chat message. **View in chat** jumps to the message and **Undo** reverts that group. Your later edits are merged, and overlapping ones show as conflicts.


#### Creating and examples

- Agent: `create_native_game` with a project, a name, and a dimension. For 3D it can pass `template: "exploration"`.
- The server reads shipped example games from `*.game.json` files. `NODETOOL_EXAMPLE_GAMES_DIR` points it at another folder, and a missing folder yields no examples. See [Configuration](../configuration.md).
- The docks share the dock module with the timeline editor.
- The document is one JSON document. Publishing creates an immutable revision.

#### Builds

- Agent: `build_native_game` for an owned revision writes the folder under the project workspace and returns the path. `target: "tauri"` builds the desktop project and `target: "expo"` the mobile one.
- CLI: `nodetool game build game.json --out game-build`. See [`nodetool game`](../cli.md#nodetool-game), which also covers `validate`, `simulate`, and `capture`. Desktop: `nodetool game build game.json --out game-desktop --target tauri --name "Cave Run"` (add `--compile` to build the executable). Mobile: `--target expo --name "Cave Run"`.
- Web build folder: `index.html`, `game.json`, a player script, and `assets/` with media named by digest. A 2D build adds a stylesheet and script runtime. A 3D build adds `manifest.json`, models, colliders, and pinned runtime files. Installed media must exist, match its recorded digest, and use a supported format, or the build fails.
- Desktop project: `dist/` (web player), `src-tauri/` (native shell, icons, `tauri.conf.json`), `package.json`, and a README. The identifier defaults to `ai.nodetool.game.<name>`. Installers: install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) and run `npm install && npm run build`. Output lands in `src-tauri/target/release/bundle/`. `cargo build --release` in `src-tauri/` makes the executable alone. The in-editor executable build lands in `bin/` inside the build's project folder and a hosted server refuses it.
- Mobile project: `App.js`, `app.json` (name, identifier, version, orientation), `assets/`, `package.json`, `eas.json`, and a README. The game is one page, `assets/game/game.html`, loaded under the fixed origin `https://game.invalid/`, which never resolves and gives the player the secure origin it needs for asset digests, WebAssembly, and saved games. A build carries at most 128 MB of game files. Run `npm install && npx expo start`, or `eas build --platform android --profile preview` (APK) or `eas build --platform ios`. `npx expo run:android` and `npx expo run:ios` build locally.
- Schema limits per game: up to 8 render effects, 32 collision layer names, and 32 lights and backgrounds per scene. A sprite has up to 5 visual animation tracks. 3D triangle-mesh colliders require static bodies. Physics hierarchies reject scale and competing pose owners.
- Retained construction rebuilds are also exposed through `nodetool.games.previewAuthoring` and `applyAuthoring`. See [Retained Construction](../game-engine/construction.md).

### Game scripts

A script is a behavior on an entity. In the inspector choose **Add behavior**, then **Script** in 2D, or **Add script** in 3D. Choose **Edit script** to open the script pane. The pane is a code editor with type hints for the engine's script API, and each edit goes into the draft.

A script is a function expression that receives the current tick, input, events, and its own entity, and returns `{ state, commands }`.

```js
/** @type {GameScript} */
({ state }) => ({ state, commands: [] })
```

Rules that apply in both dimensions:

- Keep values you need later in returned `state`. The engine reuses a sandbox only for expressions proven to read their input without retaining hidden state. Other sources run in a fresh context on every call. Input mutations never reach another call.
- Commands change the world. Shared commands include `emit`, `hud`, `playAnimation`, `despawn`, `spawn`, and `sceneTransition`.
- Physics ray and shape query results arrive on the next tick. The global `world` API reads the current tick's starting state immediately.
- Events a script receives come from the previous tick.
- The engine runs at a fixed 60 ticks per second and seeds `random`, so a replay gives the same result.

| | 2D | 3D |
|---|---|---|
| Position input | `entity.x`, `entity.y`, `touching` sides | XYZ `entity.position`, `velocity`, `grounded`, and axes and look input |
| Movement commands | `setVelocity`, `setPosition`, `setVisual` | `characterIntent`, `setKinematicPose`, `impulse`, `setVelocity`, `teleport`, `setVisual` |
| Spatial queries | `world.get` and `world.query` | `world.get` and `world.query`, plus ray and shape commands with a `queryId` |
| Camera | The camera entity | Perspective or orthographic, fixed or follow |

#### Read the world during a script call

`world.get(id)` returns an entity record or `undefined`. `world.query({ source?, tag?, near?, radius?, limit? })` returns matching IDs in runtime entity order. Both read one immutable tick-start snapshot of active entities, so they do not show changes from earlier scripts in the same tick. Returned values are copies.

- A 2D record has `id`, `source`, `x`, `y`, `velocityX`, `velocityY`, `grounded`. A 3D record has `id`, `source`, `position`, `velocity`, `grounded`, with `{ x, y, z }` vectors.
- `near: { x, y, z? }` needs a nonnegative `radius`. Distance uses entity centers and includes the boundary. Omitted `z` is 0.
- `source` matches the original entity ID, not a 3D prefab asset ID. `tag` matches the entity's `tags`, and legacy 2D documents have none, so a `tag` filter returns an empty array there.
- `limit` defaults to 1024 and accepts 0 to 1024. A call allows 64 combined `get` and `query` attempts, and exceeding that fails the call even if the script catches the exception. Query arguments are limited to 4096 JSON characters, `get` IDs to 1024 characters, and responses to 64 KiB. Queries are unavailable while the source initializes.
- The legacy `input.world` array is unchanged. In 2D it holds active entities with a collider or camera, while `world` queries cover every active entity.

```js
/** @type {GameScript} */
(input) => ({
  state: world.query({ near: { x: input.entity.x, y: input.entity.y }, radius: 120, limit: 8 }),
  commands: []
})
```

The pane footer shows source length against the 16,384 character limit, **maxCommands**, and **maxTickMs**. In 2D both limits are editable on the script behavior, defaulting to 16 commands and 8 ms, with ranges 1 to 64 and 1 to 50 ms. On Linux and in the browser **maxTickMs** counts wall time, including waits for a processor or a blocking host callback. Other server and CLI hosts use thread CPU time when available.

When a script throws during play, the 2D pane shows the tick and message. **Replay to tick N** reruns to the tick before the failure. **Ask the assistant** drafts a message with scene, entity, behavior index, tick, and error. 2D also has **Run 10 s**, a headless ten-second run that reports script calls, total script time, and a per-entity breakdown. The 3D editor shows **Replay before error**. Agents and JS scripts can build a whole document with the `@nodetool-ai/sandbox-game` pack.


