---
layout: page
title: "Key Concepts"
description: "Workflows, nodes, connections, assets, sketches, timelines, agents, and models in NodeTool, with a saved workflow as an example."
---

A workflow is a graph of nodes and edges. This is the saved form of the shipped example "Ad Copy in Three Registers" (node `data` and layout fields trimmed):

```json
{
  "nodes": [
    { "id": "in",  "type": "nodetool.input.StringInput", "data": { "name": "offer", "value": "A reusable water bottle that stays cold all day" } },
    { "id": "ag",  "type": "nodetool.agents.Agent",      "data": { "system": "You write ad copy. Produce three versions of the same offer...", "prompt": "" } },
    { "id": "out", "type": "nodetool.output.Output",     "data": { "name": "variants" } }
  ],
  "edges": [
    { "source": "in", "sourceHandle": "output", "target": "ag",  "targetHandle": "prompt" },
    { "source": "ag", "sourceHandle": "text",   "target": "out", "targetHandle": "value" }
  ]
}
```

On the canvas this is three boxes and two lines. Each node does one job and each edge carries one node's output into another node's input. An agent can build and edit these graphs for you, and models run locally or on a provider with your own API key. For single-word definitions see the [Glossary](glossary.md).

---

## The building blocks

### The agent

The **agent** is the assistant in the Chats panel. It builds workflows, calls tools, and edits your open workflow, sketch, or timeline with the same tools you use. Its changes are visible and can be undone, and anything it builds stays editable.

The permission mode in the chat composer sets what it may do. Plan only reads and proposes, with actions blocked. Default runs reads and asks before each action. Auto runs routine work unattended and still asks once before an action the agent declares high risk, such as a delete, a publish, or spending money. See [Chat](global-chat.md).

### Nodes

A **node** is one box that does one thing.

| Node                | What it does                                        | Example                                          |
| ------------------- | --------------------------------------------------- | ------------------------------------------------ |
| **Text To Image**   | Turns a description into a picture                  | "Sunset over mountains" → an image               |
| **Agent**           | Works out the steps for a task and carries them out | "Summarize this document" → an organized summary |
| **Text To Speech**  | Reads text aloud                                    | A blog post → an audio file                      |
| **Filter String**   | Keeps only the text that matches a rule             | Keep only lines that contain a keyword           |

A node takes inputs on its left, sends results out its right, and shows its settings in the Inspector when selected.

### Workflows

A **workflow** is a set of nodes joined by connections that you run as one unit. Input enters on the left, each node starts when its inputs have arrived, and results appear on the right as they are produced.

Examples:

- A description, into an image model, saved as a file.
- A PDF, split into pieces, filed away, then searched to answer a question.
- A story, turned into character descriptions, then portraits, then a video.

### Connections

A **connection** is a line that carries one node's output into another node's
input.

Drag from an output to an input. NodeTool rejects mismatched types, so an image output only connects to an input that accepts images. Hover over a line to see what is passing through it. The full list of types and the
conversion rules are in [Data Types and Connections]({{ '/data-types' | relative_url }}).

### Assets

An **asset** is any file NodeTool stores for you: an image, video, audio clip,
PDF, text file, 3D model, or anything else a node can read or write. Assets live
in the Asset Explorer and can be used again in any workflow, sketch, timeline,
or chat.

Assets are shared between editors:

- Drag an image asset onto a workflow and it becomes an input.
- Save a workflow's result as an asset to use later.
- Drag video, audio, or images onto a timeline to become clips.
- Open an image asset in the Sketch Editor to paint on it.
- Group document assets into a collection so an AI can search them.

### Sketches

A **sketch** is an image made of stacked layers. Use it to paint, mask, retouch, combine images, or have AI generate a layer in place.

- Start from a blank page or an image you already have.
- Paint, or build the picture up in layers.
- Attach a layer to an image workflow so it regenerates when its inputs change.
- Flatten the sketch back into an ordinary image asset.
- Use that image in a workflow or a timeline.

### Timelines

A **timeline** arranges video, audio, still images, overlays, and AI-generated clips over time on parallel tracks.

- Drag existing assets onto tracks.
- Add a clip that is produced by a workflow.
- Trim, split, reorder, and stack clips.
- Regenerate a generated clip after you change its settings.
- Export the whole sequence as a video asset.

### Agent nodes

An **Agent node** is an agent placed _inside_ a workflow, as opposed to the
agent above, which builds workflows.

It takes a goal in plain English, plans the steps, and uses tools such as web search, file access, or running code. A normal node does one fixed thing, and an Agent node decides what to do.

### Mini-Apps

A **Mini-App** is a form or dashboard built on top of one or more workflows,
with the nodes and lines hidden.

Create and open them from the Apps panel in the left sidebar. See [Mini Apps](mini-apps.md).

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

The editors share one pool of assets and one set of AI services, and the agent works in each.

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

A **model** is a trained AI you call from a node.

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

Choose per node: one step can use an online model while the rest runs locally.

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
B --> C[Text To Image]
B --> D[Summarizer]
C --> E[Preview: Image]
D --> F[Preview: Text]
{% endmermaid %}

The Agent runs first. Text To Image and Summarizer wait only on the Agent, so they then run side by side.

The editor refuses a connection that would close a cycle. The one exception is a Loop node,
whose feedback inputs can take a value back from later in the graph. See
the [Loop node reference]({{ '/nodes/nodetool/control/loop' | relative_url }}).

---

## If you write code

The same workflows can be built and run from TypeScript.

| Piece                 | What it is                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Graph**             | Nodes plus connections. Build one with `workflow(...)`, run it with `run(...)` or `runGraph(...)` (`@nodetool-ai/dsl`, `packages/dsl/src/core.ts`). |
| **DSL**               | The [TypeScript DSL](developer/ts-dsl-guide.md) (`@nodetool-ai/dsl`), typed factory functions for building graphs in code.                          |
| **WorkflowRunner**    | Runs each node as an actor, passes messages between them, streams progress back (`@nodetool-ai/kernel`).                                            |
| **ProcessingContext** | Everything a running node can reach: job and user IDs, auth token, workspace, assets, providers (`@nodetool-ai/runtime`).                                                            |

### How a node type is found

A saved workflow refers to nodes by a type string (`package.Namespace.Class`).
The node registry resolves it in this order:

1. An exact match in the registry
2. The same string without a trailing `Node`
3. If neither matches, the namespace (everything before the last dot) is loaded on demand, then the lookup runs again

That is why loading a graph doesn't require importing every node module first. A type that still has no match is reported as unknown.

See the [Developer Guide](developer/) and
[Custom Nodes](developer/custom-nodes-guide.md).

---

## Next steps

<div class="card-grid">
  <a class="doc-card" href="{{ '/getting-started' | relative_url }}"><strong>Quick Start</strong><span>Generate a video from one sentence.</span></a>
  <a class="doc-card" href="{{ '/first-workflow' | relative_url }}"><strong>Your First Workflow</strong><span>Build a four-node image workflow from an empty canvas.</span></a>
  <a class="doc-card" href="{{ '/global-chat' | relative_url }}"><strong>Chat</strong><span>The agent, its tools, and permission modes.</span></a>
  <a class="doc-card" href="{{ '/models-and-providers' | relative_url }}"><strong>Models &amp; Providers</strong><span>Choose models or run them locally.</span></a>
</div>

