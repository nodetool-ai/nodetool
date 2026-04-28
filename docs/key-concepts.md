---
layout: page
title: "Key Concepts"
description: "Core concepts for building workflows in NodeTool."
---

Understand the core ideas behind NodeTool so you can build workflows confidently.

---

## What NodeTool Does

NodeTool is a visual workflow builder for AI. Instead of writing code, you connect building blocks (called **nodes**) to create powerful AI pipelines. Think of it like:
- **Photoshop layers** — but for AI operations instead of image edits
- **A video editing timeline** — arrange processing steps in sequence
- **LEGO blocks** — snap pieces together to make something work

**Why use NodeTool:**
- **Private** — Data stays on your machine unless you choose to use cloud services
- **Unlimited** — Local models have no per-use fees or subscription costs
- **Transparent** — See every step execute and inspect intermediate results in real-time
- **Flexible** — Mix local and cloud providers in the same workflow

---

## Building Blocks

### Nodes

A **node** is a single building block that performs one specific task:

| Node | What It Does | Example Use |
|------|-------------|-------------|
| **Image Generator** | Creates images from text descriptions | "A sunset over mountains" → image |
| **Agent** | Plans and executes multi-step tasks | "Summarize this document" → structured summary |
| **TextToSpeech** | Converts text to spoken audio | Blog post → narrated audio file |
| **Filter** | Filters data based on conditions | Remove items that don't match criteria |

Every node has:
- **Inputs** (left side) — Data coming in, shown as colored circles
- **Outputs** (right side) — Results going out, also colored circles
- **Settings** — Configuration options visible when you click the node

### Workflows

A **workflow** is a collection of nodes connected together to accomplish a task. When you click **Run**:
1. Data enters through **input nodes** (left side of the canvas)
2. Each node processes data and passes results forward through connections
3. Final results appear in **preview** or **output nodes** (right side)

**Example workflows:**
- **Image generation:** Text prompt → AI Image Generator → Save to file
- **Document Q&A:** Upload PDF → Index chunks → Search → Generate answer
- **Content pipeline:** Write story → Generate characters → Create portraits → Combine into video

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

| | Local Models | Cloud Models |
|--|-------------|-------------|
| **Cost** | Free after download | Pay per use |
| **Privacy** | Data stays on your machine | Data sent to provider servers |
| **Speed** | Depends on your hardware | Generally fast |
| **Internet** | Works offline | Requires connection |
| **Setup** | Download models (4–20 GB each) | Just add an API key |

NodeTool supports both — and you can mix them in the same workflow. Use local models for privacy-sensitive tasks and cloud models when you need the latest capabilities or don't have powerful hardware.

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

When you click **Run** (or press `Ctrl/⌘ + Enter`):

1. **Check dependencies** — NodeTool analyzes which nodes depend on what
2. **Process in order** — nodes run as soon as their inputs are ready (independent nodes run **in parallel** automatically)
3. **Stream results** — progress is shown live, so you see output as it's generated
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
| **DSL** | [TypeScript DSL](developer/ts-dsl-guide.md) (`@nodetool-ai/dsl`) for building workflows programmatically with type-safe factories. |
| **WorkflowRunner** | The execution engine. Handles parallel execution, GPU management, and progress streaming. |
| **ProcessingContext** | Runtime environment providing user data, auth tokens, asset storage, and cache adapters (`@nodetool-ai/runtime`). |

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
