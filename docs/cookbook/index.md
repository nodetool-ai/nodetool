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

1. [**Core Concepts & Architecture**]({{ '/cookbook/core-concepts' | relative_url }})
   Learn about the DAG structure, streaming execution, and node types.

2. [**Workflow Patterns**]({{ '/cookbook/patterns' | relative_url }})
   Explore 15+ common workflow patterns with diagrams and use cases.

______________________________________________________________________

## Detailed Workflow Examples

For step-by-step guides with detailed explanations and Mermaid diagrams, browse our [Workflow Examples Gallery]({{ '/workflows/' | relative_url }}).

**Highlighted Examples:**

- [Image Enhance]({{ '/workflows/image-enhance' | relative_url }}) - Basic image enhancement workflow
- [Transcribe Audio]({{ '/workflows/transcribe-audio' | relative_url }}) - Speech-to-text with Whisper
- [Chat with Docs]({{ '/workflows/chat-with-docs' | relative_url }}) - RAG-based document Q&A
- [Creative Story Ideas]({{ '/workflows/creative-story-ideas' | relative_url }}) - Beginner tutorial workflow
- [Movie Posters]({{ '/workflows/movie-posters' | relative_url }}) - Multi-stage AI generation
- [Data Visualization Pipeline]({{ '/workflows/data-visualization-pipeline' | relative_url }}) - Data fetching and visualization

[View all 19+ workflow examples →]({{ '/workflows/' | relative_url }})

______________________________________________________________________

## Quick Reference: Choose Your Pattern

### I want to

**Generate creative content:** → Use Pattern 2 (Agent-Driven Generation) → Nodes: `Agent`, `ListGenerator`, image/audio
generators

**Answer questions about documents:** → Use Pattern 4 (RAG) → First: Index documents with `IndexTextChunks` → Then:
Query with `HybridSearch` + `Agent`

**Process emails automatically:** → Use Pattern 6 (Email Integration) → Nodes: `GmailSearch`, `EmailFields`,
`Classifier`/`Summarizer`

**Build a voice interface:** → Use Pattern 7 (Realtime Processing) → Nodes: `RealtimeAudioInput`, `RealtimeAgent`

**Store data persistently:** → Use Pattern 5 (Database Persistence) → Nodes: `CreateTable`, `Insert`, `Query`

**Transform images with AI:** → Use Pattern 9 (Advanced Image Processing) → Nodes: `StableDiffusionControlNet`, `Canny`,
`ImageToText`

**Generate videos from text:** → Use Pattern 11 (Text-to-Video) → Nodes: `KlingTextToVideo`, `HailuoTextToVideoPro`, `Sora2TextToVideo`

**Animate images to video:** → Use Pattern 12 (Image-to-Video) → Nodes: `KlingImageToVideo`, `HailuoImageToVideoPro`, `Wan26ImageToVideo`

**Create talking avatars:** → Use Pattern 13 (Talking Avatar) → Nodes: `KlingAIAvatarPro`, `KlingAIAvatarStandard`, `InfinitalkV1`

**Enhance video quality:** → Use Pattern 14 (Video Enhancement) → Nodes: `TopazVideoUpscale`

**Convert storyboards to video:** → Use Pattern 15 (Storyboard to Video) → Nodes: `Sora2ProStoryboard`

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
