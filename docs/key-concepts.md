---
layout: page
title: "Key Concepts"
description: "Core concepts for building workflows in NodeTool."
---

This page explains the core concepts for creating workflows in NodeTool.

---

## What is NodeTool?

NodeTool is a visual workflow builder for AI pipelines. It functions like:
- Photoshop layers – but for AI workflows
- A video editing timeline – arranging processing steps
- Building blocks – connect components to create pipelines

**Key benefits:**
- **Privacy:** Data stays local unless you use cloud services
- **No usage limits:** Local models have no subscription fees
- **Transparency:** See every step of execution
- **Flexibility:** Choose local or cloud providers

---

## Building Blocks

### Nodes

A **node** performs a single operation:

- **Image Generator** node – creates images from text prompts
- **Color Adjustment** node – modifies image colors
- **Audio Transcription** node – converts speech to text

Each node has:
- **Inputs** – data entering the node
- **Outputs** – results from the node
- **Settings** – configuration options

### Workflows

A **workflow** is a connected graph of nodes. When executed:
1. Data enters through input nodes
2. Each node processes and passes data forward
3. Results appear in preview or output nodes

**Example**: Write a story → Generate characters → Create portraits → Combine into video

### Connections

**Connections** are lines showing data flow between nodes. Drag from an output to an input to create a connection.

---

## AI Models

### What are Models?

An AI **model** is a trained program for a specific task:

| Model Type | Output | Use Cases |
|------------|--------|-----------|
| Image Model | Images | Posters, concept art, product mockups |
| Video Model | Video clips | Animations, effects, transformations |
| Audio Model | Audio | Narration, music, sound effects |
| Text Model | Text | Story ideas, scripts, analysis |

### Local vs. Cloud Models

- **Local models** – Run on your computer. Free, private, unlimited use. Requires disk space and processing power.
- **Cloud models** – Run on remote servers. Fast, requires internet, may cost per use.

NodeTool supports both. Use local for privacy, add cloud models for additional capabilities.

---

## Key Terminology

| Term | Plain English Explanation |
|------|---------------------------|
| **Workflow** | Your project – a collection of connected nodes that do something useful |
| **Node** | A single building block that performs one task |
| **Edge/Connection** | A line connecting two nodes, showing data flow |
| **Input** | Where data enters a node or workflow |
| **Output** | Where results come out |
| **Preview** | A special node that shows you intermediate results |
| **Run** | Execute your workflow and see the results |
| **Model** | An AI program trained to do a specific task |
| **Provider** | A service that runs AI models (OpenAI, local engine, etc.) |

---

## How Workflows Execute

When you click **Run**, NodeTool:

1. **Checks dependencies** – Figures out which nodes depend on which
2. **Processes in order** – Runs nodes only when their inputs are ready
3. **Streams results** – Shows progress in real-time where possible
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

When a workflow references a node by its type string (e.g., `package.Namespace.Class`), NodeTool resolves the class using a robust strategy:

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
