---
layout: page
title: "Key Concepts"
description: "Core concepts behind NodeTool workflows."
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

### Connections

Lines between ports. Types are checked — image outputs only connect to image inputs. Drag from an output port to an input port. Hover to inspect data in flight.

### Agents

An agent node takes a natural-language goal, breaks it into steps, and uses tools (web search, files, code) to finish. Use it when the path isn't fixed.

### Mini-Apps

A workflow with the graph hidden — just inputs and outputs. Share with people who shouldn't have to read a node graph.

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
| **Graph** | Nodes + connections. Build with `graph()`, execute with `run_graph()`. |
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
- [Models & Providers](models-and-providers.md)
- [Cookbook](cookbook.md)
