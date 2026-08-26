---
layout: page
title: "Chat & Agents"
description: "The agent that builds your workflows, sketches, timelines, and apps — in the app, from the CLI, or over the API."
---

Most tasks in NodeTool start with the agent. Just describe what you want, and it handles the rest: it plans the process, connects the right parts, selects the best models, runs the task, and edits your open document. Every time you send a message, the agent springs into action—there are no confusing modes to turn on or off.

## What it can build

| What you ask for | What it works on | Learn more |
|---|---|---|
| Create, change, or fix a workflow | Workflows | [Workflow Editor](workflow-editor.md) |
| Add a layer, mask, or fill | Sketches | [Sketch Editor](sketch-editor.md) |
| Add a track, cut, or animation | Timelines | [Video Editor](video-editor.md) |
| Create shots, stills, clips, or a cut | Storyboards | [Creative Agent](creative-agent.md) |
| Add voiced lines or subtitles | Scripts | [Creative Agent](creative-agent.md) |
| Build forms, fields, buttons, or outputs | Mini Apps | [App Builder](app-builder.md) |

The agent uses the same tools you do, so you can watch changes happen in real time. And when it’s done, you’re left with a normal document you can continue editing yourself.

## Core guides

- **[Chat](global-chat.md)** — How to use the composer, threads, permissions, and the agent.
- **[Agent Memory](agent-memory.md)** & **[Long-Term Memory](long-term-memory.md)** — How the agent remembers things between messages and threads.
- **[Agent CLI](agent-cli.md)** — Run the agent from your terminal.
- **[Chat CLI](chat-cli.md)** & **[Chat Server](chat-server.md)** — Automate chats or build your own custom interface.
- **[Chat API](chat-api.md)** — Start chats, get responses, and run tools from your own code.

## Typical workflows

1. **Build a workflow from a prompt**
   Open Chat, pick an AI model, and describe what the workflow should do. The agent will plan the steps, make sure they work with the available tools, save the workflow, and run it.

2. **Edit what you're working on**
   With a workflow, sketch, or timeline open, just ask for the change you want: "add an upscale step" or "put the narration on a new audio track." The agent will update your document right away.

3. **Run a saved workflow from chat**
   Save your workflow in the editor, then select it in the chat or ask for it by name. The results will appear directly in your thread.

4. **Control how much the agent does automatically**
   You can set permissions for each thread: *Plan* just gives you a proposal, *Default* asks before making changes, and *Auto* does everything automatically. Learn more in the [Chat guide](global-chat.md#permission-modes).

5. **Run agents behind the scenes**
   Use the [Agent CLI](agent-cli.md) for automated scripts, or the [Chat API](chat-api.md) to connect the agent to a backend service.

For more examples, check out the [Cookbook](cookbook.md), or see the [Deployment Guide](deployment.md) to learn how to put agents into production.
