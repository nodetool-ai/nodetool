---
layout: page
title: "Key Concepts"
description: "The ideas behind NodeTool workflows, assets, sketches, and timelines, explained without jargon."
---

The handful of ideas you need before building anything. No prior experience
assumed. If you want a quick definition of a single word instead, the
[Glossary](glossary.md) is faster.

---

## What NodeTool is

NodeTool is a visual way to use AI. Instead of writing code, you place boxes on a page and draw lines between them. Each box does one job, and the lines carry results from one box to the next.

- **Ask instead of build.** Describe what you want, and an AI agent builds the boxes and lines for you. You can read and change what it builds.
- **Run locally.** Models that run on your computer use your own hardware, keeping your data private on your disk.
- **Use your own accounts.** When a workflow uses an online AI service like OpenAI or Anthropic, you use your own API keys. You pay the provider directly; NodeTool takes no cut.
- **Mix local and online.** A single workflow can use a local model for one step and an online service for another.
- **Open source.** NodeTool is open source software (AGPL-3.0). You can run the exact same code we use.

---

## The building blocks

### The agent

The **agent** is the AI assistant in the Chats panel. Give it a goal in plain English, and it figures out the steps to achieve it. It can build workflows, call tools, and edit your documents directly.

Here's how it differs from a standard chatbot:

- **It works directly on your open documents.** Whether you have a workflow, sketch, or timeline open, the agent acts on it using the same tools you do. You can see its changes and undo them if needed.
- **Everything remains editable.** The agent doesn't create unchangeable results. You can open, understand, and modify anything it builds.

You control the agent's permissions. You can set it to only suggest changes, ask for permission before acting, or run tasks automatically. See [Chat](global-chat.md) for more details.

### Nodes

A **node** is one box that does one thing.

| Node                | What it does                                        | Example                                          |
| ------------------- | --------------------------------------------------- | ------------------------------------------------ |
| **Image Generator** | Turns a description into a picture                  | "Sunset over mountains" → an image               |
| **Agent**           | Works out the steps for a task and carries them out | "Summarize this document" → an organized summary |
| **TextToSpeech**    | Reads text aloud                                    | A blog post → an audio file                      |
| **Filter**          | Throws away items that don't match a rule           | Keep only the good results                       |

Every node takes things in on its left side, sends results out its right side,
and has settings that appear in the panel on the right when you click it.

### Workflows

A **workflow** is a set of nodes joined by lines. When you run it, your input
enters on the left, each node starts as soon as everything it needs has arrived,
and results appear on the right as they are produced.

Examples of what a workflow can be:

- A description, into an image model, saved as a file.
- A PDF, split into pieces, filed away, then searched to answer a question.
- A story, turned into character descriptions, then portraits, then a video.

Reach for a workflow when you want to do the same thing repeatedly: produce
media, convert files, ask a model something, index documents, or prepare
material for one of the other editors below.

### Connections

The lines between nodes. Drag from a node's output on the right to another
node's input on the left. NodeTool checks that the two ends match, so an image
output only connects to an input that accepts images and you can't wire
something nonsensical. Hover over a line to see what is passing through it.

### Assets

An **asset** is any file NodeTool stores for you: an image, video, audio clip,
PDF, text file, 3D model, or anything else a node can read or write. Assets live
in the Asset Explorer and can be used again in any workflow, sketch, timeline,
or chat.

Assets are the common currency between the different editors:

- Drag an image asset onto a workflow and it becomes an input.
- Save a workflow's result as an asset to use later.
- Drag video, audio, or images onto a timeline to become clips.
- Open an image asset in the Sketch Editor to paint on it.
- Group document assets into a collection so an AI can search them.

### Sketches

A **sketch** is an image made of stacked layers, the way Photoshop or GIMP work.
Use it to paint, hide parts of an image, retouch, combine images, or have AI
generate a layer in place.

A sketch sits between editing by hand and automating with a workflow:

- Start from a blank page or an image you already have.
- Paint, or build the picture up in layers.
- Attach a layer to an image workflow so it regenerates when its inputs change.
- Flatten the sketch back into an ordinary image asset.
- Use that image in a workflow or a timeline.

### Timelines

A **timeline** arranges media over time on parallel tracks, the way a video
editor does. It holds video, audio, still images, overlays, and clips generated
by AI.

Timelines are where results become finished media:

- Drag existing assets onto tracks.
- Add a clip that is produced by a workflow.
- Trim, split, reorder, and stack clips.
- Regenerate a generated clip after you change its settings.
- Export the whole sequence as a video asset.

### Agent nodes

The agent above builds workflows. An **Agent node** is an agent placed _inside_
one: it takes a goal written in plain English, works out the steps itself, and
uses tools such as web search, file access, or running code to get there. Use
one when a step of your pipeline is describable but not scriptable. A normal
node does one fixed thing; an Agent node decides what to do.

### Mini-Apps

A **Mini-App** is a form or dashboard built on top of one or more workflows,
with the nodes and lines hidden. Create and open them from the Apps panel. Give
one to someone who should never have to look at a canvas. See
[Mini Apps](mini-apps.md).

---

## How everything fits together

Most work in NodeTool follows one loop:

1. **Get some material.** Upload files, produce them with a workflow, paint a
   sketch, or export a timeline. All of it becomes assets.
2. **Build a workflow around them.** It reads assets, calls models, converts
   media, and writes new assets.
3. **Polish the result in the right editor.** Sketches for still images,
   timelines for anything with a duration.
4. **Feed the polished result back in.** A flattened sketch or an exported video
   is just another asset a workflow can read.
5. **Share it.** Keep the workflow to run again, wrap it as a Mini-App, or
   publish the finished file.

The editors are separate because painting an image and cutting a video are
different problems, but they share one pool of assets and one set of AI services.
The agent works in every one of them, so any step of the loop is something you
can do by hand or ask for.

{% mermaid %}
graph LR
A[Assets] --> B[Workflow]
B --> C[Generated assets]
C --> D[Sketch]
C --> E[Timeline]
D --> A
E --> A
B --> F[Mini-App]
{% endmermaid %}

### Worked example: a short product video

1. Upload your product photos as assets.
2. Run a workflow that writes the copy, makes background images, and records a
   voiceover.
3. Open the main photo in a sketch to touch it up and cut out the background.
4. Drag the image, the voiceover, and the generated clips onto a timeline.
5. Attach one clip to an image-to-video workflow and regenerate it until it
   looks right.
6. Export the timeline as your finished video.

---

## Models

A **model** is a trained AI you call from a node. You don't train it; you use
it.

| Kind of model | Produces | Used for                      |
| ------------- | -------- | ----------------------------- |
| Image         | Pictures | Posters, concept art, mockups |
| Video         | Clips    | Animation, motion             |
| Audio         | Sound    | Narration, music, effects     |
| Text          | Words    | Scripts, summaries, analysis  |

### On your machine, or online

|               | On your machine            | Online service                               |
| ------------- | -------------------------- | -------------------------------------------- |
| Cost          | Free once downloaded       | The provider's price, billed to your account |
| Where it runs | Your computer              | Their servers                                |
| Speed         | Depends on your hardware   | Depends on theirs                            |
| Internet      | Works offline              | Required                                     |
| To set up     | Download 4-20 GB per model | Paste an API key                             |

You can mix them and choose per node, so an expensive online model can handle
the one step that needs it while the rest runs locally.

---

## Words you'll see

| Term                       | What it means                                                               |
| -------------------------- | --------------------------------------------------------------------------- |
| **Workflow**               | Nodes joined by lines                                                       |
| **Node**                   | One box that does one job                                                   |
| **Edge / connection**      | A line carrying data between nodes                                          |
| **Input / output**         | Where data enters and leaves a node                                         |
| **Preview**                | A node that displays whatever reaches it, for checking your work            |
| **Run**                    | Execute the workflow                                                        |
| **Asset**                  | A stored file used by workflows, sketches, timelines, chats, or collections |
| **Sketch**                 | A layered image document for painting, masking, and combining               |
| **Timeline**               | Tracks for arranging video, audio, and images over time                     |
| **Clip**                   | One piece of media placed on a timeline track                               |
| **Generated clip / layer** | A clip or layer produced by a workflow instead of imported                  |
| **Stale**                  | A generated result whose settings changed since it was last produced        |
| **Agent**                  | The assistant you ask for changes, and the node that plans its own steps    |
| **Permission mode**        | How far the agent may act without asking: Plan, Default, or Auto            |
| **Model**                  | The trained AI a node calls                                                 |
| **Provider**               | Whoever runs the model: your own machine, OpenAI, FAL, and so on            |

---

## What happens when you press Run

On <kbd>Ctrl/⌘ + Enter</kbd>:

1. NodeTool reads the lines to work out which node depends on which.
2. Each node starts the moment its inputs have arrived. Nodes that don't depend
   on each other run at the same time.
3. Results appear in preview and output nodes while they are still being
   produced, rather than only at the end.

{% mermaid %}
graph LR
A[Input: Prompt] --> B[Agent: Plan]
B --> C[Image Generator]
B --> D[Text Writer]
C --> E[Preview: Image]
D --> F[Preview: Text]
{% endmermaid %}

Here the Agent goes first. Image Generator and Text Writer both wait only on the
Agent, so once it finishes they run side by side.

Data always flows one way and a workflow can never loop back on itself. That
restriction is what lets NodeTool figure out the running order for you, so you
never specify it.

---

## If you write code

Everything above is also available as a TypeScript API, so you can build and run
the same workflows from code.

| Piece                 | What it is                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Graph**             | Nodes plus connections. Build one with `workflow(...)`, run it with `run(...)` or `runGraph(...)` (`@nodetool-ai/dsl`, `packages/dsl/src/core.ts`). |
| **DSL**               | The [TypeScript DSL](developer/ts-dsl-guide.md) (`@nodetool-ai/dsl`), typed factory functions for building graphs in code.                          |
| **WorkflowRunner**    | Schedules the nodes, manages the GPU, streams progress back.                                                                                        |
| **ProcessingContext** | Everything a running node can reach: user, auth, assets, cache (`@nodetool-ai/runtime`).                                                            |

### How a node type is found

A saved workflow refers to nodes by a type string (`package.Namespace.Class`).
The runner resolves it in this order:

1. The in-memory registry, with and without a trailing `Node`
2. A dynamic import of the type path
3. The installed packages registry
4. A fallback match on class name

That is why loading a graph doesn't require importing every node module first.

See the [Developer Guide](developer/) and
[Custom Nodes](developer/custom-nodes-guide.md).

---

## Next

- [Quick Start](getting-started.md) — run something in 10 minutes
- [Chat](global-chat.md) — the agent, its tools, and permission modes
- [Glossary](glossary.md) — single-word definitions
- [Workflow Editor](workflow-editor.md)
- [Asset Management](asset-management.md)
- [Sketch Editor](sketch-editor.md)
- [Video Editor](video-editor.md)
- [Models & Providers](models-and-providers.md)
- [Cookbook](cookbook.md)
