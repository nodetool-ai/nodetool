---
layout: page
title: "Tutorials"
description: "Short video walkthroughs of NodeTool — ask the assistant to edit a sketch, write and voice a script, board a shot list, build a mini app; correct a result, decide what gets rendered, catch a bug with a test; and the node-graph basics underneath."
---

Short walkthroughs for people starting from zero. Each one plays a real session
and zooms in on what happens, so you can see what to ask for and what comes
back.

The first group is the fastest way to get something made: say what you want and
the assistant works the real editor. The second group is the part nobody tells
you — how to correct a result, when the assistant stops to ask you, and how to
prove a change is right. The last group is the node graph underneath, for when
you want the same thing to run again tomorrow.

New here? [Quick Start](getting-started.md) explains the words used below, and
the [Glossary](glossary.md) defines them one by one.

## Edit a sketch by asking

Say what you want changed and the Sketch Assistant works the real layer tools:
it adds the layer, sets how it blends with the art underneath, and dials in how
strong it is, while the layers panel updates beside it.

<video controls preload="metadata" poster="{{ '/assets/tutorials/sketch-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/sketch-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how the assistant reads the layer stack you already have, how each
new layer appears selected and ready, and that everything it makes stays yours
to change by hand.

## Write and voice a script

From a blank page to voiced audio in one ask. The Script Assistant casts the
speakers first, writes their lines, then records a take for each one.

<video controls preload="metadata" poster="{{ '/assets/tutorials/script-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/script-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to describe a script by length, voices, and tone, why the
speakers are cast before any line is written, and how every take is kept so you
can pick a different one.

## Board a shot list

Describe the piece and the Storyboard Assistant writes the shots — framing,
camera move, and length — before spending anything on pictures. Approve the
board and the stills render one shot at a time.

<video controls preload="metadata" poster="{{ '/assets/tutorials/storyboard-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/storyboard-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to get a shot list before any image exists, how to revise a shot
while it is still free to change, and how the cards flip to ready as the
pictures land.

## Build a mini app

Describe an app in a sentence — a box to type in, a button, an answer — and the
App Assistant binds a workflow behind it and places each control.

<video controls preload="metadata" poster="{{ '/assets/tutorials/app-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/app-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how a workflow becomes something anyone can run without opening the
canvas, how a value can be saved as a setting that survives between sessions,
and how every control is tied to something the app declares.

## Write a JS script

Say what goes in and what should come out. The assistant declares those first —
they are the script's contract — then writes the body and saves a test that
grades it.

<video controls preload="metadata" poster="{{ '/assets/tutorials/jsscript-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/jsscript-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see why the inputs and outputs come first, that the code runs sandboxed
with no access to your files, and how a saved case catches the next edit that
breaks it.

## Correct it without starting over

The wash comes back too strong. Saying so in the next message edits the layer
that is already there — you don't repeat the original request, and nothing is
generated a second time.

<video controls preload="metadata" poster="{{ '/assets/tutorials/sketch-correction.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/sketch-correction.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how a correction lands on the same layer, that the layer count never
grows, and where to take over and finish the adjustment yourself.

## It asks before it spends

The brief was vague, and the two readings of it cost different money. So the
assistant asks instead of guessing, and the board stays empty while you decide.

<video controls preload="metadata" poster="{{ '/assets/tutorials/storyboard-ask.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/storyboard-ask.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see what happens while it waits on you — nothing renders — how your
answer picks the shape and the count, and that the shots still arrive as plans
you approve before any picture is made.

## A test catches it

Name the edge case you don't trust. The assistant saves it as a test, runs it,
and it fails in the open with the reason. One fix later, the same tests pass.

<video controls preload="metadata" poster="{{ '/assets/tutorials/jsscript-repair.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/jsscript-repair.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see why asking for the check before the fix is worth it, what a failing
run tells you that a summary doesn't, and how the saved case guards the script
from here on.

## Ask the chat agent

A different part of the app: Chat. A question goes straight to the agent, which
searches the web where you can watch it happen, then writes its answer back a
few words at a time.

<video controls preload="metadata" poster="{{ '/assets/tutorials/chat-agent-qa.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/chat-agent-qa.mp4' | relative_url }}" type="video/mp4">
</video>

You'll see how to send a message from Chat, watch the agent use a tool in the
open rather than behind a spinner, and read the answer as it arrives.

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
