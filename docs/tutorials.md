---
layout: page
title: "Tutorials"
description: "Short, beginner-friendly video walkthroughs of NodeTool — build your first workflow, connect and run nodes, generate a list, ask the AI, and combine inputs."
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

## Ask the AI

The simplest chat-style graph. Type a question, send it to an LLM node, and
watch the answer stream in phrase by phrase before it lands in a Preview.

<video controls preload="metadata" poster="{{ '/assets/tutorials/ask-ai.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/ask-ai.mp4' | relative_url }}" type="video/mp4">
</video>

You'll learn how to feed a question into an LLM node, watch the answer stream as
it generates, and reuse it downstream.

## Combine two inputs

The first graph that branches in. Two text inputs flow into one Format Text node
that fills a template, composing a single result from reusable parts.

<video controls preload="metadata" poster="{{ '/assets/tutorials/combine-inputs.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/combine-inputs.mp4' | relative_url }}" type="video/mp4">
</video>

You'll learn how to wire several inputs into one node, compose text with
`{{ placeholders }}`, and build prompts from reusable parts.

---

Ready to build your own? Start with [Quick Start](getting-started.md), then
browse the [Examples]({{ '/workflows/' | relative_url }}).
