---
layout: page
title: "Key Concepts"
description: "Core concepts for building workflows in NodeTool."
---

Understand how NodeTool works.

---

## What NodeTool Does

NodeTool is a visual workflow builder for AI. Think of it like:
- **Photoshop layers** - but for AI operations
- **Video editing timeline** - arrange processing steps
- **Building blocks** - connect pieces to make something work

**Why use it:**
- **Private** - Data stays local unless you use cloud services
- **Unlimited** - Local models have no subscription fees
- **Transparent** - See every step as it runs
- **Flexible** - Mix local and cloud providers

---

## Building Blocks

### Nodes

A **node** does one thing:

- **Image Generator** - Makes images from text
- **Color Adjustment** - Changes image colors
- **Audio Transcription** - Converts speech to text

Every node has:
- **Inputs** - Data coming in
- **Outputs** - Results going out
- **Settings** - Options you can change

### Workflows

A **workflow** is nodes connected together. When you run it:
1. Data enters through input nodes
2. Each node processes and passes data forward
3. Results show in preview or output nodes

**Example workflow:**
Write story → Generate characters → Create portraits → Combine into video

### Connections

**Connections** are the lines between nodes showing how data flows. Each connection has a **type** — you can only connect compatible types (e.g., image output to image input).

- **Drag** from an output port to an input port to create a connection
- **Connection colors** indicate data type (text, image, audio, etc.)
- **Hover** over a connection to see what data is flowing through it
- **Invalid connections** are prevented automatically — NodeTool won't let you connect mismatched types

### Agents

An **agent** is a node that can plan and execute multi-step tasks autonomously. Unlike regular nodes that perform one fixed operation, agents:

- Receive a goal or instruction in natural language
- Break it down into steps
- Use tools (web search, file operations, code execution) to complete the task
- Return structured results

Use agents for tasks that require reasoning, planning, or dynamic decision-making.

### Mini-Apps

A **Mini-App** is a simplified view of a workflow. It hides the node graph and shows only the inputs and outputs, creating a clean interface that anyone can use — no technical knowledge needed.

Mini-Apps are ideal for sharing workflows with non-technical users or creating focused tools for specific tasks.

---

## AI Models

### What They Are

An AI **model** is a trained program for a specific task:

| Type | Makes | Good For |
|------|-------|----------|
| Image | Pictures | Posters, concept art, mockups |
| Video | Video clips | Animations, effects |
| Audio | Sound | Narration, music, effects |
| Text | Words | Story ideas, scripts, analysis |

### Local vs. Cloud

- **Local** - Runs on your machine. Free, private, unlimited. Needs disk space and power.
- **Cloud** - Runs on remote servers. Fast, needs internet, costs per use.

NodeTool supports both. Use local for privacy. Add cloud for more capabilities.

---

## Key Terms

| Term | What It Means |
|------|---------------|
| **Workflow** | Your project - connected nodes doing something useful |
| **Node** | One building block that does one task |
| **Edge/Connection** | Line showing data flow between nodes |
| **Input** | Where data enters |
| **Output** | Where results come out |
| **Preview** | Node that shows intermediate results |
| **Run** | Execute your workflow |
| **Model** | AI program trained for a specific task |
| **Provider** | Service running AI models (OpenAI, local, etc.) |

---

## How Workflows Run

When you click **Run**:

1. **Check dependencies** — figure out which nodes depend on what
2. **Process in order** — run nodes when their inputs are ready (independent nodes run in parallel)
3. **Stream results** — show progress live when possible
4. **Display outputs** — final results appear in output and preview nodes

{% mermaid %}
graph LR
    A[Input: Prompt] --> B[Agent: Plan]
    B --> C[Image Generator]
    B --> D[Text Writer]
    C --> E[Preview: Image]
    D --> F[Preview: Text]
{% endmermaid %}

In this example, the Agent node runs first (it depends on the Input). Then the Image Generator and Text Writer run **in parallel** since they both depend only on the Agent output. NodeTool figures this out automatically.

**The technical term**: Workflows are "Directed Acyclic Graphs" (DAGs), meaning data flows in one direction without loops. You don't need to remember this — just know that NodeTool automatically figures out the right order to run everything.

---

## For Developers

If you're building custom nodes or using the TypeScript API, here are the key technical components:

| Component | What It Does |
|-----------|-------------|
| **Graph** | A collection of nodes and connections. Use `graph()` to build and `run_graph()` to execute. |
| **DSL** | [TypeScript DSL](developer/ts-dsl-guide.md) (`@nodetool/dsl`) for building workflows programmatically with type-safe factories. |
| **WorkflowRunner** | The execution engine. Handles parallel execution, GPU management, and progress streaming. |
| **ProcessingContext** | Runtime environment providing user data, auth tokens, asset storage, and cache adapters (`@nodetool/runtime`). |

### Node Type Resolution

When a workflow references a node by its type string (e.g., `package.Namespace.Class`), NodeTool resolves the class through:

1. In-memory registry lookup (with and without a trailing `Node` suffix)
2. Dynamic import of modules based on the type path
3. Installed packages registry for external nodes
4. Fallback match by class name only

This enables loading graphs without pre-importing all node modules and supports short class-name references.

See the [Developer Guide](developer/) and [Custom Nodes Guide](developer/custom-nodes-guide.md) for building your own nodes.

---

## Next Steps

- **[Getting Started](getting-started.md)** – Build your first workflow in 10 minutes
- **[Workflow Editor](workflow-editor.md)** – Learn the interface
- **[Models & Providers](models-and-providers.md)** – Set up AI models
- **[Cookbook](cookbook.md)** – Explore workflow patterns and examples
