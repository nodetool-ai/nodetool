---
layout: page
title: "Creative Agent"
permalink: /creative-agent
description: "Brief to finished cut: the Director writes a typed screenplay, the storyboard renders stills then clips per shot, and the cut assembles onto the timeline editor."
image: /assets/creative-agent/storyboard-surface.png
---

A Director agent turns a brief into a typed screenplay on a [storyboard](storyboard-editor.md). You can drive each step from the UI, from chat (the agent calls the same `ui_*` tools), or from an external agent over MCP.

> **Runs:** locally or cloud, depending on the models you pick. **Needs:** a text model for the Director and an image and video model for renders. Hosted models need their provider key (see [Providers](providers.md)). **Costs:** stills and clips on paid providers are billed at provider rates. The Director call is billed when its text model is paid. Local models cost nothing per render.
{: .callout-note}

## Trace: brief to timeline

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

Rules enforced by the tools:

- `ui_storyboard_direct` refuses a board that already has a screenplay unless `redirect: true`. A re-direct keeps the ids, media, and status of shots it retains.
- Directing without a brief fails. Write it with `ui_storyboard_set_setup` first.
- `ui_storyboard_generate_clip` needs a selected still on the shot. `ui_storyboard_revise_shot` needs a current clip.
- `staleOnly: true` on either generate tool renders only shots whose current version no longer matches the style, model, aspect ratio, or prompt.
- `ui_storyboard_remove_shot` deletes the shot and its media and cannot be undone from the agent side.
- A write that cannot be saved fails the tool call with "was applied to the open storyboard but did not persist".

The full `ui_storyboard_*` set also covers `get_state`, `set_screenplay`, `set_entities`, `add_shot`, `update_shot`, `select_shot`, `extract_script`, `relink_script`, `reproject_shots`, `set_duration_source`, scenes, versions, and style.

## The workflow, end to end

{% mermaid %}
graph LR
  brief["Brief"]
  direct["Direct<br/>(Director agent)"]
  stills["Stills<br/>(cents)"]
  pick["Pick a still"]
  clips["Clips<br/>(dollars)"]
  revise["Revise<br/>(video-to-video)"]
  assemble["Assemble<br/>timeline"]
  nle["Timeline editor<br/>(trim, mix, captions)"]
  export["Export"]
  brief --> direct --> stills --> pick --> clips --> assemble --> nle --> export
  clips --> revise --> clips
  revise -. "round-trips into the cut" .-> nle
{% endmermaid %}

Stills come before clips because a still usually costs far less.

## Start from a shipped board

**New → New storyboard…** (under **Blank documents**) opens a list with
**Blank storyboard** and the example boards that ship with the install. The
**Storyboard** entry under **Guided flows** in the same menu walks you through
four steps (Idea, Story, Entities, Look) and ends on the rendered board. An example board arrives finished: every shot has its action text, still, and clip. The media are package assets, so installing one writes a single row and copies no bytes. Regenerating a shot replaces the shipped render on that card only.

## Direct: brief in, screenplay out

In **Board settings**, write a brief and a style, pick an aspect ratio and a shot count (3, 4, 5, 6, 8, 10, or 12), and press **Direct**. **Re-direct** replaces every shot (see [Direct a screenplay](storyboard-editor.md#direct-a-screenplay)). Each shot carries action, camera (framing, lens, angle, movement, equipment), motion, and duration.

The board uses the same Director prompt and screenplay schema as the `nodetool.creative.Director` node (shot count 1 to 20, default 5). Two sibling nodes use the screenplay in a graph: `nodetool.creative.ScreenplayShots` streams each shot with a composed image-generation prompt, and `nodetool.creative.ApplyEntities` injects entity descriptors.

## The storyboard: plan, pick a still, then spend

<img src="{{ '/assets/creative-agent/storyboard-surface.png' | relative_url }}" alt="Storyboard surface: a grid of six shot cards, each with its still, shot number and status, over the inspector for the selected shot">

Each card shows the still or clip, a shot label such as `SH 03`, a status pill, and the action line. A shot with a clip shows no pill. **Render stills** and **Render clips** in the toolbar each open a dialog where you pick the model and see an estimated cost before confirming. Select a card to dock a footer under the grid with **Edit**, **Iterate**, **Regenerate**, and **Delete**. **Iterate** is disabled until the shot has a clip. Regenerating shot 3 does not re-render other shots. Pill values, takes, and the footer's links are in [Storyboard Editor](storyboard-editor.md#the-board).

## Assemble: from storyboard to timeline

<img src="{{ '/assets/creative-agent/assembled-timeline.png' | relative_url }}" alt="Assembled cut open in the timeline editor: shot clips on a video track, narration and music tracks">

**Create timeline** (below the shot grid, enabled once a shot has a still or
clip) turns the shots into a persisted timeline sequence and opens the editor.
Shots lay end to end on a **Shots** video track at the length of the returned footage. A shot with only a still becomes an image clip. Each
clip's own sound goes on a linked **Shot Audio** track, and the screenplay's
narration and music become draft text-to-audio clips on **Narration** and
**Music** tracks. A board linked to a script is cut jointly, so each voiced
line gets its own voiceover clip and the editor shows a **Script** tab.
Shots without an accepted clip are skipped. Timeline playback and export mix audio clips, never a video element's track, so the shot-audio clips carry a video model's dialogue and room tone. Mute one when a shot should play silent under narration.

Every assembled clip stays linked to its shot. Selecting a new clip take afterward replaces the asset in the persisted cut. **Rebuild linked timeline…** replaces every clip the storyboard owns, including trims, and keeps tracks and clips you added yourself.

## Entities: reusable ingredients

<img src="{{ '/assets/creative-agent/entity-library.png' | relative_url }}" alt="Entity library with a character, location, style, and prop">

An entity is an image asset tagged with a kind (character, location, style, prop), a name, and a descriptor, which is pasted verbatim into every prompt that names it. See [Entities](entities.md) for creating and editing them. Entities reach prompts through the `ApplyEntities` node or the `ui_entity_apply` tool.

<img src="{{ '/assets/screenshots/storyboard-board.png' | relative_url }}" alt="Storyboard board with Board settings open: the Entities field carrying four entity chips, over the shot grid">

On a storyboard, the **Entities** field under **Board settings** pins a
cast to the board: styles and locations season every shot's still and clip
prompt, while characters and props activate on the shots that mention them by
name. Open a shot with **Edit** and the board's entities show as chips. Click one
to include or exclude it for that shot. The **Direct** run also hands the cast
to the screenplay model so shots reference entities by their exact names.

Typing `@` in the chat composer or the workflow editor's Prompt node lists entities first. A picked entity carries its descriptor and reference image into the generation.

## Cost governance

The **Render stills** and **Render clips** dialogs and the per-shot cost line price the request before you confirm, and report how many requests could not be priced. In the workflow editor, the **Cost estimate** section under the Inspector prices the graph before it runs. It uses fal and kie unit pricing and model price lookups, counts fan-out properties (`num_images`, `num_outputs`, `num_samples`, `batch_size`), and lists nodes with no known price as unknown. Caps apply per agent run (a USD cap on a chat turn and its sub-agents) and per published mini app (a spend budget). See [Costs and credits](costs-and-credits.md).

## Graph templates

The same pipeline ships as workflow templates for batch runs:

<img src="{{ '/assets/creative-agent/script-to-screen-editor.png' | relative_url }}" alt="Script to Screen template open in the workflow editor">

- **Script to Screen** — brief → direction document → style-frame-anchored
  keyframes → per-shot animation → cut with voiceover and score (Concat assembly).
- **Directed Film to Timeline** — the same direction assembled onto the
  timeline with `nodetool.timeline.AddClips → RenderTimeline`.

For continuity across cuts, `nodetool.creative.ShotChain` generates clips
sequentially, extracting each clip's last frame to seed the next shot.

### The approved document as a graph value

These nodes start from a document a person already approved and re-run it (a board per SKU, a script per language, a cut per aspect ratio) without re-directing. A ref is read-only unless the run derived it, so a batch cannot overwrite the template.

| Node | Takes | Gives |
|---|---|---|
| `nodetool.constant.Storyboard` / `.Entity` | a picked board or entity | `storyboard` / `entity` |
| `nodetool.entity.LoadEntity` | `entity`, or a name and kind | `entity`, `descriptor`, `name`, `kind`, `reference_image`, `voice_id` |
| `nodetool.entity.ListEntities` | `kind`, `tags`, `name_contains`, `project` | `entities`, streams one `entity` per row |
| `nodetool.entity.CreateEntity` | `image`, `kind`, `name`, `descriptor`, `key` | `entity`, `created` — upserts on `key`, so a re-run reuses the row |
| `nodetool.storyboard.LoadStoryboard` | `storyboard` | `shots`, `entities`, `style`, `aspect_ratio`, `name`, both models, `shot_count` |
| `nodetool.storyboard.StoryboardShots` | `storyboard` | streams `shot`, `index`, `slug`, `keyframe`, `clip` |
| `nodetool.storyboard.CreateStoryboard` | `screenplay` (from `Director`), `name`, `cast`, both models, `reuse_existing` | a new writable `storyboard`, `shots`, `created` — a re-run returns the board it made |
| `nodetool.storyboard.RecastStoryboard` | `storyboard`, `cast`, `replaces`, `reuse_existing` | the copy, `invalidated`, `kept` — keeps every frame whose prompt did not move |
| `nodetool.storyboard.RenderStills` | the derived `storyboard`, `targets`, `max_shots`, `only_stale` | `keyframes`, `rendered`, `skipped`, `failed` |
| `nodetool.storyboard.RenderClips` | the same, plus `require_keyframe` | `clips`, `rendered`, `skipped`, `failed` |
| `nodetool.storyboard.AssembleTimeline` | the derived `storyboard` | `timeline`, `skipped_shots`, `retimed` — a copy inherits the template's cut, titles and music |
| `nodetool.script.WriteScript` | `model`, `brief`, `format`, `cast`, `language` | a new `script`, `line_count` |
| `nodetool.script.FillScript` | `script`, `values` | a new `script`, `filled`, `unresolved` |
| `nodetool.timeline.FillTimelineText` | `timeline`, `values` | a new `timeline`, `filled`, `unresolved` |
| `nodetool.timeline.RetargetTimeline` | `timeline`, `aspect_ratio`, `fit` | a new `timeline`, `cropped` |
| `nodetool.game.LoadGameTemplate` | `template` | `manifest`, `slots`, streams one `slot` |
| `nodetool.game.SlotPrompt` | `slot`, `style`, `cast` | `prompt`, `width`, `height`, `kind`, `checker`, `seconds` |
| `nodetool.game.StageGameAssets` | `template`, `game_id`, `fills` | `bindings`, `paths` — candidates for a native game revision |

`RenderStills`, `RenderClips` and `AssembleTimeline` refuse a board this run
did not derive. `allow_writes` is the per-node override for a graph whose whole
purpose is to render the board a person picked. Four shipped examples wire
them: **Per-SKU Ad Factory**, **Localized Explainer**, **Top-down Native Asset
Pack**, **Three Ratios**.

## Driving it from outside

`nodetool mcp serve` exposes NodeTool over MCP (stdio) as an `execute_code` action tool plus a few direct tools. Inside an action, the storyboard, script, entity, and timeline tools are available, so an external agent can search nodes, build and run workflows, and generate media. `nodetool mcp install` writes the config for Claude Code, Codex, or OpenCode. See [NodeTool as an MCP Server](mcp-server.md).
