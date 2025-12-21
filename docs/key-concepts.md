---
layout: page
title: "Key Concepts"
description: "Understand the core concepts behind NodeTool - no prior AI or machine learning experience required."
---

This page explains the fundamental concepts you need to understand NodeTool. **No prior AI or machine learning experience is required** – we'll explain everything in plain terms.

---

## What is NodeTool?

NodeTool is a **visual tool for building AI workflows**. Think of it like connecting building blocks: each block does one thing (like generating an image or transcribing audio), and you connect them together to create something more complex.

**Real-world analogy**: Imagine an assembly line in a factory. Each station does one job (cut, paint, assemble), and products move from one station to the next. NodeTool works the same way – data flows from one node to the next, getting transformed at each step.

---

## The Building Blocks

### Nodes – The Workers

A **node** is a single building block that does one specific job. For example:

- An **Image Input** node lets you upload a picture
- A **Text Generator** node uses AI to write text
- An **Audio Transcription** node converts speech to text

Each node has:
- **Inputs** – What goes in (like uploading an image)
- **Outputs** – What comes out (like generated text)
- **Settings** – Options you can adjust (like how creative the AI should be)

**Think of nodes like apps on your phone** – each one does something specific, and you can combine them to accomplish bigger tasks.

### Workflows – The Assembly Line

A **workflow** is a collection of connected nodes. When you run a workflow:
1. Data enters through input nodes
2. Each node processes data and passes results to the next
3. Final results appear in output or preview nodes

**Example workflow**: Upload an image → AI describes the image → Text-to-speech reads the description aloud

### Connections – The Wires

**Connections** (also called edges) are the lines that link nodes together. They show how data flows from one node to the next. You create connections by dragging from an output on one node to an input on another.

---

## Understanding AI in NodeTool

### What are "Models"?

An AI **model** is a pre-trained program that has learned to do a specific task. NodeTool uses different models for different jobs:

| Model Type | What It Does | Example Use |
|------------|--------------|-------------|
| Language Model (LLM) | Understands and generates text | Write stories, answer questions |
| Image Model | Creates or edits images | Generate art, enhance photos |
| Speech Model | Converts between speech and text | Transcribe audio, read text aloud |
| Vision Model | Understands images | Describe photos, extract text from documents |

**You don't need to understand how models work** – just pick one that fits your task, and NodeTool handles the rest.

### Local vs. Cloud Models

- **Local models** run on your computer – private and free, but require disk space and processing power
- **Cloud models** run on remote servers – fast and powerful, but require internet and may have usage costs

NodeTool lets you mix both in the same workflow. Start local for privacy, add cloud models when you need extra power.

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

## Node Type Resolution

When a workflow references a node by its type string (e.g., `package.Namespace.Class`), NodeTool resolves the class
using a robust strategy:

- In-memory registry lookup (with and without a trailing `Node` suffix)
- Dynamic import of modules based on the type path, then re-check the registry
- Lookup in the installed packages registry for external nodes
- Fallback match by class name only, ignoring an optional `Node` suffix

This enables loading graphs without pre-importing all node modules and supports short class-name references in some
cases.
