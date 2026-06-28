---
layout: page
title: "Tutorials"
description: "Short, beginner-friendly video walkthroughs of NodeTool — build your first workflow, connect and run nodes, and generate a list."
---

Short, beginner-friendly walkthroughs. Each plays a real workflow on the canvas
and zooms into every node so you can see what it does and what to fill in.

## Build your first workflow

A complete AI pipeline, end to end: type a prompt, an LLM rewrites it into
something richer, and a Text To Image node turns it into a picture — all from
connected nodes, no code.

<video controls preload="metadata" poster="{{ '/assets/tutorials/first-workflow.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/first-workflow.mp4' | relative_url }}" type="video/mp4">
</video>

You'll learn how nodes pass data through their handles, how to read live status
(running rings, streaming text, the progress bar), and where generated output
appears on the canvas.

## Connect & run

The core loop, one step at a time. Add a node, wire its output into the next
node's input, press Run, and read the result.

<video controls preload="metadata" poster="{{ '/assets/tutorials/connect-run.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/connect-run.mp4' | relative_url }}" type="video/mp4">
</video>

You'll learn what inputs, outputs, and handles are, how to run a graph and watch
nodes complete, and how to find a node's result in a Preview.

## Generate a list

One prompt, many results. A single LLM node turns a topic into a structured
list, streaming each item as it arrives — the pattern behind batching and loops.

<video controls preload="metadata" poster="{{ '/assets/tutorials/list-generator.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/list-generator.mp4' | relative_url }}" type="video/mp4">
</video>

You'll learn how to drive an LLM node from an input, watch multi-item output
stream in, and pass a list into the rest of a workflow.

---

Ready to build your own? Start with [Quick Start](getting-started.md), then
browse the [Examples]({{ '/workflows/' | relative_url }}).
