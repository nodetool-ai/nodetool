---
layout: page
title: "Creative Agent"
permalink: /creative-agent
description: "Brief to finished cut: the Director writes a screenplay, the storyboard renders stills then clips per shot, and the cut assembles onto the timeline editor."
image: /assets/creative-agent/storyboard-surface.png
---

A Director agent turns a brief into a screenplay on a [storyboard](storyboard-editor.md). The flow is Brief, Direct, Stills, Clips, Timeline. You can run each step from the storyboard, or ask the assistant in chat to do it. For how Script, Storyboard, Entities, and Timeline fit together, see [AI Video Production](ai-video-production.md).

> **Runs:** locally or cloud, depending on the models you pick. **Needs:** a text model for the Director and an image and video model for renders. Hosted models need their provider key (see [Providers](providers.md)). **Costs:** stills and clips on paid providers are billed at provider rates. The Director call is billed when its text model is paid. Local models cost nothing per render.
{: .callout-note}

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

## Ask the assistant

- "Make a 6-shot ad for a trail-running shoe. Direct it and render stills, and show me before you spend on clips."
- "Make shot 3 darker and add rain."
- "Render clips for the shots I picked stills for, then build the timeline."

Builders driving this from code or MCP: see [Creative Agent Tools](developer/creative-agent-tools.md#storyboards).

## Start from a shipped board

**New → New storyboard…** (under **Blank documents**) opens a list with **Blank storyboard** and the example boards that ship with the install. The **Storyboard** entry under **Guided flows** in the same menu walks you through four steps (Idea, Story, Entities, Look) and ends on the rendered board. An example board arrives finished: every shot has its action text, still, and clip. It opens immediately without duplicating media files. Regenerating a shot replaces the shipped render on that card only.

## Direct: brief in, screenplay out

In **Board settings**, write a brief and a style, pick an aspect ratio and a shot count (3, 4, 5, 6, 8, 10, or 12), and press **Direct**. **Re-direct** replaces every shot (see [Direct a screenplay](storyboard-editor.md#direct-a-screenplay)). Each shot carries action, camera (framing, lens, angle, movement, equipment), motion, and duration.

## The storyboard: plan, pick a still, then spend

<img src="{{ '/assets/creative-agent/storyboard-surface.png' | relative_url }}" alt="Storyboard surface: a grid of six shot cards, each with its still, shot number and status, over the inspector for the selected shot">

Each card shows the still or clip, a shot label such as `SH 03`, a status pill, and the action line. A shot with a clip shows no pill. **Render stills** and **Render clips** in the toolbar each open a dialog where you pick the model and see an estimated cost before confirming. Select a card to dock a footer under the grid with **Edit**, **Iterate**, **Regenerate**, and **Delete**. **Iterate** is disabled until the shot has a clip. Regenerating shot 3 does not re-render other shots. Pill values, takes, and the footer's links are in [Storyboard Editor](storyboard-editor.md#the-board).

## Assemble: from storyboard to timeline

<img src="{{ '/assets/creative-agent/assembled-timeline.png' | relative_url }}" alt="Assembled cut open in the timeline editor: shot clips on a video track, narration and music tracks">

**Create timeline** (below the shot grid, enabled once a shot has a still or clip) turns the shots into a saved timeline and opens the editor. Shots lay end to end on a **Shots** video track. A shot with only a still becomes an image clip. Each clip's own sound goes on a linked **Shot Audio** track, and the screenplay's narration and music become draft text-to-audio clips on **Narration** and **Music** tracks. A board linked to a script is cut jointly, so each voiced line gets its own voiceover clip and the editor shows a **Script** tab. Shots without an accepted clip are skipped.

Timeline playback and export mix audio clips, so the shot-audio clips carry a video model's dialogue and room tone. Mute one when a shot should play silent under narration.

Every assembled clip stays linked to its shot. Selecting a new clip take afterward replaces the clip in the saved timeline. **Rebuild linked timeline…** replaces every clip the storyboard owns, including trims, and keeps tracks and clips you added yourself.

## Entities: reusable ingredients

<img src="{{ '/assets/creative-agent/entity-library.png' | relative_url }}" alt="Entity library with a character, location, style, and prop">

An entity is an image asset tagged with a kind (character, location, style, prop), a name, and a descriptor, which is pasted verbatim into every prompt that names it. See [Entities](entities.md) for creating and editing them.

<img src="{{ '/assets/screenshots/storyboard-board.png' | relative_url }}" alt="Storyboard board with Board settings open: the Entities field carrying four entity chips, over the shot grid">

On a storyboard, the **Entities** field under **Board settings** pins a cast to the board: styles and locations season every shot's still and clip prompt, while characters and props activate on the shots that mention them by name. Open a shot with **Edit** and the board's entities show as chips. Click one to include or exclude it for that shot. The **Direct** run also hands the cast to the screenplay model so shots reference entities by their exact names.

Typing `@` in the chat composer or the workflow editor's Prompt node lists entities first. A picked entity carries its descriptor and reference image into the generation.

## Cost governance

The **Render stills** and **Render clips** dialogs and the per-shot cost line price the request before you confirm, and report how many requests could not be priced. In the workflow editor, the **Cost estimate** section under the Inspector prices the graph before it runs, counts batch sizes, and lists nodes with no known price as unknown. Caps apply per agent run (a USD cap on a chat turn and its sub-agents) and per published mini app (a spend budget). See [Costs and credits](costs-and-credits.md).

## Graph templates

The same pipeline ships as workflow templates for batch runs: **Script to Screen** and **Directed Film to Timeline**.

<img src="{{ '/assets/creative-agent/script-to-screen-editor.png' | relative_url }}" alt="Script to Screen template open in the workflow editor">

Node details are in [Storyboard workflow nodes](developer/creative-agent-tools.md#storyboards).
