---
layout: page
title: "Chat & Agents"
description: "The agent that builds your workflows, sketches, timelines, and apps — in the app, from the CLI, or over the API."
---

The agent is how most work in NodeTool starts. Describe the result, and it plans
the graph, wires the nodes, picks models, runs it, and edits whatever document
you have open. Every turn in chat runs the agent loop; there is no mode to
switch on.

## What it can build

| Ask for | It works on | Reference |
|---|---|---|
| A workflow, a change to one, a fix | The node graph | [Workflow Editor](workflow-editor.md) |
| A layer, a mask, a generated fill | The open sketch | [Sketch Editor](sketch-editor.md) |
| A track, a cut, an animated clip | The open timeline | [Video Editor](video-editor.md) |
| Shots, stills, clips, an assembled cut | The storyboard | [Creative Agent](creative-agent.md) |
| Voiced lines and subtitles | The script | [Creative Agent](creative-agent.md) |
| A form: fields, buttons, outputs | The mini app | [App Builder](app-builder.md) |

It uses the same actions the interface offers, so every change is visible while
it happens, and what it leaves behind is an ordinary document you can edit by
hand.

## Core guides

- **[Chat](global-chat.md)** — The composer, threads, permission modes, and the agent loop.
- **[Agent Memory](agent-memory.md)** & **[Long-Term Memory](long-term-memory.md)** — What it carries between turns and between threads.
- **[Agent Config](agent-config-schema.md)** — The YAML schema behind configured agents.
- **[Agent CLI](agent-cli.md)** — Run agents from the command line with a config file.
- **[Chat CLI](chat-cli.md)** & **[Chat Server](chat-server.md)** — Automate conversations or drive a custom frontend.
- **[Chat API](chat-api.md)** — Run chats, stream output, and issue tool calls from your own code.

## Typical flows

1. **Have it build a workflow from a description**
   Open Chat, pick a model, say what the workflow should do. It plans, validates
   the graph against the node library, saves the workflow, and runs it.

2. **Have it change what is in front of you**
   With a workflow, sketch, or timeline open, ask for the edit: "add an upscale
   step", "put the narration on a new audio track". It edits that document.

3. **Run a saved workflow from chat**
   Save the workflow in the editor, then choose it in the composer or ask for it
   by name. Results stream back into the thread.

4. **Set how much it does unattended**
   The permission chip is per thread: *Plan* proposes only, *Default* asks
   before actions, *Auto* runs everything. See
   [Chat](global-chat.md#permission-modes).

5. **Run agents headlessly**
   Use the [Agent CLI](agent-cli.md) for scripted runs, or the
   [Chat API](chat-api.md) from a backend service.

Pair this with the [Cookbook](cookbook.md) for agent patterns, or the
[Deployment Guide](deployment.md) to move agents into production.
