---
layout: page
title: "Tutorials"
description: "Short videos that show NodeTool at work: edit a sketch, voice a script, board a storyboard, build a mini app, cut a scene, and repeat the result with a workflow."
---

Each video is under a minute and replays a real session in the NodeTool editor.
You see what to ask for, what the assistant does, and where the result lands.
The same videos play in the app: open the logo menu and choose **Tutorials**.

The first group shows how to make something by asking.
The second shows how to steer the assistant when the first answer is not right.
The last group shows how to repeat a result with a workflow, one node at a time.

New to NodeTool? Start with the [Quick Start](getting-started.md).
The [Glossary](glossary.md) explains the terms used below.

## Make it by asking

### Edit a sketch by asking

Say what you want changed. The Sketch Assistant uses the real layer tools:
it adds a layer, sets the blend mode, and sets the opacity while you watch the layer panel.

<video controls preload="metadata" poster="{{ '/assets/tutorials/sketch-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/sketch-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

**Try it:** open a sketch and ask for a soft vignette.
The new layer appears in the layer panel, and you can change it by hand afterwards.

Read more: [Sketch Editor](sketch-editor.md), [Chat & Agents](global-chat-agents.md).

### Write and voice a script

Go from a blank page to voiced audio in one request.
The Script Assistant casts the speakers first, writes their lines, then records a take for each line.

<video controls preload="metadata" poster="{{ '/assets/tutorials/script-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/script-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

**Try it:** ask for a short two-speaker script, then have the assistant voice it.
Each line gets a take you can replace or record again.

Read more: [Script Editor](script-editor.md), [Creative Agent](creative-agent.md).

### Board a shot list

Describe the video. The Storyboard Assistant writes the shots, including camera direction,
before it generates any image. Approve the board, and the stills render shot by shot.

<video controls preload="metadata" poster="{{ '/assets/tutorials/storyboard-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/storyboard-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

**Try it:** describe a short piece, read the shot list, and change a shot while it is still free to change.

Read more: [Storyboard Editor](storyboard-editor.md), [Creative Agent](creative-agent.md#the-storyboard-plan-pick-a-still-then-spend).

### Build a mini app

Describe an app in one sentence: an input, a button, and an answer.
The App Assistant adds the operation, declares a setting that persists between sessions,
and places each widget against something the app declares.

<video controls preload="metadata" poster="{{ '/assets/tutorials/app-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/app-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

**Try it:** open a mini app from the Examples page, fill in its input, and run it.

Read more: [Mini Apps](mini-apps.md), [App Builder](app-builder.md), [Building Mini Apps](mini-apps-guide.md).

### Write a JS script

Say what goes in and what should come out. The assistant declares the ports first,
writes the body, and saves a test case that runs in the sandbox.

<video controls preload="metadata" poster="{{ '/assets/tutorials/jsscript-assistant.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/jsscript-assistant.mp4' | relative_url }}" type="video/mp4">
</video>

The script runs sandboxed with no file system access, and the saved case catches the next edit that breaks it.

Read more: [JS Scripts](js-scripts.md), [JavaScript Sandbox](javascript-sandbox.md).

### Ask the chat agent

Ask Chat about a recent discovery. The agent runs a web search where you can see it,
then streams its answer.

<video controls preload="metadata" poster="{{ '/assets/tutorials/chat-agent-qa.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/chat-agent-qa.mp4' | relative_url }}" type="video/mp4">
</video>

**Try it:** start a new chat and ask about something that happened this week.
The tool call appears before the answer.

Read more: [Chat](global-chat.md), [Chat & Agents](global-chat-agents.md).

### Cut a scene together

The video editor trims the opening clip, moves the next shot to meet its edge,
and adds a caption on its own track. Then it plays the finished cut.

<video controls preload="metadata" poster="{{ '/assets/tutorials/timeline-trim-arrange.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/timeline-trim-arrange.mp4' | relative_url }}" type="video/mp4">
</video>

**Try it:** place two clips on a timeline, trim the cut between them, add a caption, and preview the result.

Read more: [Video Editor](video-editor.md), [AI Timeline Editing](ai-timeline-editing.md).

## Steer the assistant

### Correct it without starting over

A warm wash comes back too strong. Ask for less in the next message, and the assistant edits the layer
that is already there. The layer count stays the same and nothing is generated again.

<video controls preload="metadata" poster="{{ '/assets/tutorials/sketch-correction.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/sketch-correction.mp4' | relative_url }}" type="video/mp4">
</video>

The chat shows which tool call the correction ran, and the layer panel lets you finish the edit yourself.

Read more: [Sketch Editor](sketch-editor.md), [Chat & Agents](global-chat-agents.md).

### It asks before it spends

A brief that leaves out the format gets a question back instead of a guess.
The board stays empty and nothing renders until you answer.
Your answer sets the format and the number of shots.

<video controls preload="metadata" poster="{{ '/assets/tutorials/storyboard-ask.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/storyboard-ask.mp4' | relative_url }}" type="video/mp4">
</video>

Read more: [Storyboard Editor](storyboard-editor.md), [Creative Agent](creative-agent.md).

### A test catches it

Name the case you do not trust. The assistant saves it as a test and runs it.
The test fails and shows why. The assistant repairs the body and runs the same cases again, and they pass.

<video controls preload="metadata" poster="{{ '/assets/tutorials/jsscript-repair.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/jsscript-repair.mp4' | relative_url }}" type="video/mp4">
</video>

The case stays saved, so the next edit that breaks it fails there first.

Read more: [JS Scripts](js-scripts.md), [JavaScript Sandbox](javascript-sandbox.md).

## Repeat it with a workflow

A workflow saves the steps behind a result so you can run them again with new inputs.
These videos build small workflows on the canvas.
To build one yourself from an empty canvas, follow [Your First Workflow](first-workflow.md).

### Build your first workflow

A prompt goes into an LLM node that expands it, and the expanded prompt goes into an image model.
Watch the nodes run and the image appear on the canvas.

<video controls preload="metadata" poster="{{ '/assets/tutorials/first-workflow.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/first-workflow.mp4' | relative_url }}" type="video/mp4">
</video>

You see how nodes pass data through their handles, how a running node shows progress,
and where the generated image appears.

Read more: [Your First Workflow](first-workflow.md), [Workflow Editor](workflow-editor.md).

### Connect and run

Follow a text value through three connected nodes: a text input, a Code node that uppercases it,
and a Preview that shows HELLO NODETOOL.

<video controls preload="metadata" poster="{{ '/assets/tutorials/connect-run.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/connect-run.mp4' | relative_url }}" type="video/mp4">
</video>

You see how outputs connect to inputs, how nodes report completion, and where a result appears.

Read more: [Workflow Editor](workflow-editor.md#connections), [Key Concepts](key-concepts.md).

### Generate a list

One topic goes into a List Generator node, and the items stream out one by one.
The list can then feed every node after it, which is how batch generation starts.

<video controls preload="metadata" poster="{{ '/assets/tutorials/list-generator.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/list-generator.mp4' | relative_url }}" type="video/mp4">
</video>

Read more: [Workflow Editor](workflow-editor.md), [Cookbook](cookbook.md).

### Ask the AI

Type a question, send it to an Agent node, and watch the answer stream in before it lands in a Preview.

<video controls preload="metadata" poster="{{ '/assets/tutorials/ask-ai.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/ask-ai.mp4' | relative_url }}" type="video/mp4">
</video>

Read more: [Workflow Editor](workflow-editor.md#running-workflows), [Models & Providers](models-and-providers.md).

### Combine two inputs

Two text inputs flow into one Prompt node, which fills a template and produces one sentence.

<video controls preload="metadata" poster="{{ '/assets/tutorials/combine-inputs.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/combine-inputs.mp4' | relative_url }}" type="video/mp4">
</video>

You see how several inputs connect to one node and how `{% raw %}{{ placeholders }}{% endraw %}` build a prompt from reusable parts.

Read more: [Workflow Editor](workflow-editor.md#connections), [Key Concepts](key-concepts.md).

### Summarize a document

A long passage goes into a Summarizer node, which writes the key points as it goes.

<video controls preload="metadata" poster="{{ '/assets/tutorials/summarize-text.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/summarize-text.mp4' | relative_url }}" type="video/mp4">
</video>

Read more: [Summarize RSS](workflows/summarize-rss.md), [Meeting Transcript Summarizer](workflows/meeting-transcript-summarizer.md).

### Describe an image

A picture goes into an Image Input, which connects to an Agent node.
The model looks at the picture and describes it in words you can use in the next node.

<video controls preload="metadata" poster="{{ '/assets/tutorials/describe-image.jpg' | relative_url }}">
  <source src="{{ '/assets/tutorials/describe-image.mp4' | relative_url }}" type="video/mp4">
</video>

Read more: [Image to Audio Story](workflows/image-to-audio-story.md), [Models & Providers](models-and-providers.md).

---

Ready to make something? Read the [Quick Start](getting-started.md), then
browse the [Examples]({{ '/workflows/' | relative_url }}).
