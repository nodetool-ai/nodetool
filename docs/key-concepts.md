---
layout: page
title: "Key Concepts"
description: "Core concepts behind NodeTool workflows, assets, sketches, and timelines."
---

The ideas you need to build on the canvas.

---

## What NodeTool is

A node-based canvas for creative AI. You wire **nodes** instead of writing code. Each node is a single operation: a model call, a transform, a tool.

- **Your machine.** Local models run on your hardware. Outputs stay on disk.
- **Your keys.** Cloud calls go directly to OpenAI, Anthropic, Gemini, FAL, KIE, Replicate, and others. No credit markup.
- **Mixed.** Local and cloud models in the same graph.
- **Open.** AGPL-3.0. Self-host the same code we host.

---

## Building blocks

### Nodes

A **node** does one thing.

| Node | Does | Example |
|------|------|---------|
| **Image Generator** | Image from text | "Sunset over mountains" → image |
| **Agent** | Plans and executes a multi-step task | "Summarize this document" → structured summary |
| **TextToSpeech** | Text → audio | Blog post → narration |
| **Filter** | Drop items that don't match | Conditional branching |

Each node has inputs (left), outputs (right), and settings (right panel when selected).

### Workflows

A **workflow** is connected nodes. When you run it, inputs enter on the left, each node executes when its inputs are ready, results stream into preview and output nodes on the right.

Examples:
- Prompt → image model → save
- PDF → chunk → index → search → answer
- Story → characters → portraits → video

Workflows are the automation layer. Use them when you want a repeatable pipeline: generate media, transform files, call models, index documents, or prepare assets for another editor surface.

### Connections

Lines between ports. Types are checked — image outputs only connect to image inputs. Drag from an output port to an input port. Hover to inspect data in flight.

### Assets

An **asset** is a stored file: image, video, audio, PDF, text file, 3D model, or any other media a node can read or write. Assets live in the Asset Explorer and can be reused across workflows, sketches, timelines, and chats.

Assets are the shared material between surfaces:

- Drop an image asset onto the workflow canvas to create an image input.
- Save a workflow output as an asset so you can use it later.
- Drag video, audio, or image assets onto a timeline as clips.
- Open an image asset in the Sketch Editor for painting, masking, or layered edits.
- Put document assets in collections for indexing and RAG.

### Sketches

A **sketch** is a layered image document. It is for painting, masking, retouching, compositing, and generating image layers in place.

Sketches sit between manual editing and workflow automation:

- Start with a blank canvas or open an existing image asset.
- Paint or build up layers by hand.
- Bind a layer to an image workflow so it can regenerate when inputs change.
- Render the sketch back into an image asset.
- Use the rendered image in a workflow or timeline.

### Timelines

A **timeline** is a multi-track media sequence. It holds clips arranged over time: video, audio, still images, overlays, and generated clips.

Timelines are where outputs become finished media:

- Drag existing assets into tracks as imported clips.
- Add a generated clip backed by a workflow.
- Trim, split, reorder, and layer clips.
- Regenerate stale generated clips when the bound workflow or parameters change.
- Export the sequence to a video asset.

### Agents

An agent node takes a natural-language goal, breaks it into steps, and uses tools (web search, files, code) to finish. Use it when the path isn't fixed.

### Mini-Apps

A workflow with the graph hidden — just inputs and outputs. Share with people who shouldn't have to read a node graph.

---

## How everything fits together

NodeTool has one common loop:

1. **Collect or create assets.** Upload files, generate outputs from workflows, paint sketches, or export timelines.
2. **Build workflows around them.** Workflows read assets, call models, transform media, and write new assets.
3. **Edit the result in a surface built for the medium.** Use sketches for layered still images and timelines for time-based media.
4. **Feed the edited result back into workflows.** A rendered sketch or exported timeline is just another asset.
5. **Share the workflow or final output.** Keep the graph for repeatable work, expose it as a Mini-App, or publish the exported asset.

The surfaces are separate because they solve different editing problems, but they share the same asset store and model/provider system.

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

### Example: make a short product video

1. Upload product photos as assets.
2. Use a workflow to generate copy, background images, and voiceover.
3. Open a hero image in a sketch to mask and retouch it.
4. Drag the image, voiceover, and generated clips into a timeline.
5. Bind one clip to an image-to-video workflow and regenerate until it fits.
6. Export the timeline as the final video asset.

---

## Models

| Type | Output | Use |
|------|--------|-----|
| Image | Pictures | Posters, concept art, mockups |
| Video | Clips | Animation, motion |
| Audio | Sound | Narration, music, SFX |
| Text | Tokens | Scripts, summaries, analysis |

### Local vs. cloud

| | Local | Cloud |
|--|-------|-------|
| Cost | Free after download | Provider's price, billed to your key |
| Where | Your machine | Provider's servers |
| Speed | Your hardware | Provider's hardware |
| Internet | Offline OK | Required |
| Setup | Download (4–20 GB each) | Paste API key |

Mix freely. Pick the best model for the job per node.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Workflow** | Connected nodes |
| **Node** | One operation |
| **Edge / connection** | Data flow between nodes |
| **Input / output** | Entry and exit ports |
| **Preview** | Node that displays intermediate data |
| **Run** | Execute the graph |
| **Asset** | Stored file used by workflows, sketches, timelines, chats, or collections |
| **Sketch** | Layered image document for painting, masking, compositing, and image generation |
| **Timeline** | Multi-track sequence for arranging video, audio, image, and generated clips |
| **Clip** | Media item placed on a timeline track |
| **Generated clip / layer** | Timeline clip or sketch layer backed by a workflow or model call |
| **Stale** | Generated output whose inputs, prompt, or bound workflow changed since the last generation |
| **Model** | A trained network you call from a node |
| **Provider** | Where the model runs (local, OpenAI, FAL, …) |

---

## How a run works

On <kbd>Ctrl/⌘ + Enter</kbd>:

1. NodeTool walks the graph for dependencies.
2. Each node runs the moment its inputs are ready. Independent nodes run in parallel.
3. Results stream live into preview and output nodes.

{% mermaid %}
graph LR
    A[Input: Prompt] --> B[Agent: Plan]
    B --> C[Image Generator]
    B --> D[Text Writer]
    C --> E[Preview: Image]
    D --> F[Preview: Text]
{% endmermaid %}

The Agent runs first; Image Generator and Text Writer then run in parallel since both depend only on the Agent.

The graph is a DAG — data flows one way, no cycles. The runner schedules the order.

---

## For developers

| Component | Role |
|-----------|------|
| **Graph** | Nodes + connections. Build with `workflow(...)`, execute with `run(...)` or `runGraph(...)` (`@nodetool-ai/dsl` `packages/dsl/src/core.ts`). |
| **DSL** | [TypeScript DSL](developer/ts-dsl-guide.md) (`@nodetool-ai/dsl`) — typed factories for building graphs in code. |
| **WorkflowRunner** | The runner. Schedules nodes, manages GPU, streams progress. |
| **ProcessingContext** | Runtime — user, auth, assets, cache (`@nodetool-ai/runtime`). |

### Node type resolution

A workflow references nodes by type string (`package.Namespace.Class`). The runner resolves it via:

1. In-memory registry (with and without trailing `Node`)
2. Dynamic import by type path
3. Installed packages registry
4. Fallback match by class name

Graphs load without pre-importing every node module.

See the [Developer Guide](developer/) and [Custom Nodes](developer/custom-nodes-guide.md).

---

## Next

- [Getting Started](getting-started.md)
- [Workflow Editor](workflow-editor.md)
- [Asset Management](asset-management.md)
- [Sketch Editor](sketch-editor.md)
- [Video Editor](video-editor.md)
- [Models & Providers](models-and-providers.md)
- [Cookbook](cookbook.md)
