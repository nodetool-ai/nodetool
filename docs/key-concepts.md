---
layout: page
title: "Key Concepts"
description: "Understand the creative building blocks of NodeTool - no AI or technical experience required."
---

This page explains the core concepts you need to create with NodeTool. **No AI experience required** – we'll use creative analogies you already know.

---

## What is NodeTool?

NodeTool is a **visual canvas for creating with AI**. Think of it like:
- **Photoshop layers** – but for AI workflows instead of image edits
- **A video editing timeline** – where you arrange creative processes instead of clips
- **Building with LEGO** – connect colorful blocks to create something amazing

**Why creators love it:**
- **Privacy:** Your creative work never leaves your machine unless you choose cloud services
- **Freedom:** Create unlimited content with no subscription fees or usage limits
- **Transparency:** See every step of your creative process—understand how the magic happens
- **Control:** Use free local AI or pay-per-use cloud services—you decide

**Creative analogy**: Imagine if your entire creative process—from idea to final output—was visible on a canvas. You could rearrange steps, add new techniques, and share the whole recipe with others. That's NodeTool.

---

## The Creative Building Blocks

### Nodes – Your Creative Tools

A **node** is like a single tool in your creative toolkit. Each one does a specific job:

- An **Image Generator** node creates art from your description
- A **Color Adjustment** node transforms the mood of an image
- An **Audio Transcription** node converts speech to text

Each node has:
- **Inputs** – What you feed in (like a photo or description)
- **Outputs** – What you get out (like generated art)
- **Settings** – Creative controls (like "how artistic?" or "how realistic?")

**Think of nodes like:**
- **Photoshop tools** – each does one specific thing (blur, adjust contrast, add text)
- **Guitar pedals** – chain them together for unique creative effects
- **Video filters** – apply one after another to build your look

### Workflows – Your Creative Recipe

A **workflow** is your complete creative process visualized. When you run it:
1. Your creative inputs flow in (text, images, ideas)
2. Each node transforms the work and passes it forward
3. Final creations appear in preview or output nodes

**Example workflow**: Write a story → AI generates characters → Create character portraits → Combine into a video

**Think of workflows like:**
- **A Photoshop action** – but you can see and modify every step
- **A video editing sequence** – arrange processes instead of clips
- **A cooking recipe** – but you can remix the steps however you want

### Connections – The Creative Flow

**Connections** are the lines showing how your creative work flows from one node to the next. Drag from an output circle to an input circle to connect them.

**Think of connections like:**
- **Wires in a music studio** – routing audio between effects
- **Pipes** – carrying your creative work through transformations
- **Video editing timeline** – showing what connects to what

---

## Understanding AI for Creatives

### What are "Models"?

An AI **model** is like a creative specialist you can hire for your project. Each one has learned a specific skill:

| Model Type | What It Creates | Creative Uses |
|------------|-----------------|---------------|
| Image Model | Art, photos, designs | Generate posters, concept art, product mockups |
| Video Model | Motion, effects, clips | Create animations, add effects, transform footage |
| Audio Model | Music, voices, sounds | Voice narration, music generation, sound effects |
| Text Model | Writing, ideas, scripts | Story ideas, scripts, marketing copy, brainstorming |

**You don't need to understand how models work** – just like you don't need to understand oil paint chemistry to paint. Pick the right tool for your creative vision.

**Creative analogy**: Models are like hiring specialists: a portrait artist, a video editor, a voice actor, or a copywriter. Each one is pre-trained and ready to help with your project.

### Local vs. Cloud Models

- **Local models** run on your computer – like having your own private studio. Free, private, unlimited use, but needs disk space and processing power.
- **Cloud models** run on remote servers – like renting a professional studio. Fast, powerful, latest tools, but requires internet and may cost per use.

NodeTool lets you mix both. Start local for privacy and unlimited experimentation, add cloud models when you need cutting-edge capabilities.

**Creative analogy**: Local = your home studio with your own equipment. Cloud = booking time in a professional facility with the latest gear.

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
