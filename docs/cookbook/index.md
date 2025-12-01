---
layout: page
title: "NodeTool Workflow Cookbook"
has_children: true
---

*A comprehensive guide for building AI workflows with NodeTool*

**Version:** 1.0 **Target Audience:** AI Agents, Developers, and Workflow Designers **Purpose:** Learn workflow
patterns, understand streaming architecture, and build production-ready AI workflows

______________________________________________________________________

## Cookbook Sections

1. [**Core Concepts & Architecture**](core-concepts.md)
   Learn about the DAG structure, streaming execution, and node types.

2. [**Workflow Patterns**](patterns.md)
   Explore 10+ common workflow patterns with diagrams and use cases.

______________________________________________________________________

## Detailed Workflow Examples

For step-by-step guides with detailed explanations and Mermaid diagrams, browse our [Workflow Examples Gallery](/workflows/).

**Highlighted Examples:**

- [Image Enhance](/workflows/image-enhance.md) - Basic image enhancement workflow
- [Transcribe Audio](/workflows/transcribe-audio.md) - Speech-to-text with Whisper
- [Chat with Docs](/workflows/chat-with-docs.md) - RAG-based document Q&A
- [Creative Story Ideas](/workflows/creative-story-ideas.md) - Beginner tutorial workflow
- [Movie Posters](/workflows/movie-posters.md) - Multi-stage AI generation
- [Data Visualization Pipeline](/workflows/data-visualization-pipeline.md) - Data fetching and visualization

[View all 19+ workflow examples →](/workflows/)

______________________________________________________________________

## Quick Reference: Choose Your Pattern

### I want to

**Generate creative content:** → Use Pattern 2 (Agent-Driven Generation) → Nodes: `Agent`, `ListGenerator`, image/audio
generators

**Answer questions about documents:** → Use Pattern 4 (RAG) → First: Index documents with `IndexTextChunks` → Then:
Query with `HybridSearch` + `LLMStreaming`

**Process emails automatically:** → Use Pattern 6 (Email Integration) → Nodes: `GmailSearch`, `EmailFields`,
`Classifier`/`Summarizer`

**Build a voice interface:** → Use Pattern 7 (Realtime Processing) → Nodes: `RealtimeAudioInput`, `RealtimeAgent`

**Store data persistently:** → Use Pattern 5 (Database Persistence) → Nodes: `CreateTable`, `Insert`, `Query`

**Transform images with AI:** → Use Pattern 9 (Advanced Image Processing) → Nodes: `StableDiffusionControlNet`, `Canny`,
`ImageToText`

**Process audio/video:** → Check Audio/Video examples → Nodes: `Whisper`, `AddSubtitles`, `RemoveSilence`

**Fetch and visualize data:** → Use Pattern 10 (Data Processing Pipeline) → Nodes: `GetRequest`, `ImportCSV`,
`ChartGenerator`

### Next Steps

1. **Explore Examples**: Try running the example workflows in this cookbook
1. **Build Your Own**: Start with a simple pattern and customize it
1. **Share Workflows**: Export and share your workflows with the community
1. **Extend NodeTool**: Create custom nodes for specific use cases

### Resources

- **MCP Server**: Use `export_workflow_digraph` to visualize workflows
- **Node Search**: Use `search_nodes` to discover available nodes
- **Documentation**: Check node descriptions with `get_node_info`
