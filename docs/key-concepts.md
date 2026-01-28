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

**Connections** are lines showing data flow. Drag from output to input to connect.

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

1. **Check dependencies** - Figure out which nodes depend on what
2. **Process in order** - Run nodes when their inputs are ready
3. **Stream results** - Show progress live when possible
4. **Displays outputs** – Final results appear in output and preview nodes

**The technical term**: Workflows are "Directed Acyclic Graphs" (DAGs), meaning data flows in one direction without loops. You don't need to remember this – just know that NodeTool automatically figures out the right order to run everything.

---

## For Developers: Technical Details

If you're building custom nodes or using the Python API, here are the technical components:

- **Graph** – A collection of nodes and their connections. Use `graph()` to build graphs and `run_graph()` to execute them.
- **DSL** – NodeTool provides a Python domain specific language with modules for different domains (`nodetool.dsl.chroma`, `nodetool.dsl.google`, ...).
- **WorkflowRunner** – The engine that executes graphs. It handles parallel execution, GPU management and progress updates.
- **ProcessingContext** – Holds runtime information like user data and authentication tokens.

### Node Type Resolution

When a workflow references a node by its type string (e.g., `package.Namespace.Class`), NodeTool resolves the class using this strategy:

- In-memory registry lookup (with and without a trailing `Node` suffix)
- Dynamic import of modules based on the type path, then re-check the registry
- Lookup in the installed packages registry for external nodes
- Fallback match by class name only, ignoring an optional `Node` suffix

This enables loading graphs without pre-importing all node modules and supports short class-name references.

---

## Next Steps

- **[Getting Started](getting-started.md)** – Build your first workflow in 10 minutes
- **[Workflow Editor](workflow-editor.md)** – Learn the interface
- **[Models & Providers](models-and-providers.md)** – Set up AI models
- **[Cookbook](cookbook.md)** – Explore workflow patterns and examples
