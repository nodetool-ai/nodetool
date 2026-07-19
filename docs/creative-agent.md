---
layout: page
title: "Creative Agent"
permalink: /creative-agent
description: "Script-to-screen video production in NodeTool: a Director agent writes the screenplay, the storyboard gates spend shot by shot, and one click assembles the cut into the timeline editor."
image: /assets/creative-agent/storyboard-surface.png
---

NodeTool turns a one-line brief into a finished film through a pipeline you
can inspect and steer at every step: a Director agent writes a typed
screenplay, a storyboard renders cheap stills you pick from before video
spend, each shot becomes a clip you can revise in place, and one click
assembles the cut into the timeline editor for finishing and export.

The whole chain is drivable three ways: from the UI, from chat (the agent
uses the same `ui_*` tools), or from an external agent such as Claude Code
over MCP (`nodetool mcp serve`).

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

Cheap stages come first. A still costs cents; a clip costs dollars; you pick
the still you like before paying for the clip. Nothing renders twice unless
you ask for it, and a revision made after assembly lands in the persisted cut
automatically.

## Direct: brief in, screenplay out

Open a storyboard (**New → New storyboard**), write a brief and a visual
style, pick a shot count, and press **Direct**. The
`nodetool.creative.Director` node returns a typed screenplay — title,
logline, style bible, narration, music direction, and one structured shot per
card: action, camera (framing, lens, angle, movement), motion, and duration.

Two sibling nodes make the screenplay usable inside any workflow graph:
`nodetool.creative.ScreenplayShots` streams each shot with a composed
image-generation prompt, and `nodetool.creative.ApplyEntities` injects entity
descriptors for consistency (below).

## The storyboard: plan, pick a still, then spend

<img src="{{ '/assets/creative-agent/storyboard-surface.png' | relative_url }}" alt="Storyboard surface with five shot cards across every status">

Each card walks one shot through its lifecycle (**Planned → Still ready →
Rendering → Rendered**) with the actions that fit its state: generate stills
until one looks right, click the one to use, generate the clip from it,
revise the clip with a text instruction ("make it darker, add rain").
Revision runs video-to-video on the existing clip and swaps the result in
place, so fixing shot 3 never means re-rolling shots 1–5.

Agents drive the same surface through nine `ui_storyboard_*` tools:
`get_state`, `set_screenplay`, `add_shot`, `update_shot`, `generate_keyframe`,
`generate_clip`, `revise_shot`, `assemble_timeline`, and `select_shot`.

## Assemble: from storyboard to timeline

<img src="{{ '/assets/creative-agent/assembled-timeline.png' | relative_url }}" alt="Assembled cut open in the timeline editor: shot clips on a video track, narration and music tracks">

**Assemble timeline** turns the rendered shots into a persisted timeline
sequence and opens the editor: shot clips laid end to end on a video track,
the screenplay's narration and music as draft text-to-audio clips on their
own tracks, the script panel carrying the screenplay text. From here it's a
normal edit — trim, transitions, audio mix, captions — and export.

Every assembled clip stays linked to its shot. Revise a shot on the
storyboard afterward and the new render replaces the clip in the persisted
cut. The storyboard plans; the timeline finishes; revisions flow forward.

## Entities: reusable ingredients

<img src="{{ '/assets/creative-agent/entity-library.png' | relative_url }}" alt="Entity library with a character, location, style, and prop">

Characters, locations, styles, and props are named, reusable objects. Tag any
image asset with a kind, a name, and a canonical descriptor — the exact
sentence pasted into every prompt that names the entity. That verbatim
descriptor is what holds a character's look steady across shots. Entities
live in the asset library (a metadata marker, no migration), appear under
**Entities** in the app menu, and reach prompts through the `ApplyEntities`
node or the `ui_entity_apply` tool.

<img src="{{ '/assets/screenshots/storyboard-board.png' | relative_url }}" alt="Storyboard board with an Entities field and per-shot entity chips">

On a storyboard, the **Entities** field pins a cast to the board: styles and
locations season every shot's still and clip prompt, while characters and
props activate on the shots that mention them by name. Each shot card shows
which entities its prompt will use as chips — click one to include or exclude
it for that shot. The **Direct** run also hands the cast to the screenplay
model so shots reference entities by their exact names.

Entities are also one `@` away wherever prompts are written: the mention
picker in the chat composer and the workflow editor's Prompt node lists them
first, and a picked entity carries its descriptor and reference image into
the generation.

## Cost governance

The estimate panel in the workflow editor prices a graph before it runs,
aggregated from per-node fal and kie unit pricing, with unpriced nodes
surfaced as unknown rather than hidden. A budget cap with over-budget
warnings and a live spend ticker in chat round it out. Current limits:
estimates count each node once (fan-out is not multiplied in), and the
draft-mode toggle stores intent without routing models yet.

## Graph templates

The same pipeline ships as workflow templates for batch runs with no surface
interaction:

<img src="{{ '/assets/creative-agent/script-to-screen-editor.png' | relative_url }}" alt="Script to Screen template open in the workflow editor">

- **Script to Screen** — brief → direction document → style-frame-anchored
  keyframes → per-shot animation → cut with voiceover and score (Concat
  assembly).
- **Directed Film to Timeline** — the same direction assembled onto the
  timeline with `nodetool.timeline.AddClips → RenderTimeline`.

For continuity across cuts, `nodetool.creative.ShotChain` generates clips
sequentially, extracting each clip's last frame to seed the next shot.

## Driving it from outside

`nodetool mcp serve` exposes the workflow and creative tools over MCP
(stdio), so an external agent can search nodes, build and run workflows, and
generate media; `nodetool mcp install` writes the config for Claude Code,
Codex, or OpenCode. Inside NodeTool, the chat agent reaches every surface
through the same frontend tools the buttons use.

## Where this is heading

The build plan, the market context it responds to, and the honest list of
current limits live in the
[Creative Agent Roadmap]({{ '/creative-agent-roadmap' | relative_url }}).
