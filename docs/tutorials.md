---
layout: page
title: "Tutorials"
description: "Short beginner video walkthroughs of NodeTool — build your first workflow, connect and run nodes, generate a list, ask the AI, combine inputs, summarize a document, describe an image, chat with an agent, and cut a scene on the timeline."
---

Short walkthroughs for people starting from zero. Each one plays a real example
and zooms in on every box so you can see what it does and what you type into it.

New here? [Quick Start](getting-started.md) explains the words used below, and
the [Glossary](glossary.md) defines them one by one.

## Build your first workflow

A complete example from start to finish: you type a short description, an AI
rewrites it into something more detailed, and a Text To Image node turns that
into a picture. No code, just connected boxes.

<video controls preload="metadata" poster="{{ '/assets/tutorials/first-workflow.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/first-workflow.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how a result passes from one box to the next, how to tell what is
running (the spinning ring, text appearing as it's written, the progress bar),
and where the finished picture shows up.

## Connect and run

The basic loop, one step at a time. Add a box, draw a line from its output into
the next box's input, press Run, read the result.

<video controls preload="metadata" poster="{{ '/assets/tutorials/connect-run.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/connect-run.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see what inputs and outputs are, what the small dots on the sides of a
box are for, how to run everything and watch each box finish, and how to display
a result in a Preview box.

## Generate a list

One instruction, many answers. A single AI box turns a topic into a numbered
list, showing each item the moment it arrives. This is the pattern behind
anything that repeats a step over many items.

<video controls preload="metadata" poster="{{ '/assets/tutorials/list-generator.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/list-generator.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to drive an AI box from something you typed, watch a multi-item
answer arrive piece by piece, and pass the finished list on to the rest of the
workflow.

## Ask the AI

The simplest example there is. Type a question, send it to an AI box, and watch
the answer appear phrase by phrase before it lands in a Preview.

<video controls preload="metadata" poster="{{ '/assets/tutorials/ask-ai.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/ask-ai.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to feed a question into an AI box, watch the answer being
written, and reuse it further along.

## Combine two inputs

The first example where two lines meet. Two text boxes feed into one Format Text
box that drops both into a sentence template, building one result from reusable
parts.

<video controls preload="metadata" poster="{{ '/assets/tutorials/combine-inputs.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/combine-inputs.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to wire several inputs into one box, how to write a template with
`{{ placeholders }}` in it, and how to assemble instructions from parts you can
change independently.

## Summarize a document

Long text in, the key points out. A single Summarizer box condenses an article,
a transcript, or any block of text into a short summary, writing it out as it
goes. It's the same pattern the Meeting Transcript Summarizer example uses.

<video controls preload="metadata" poster="{{ '/assets/tutorials/summarize-text.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/summarize-text.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to feed a long passage into a Summarizer, watch the summary being
written, and pass the result on.

## Describe an image

The first example that mixes pictures and words. Drop a photo into an Image
Input box, wire it into an Agent, and watch the AI look at the picture and
describe it. This is how captions and alt text get generated.

<video controls preload="metadata" poster="{{ '/assets/tutorials/describe-image.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/describe-image.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to bring a picture into a workflow, send it to an AI that can
see, and reuse the description in any box that takes text.

## Ask the chat agent

A different part of the app: Chat. A question goes straight to the agent, which
searches the web where you can watch it happen, then writes its answer back a
few words at a time.

<video controls preload="metadata" poster="{{ '/assets/tutorials/chat-agent-qa.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/chat-agent-qa.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to send a message from Chat, watch the agent use a tool in the
open rather than behind a spinner, and read the answer as it arrives.

## Cut a scene together

The video editor: trim a clip, drag in a second shot, add a caption that lights
up word by word in time with the audio, then play the finished cut.

<video controls preload="metadata" poster="{{ '/assets/tutorials/timeline-trim-arrange.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/timeline-trim-arrange.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to trim and arrange clips on tracks, add a caption synced to the
audio, and play back a cut without leaving the browser.

---

Ready to build your own? Start with [Quick Start](getting-started.md), then
browse the [Examples]({{ '/workflows/' | relative_url }}).
