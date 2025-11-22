---
layout: page
title: "NodeTool Workflow Cookbook"
---

*A comprehensive guide for building AI workflows with NodeTool*

**Version:** 1.0 **Target Audience:** AI Agents, Developers, and Workflow Designers **Purpose:** Learn workflow
patterns, understand streaming architecture, and build production-ready AI workflows

______________________________________________________________________

## Table of Contents

1. [Detailed Workflow Examples](#detailed-workflow-examples)
1. [Core Concepts](#core-concepts)
1. [Streaming Architecture](#streaming-architecture)
1. [Workflow Patterns](#workflow-patterns)

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

## Core Concepts

### What is a NodeTool Workflow?

A NodeTool workflow is a **Directed Acyclic Graph (DAG)** where:

- **Nodes** represent operations (processing, generation, transformation)
- **Edges** represent data flow between nodes
- **Execution** follows dependency order automatically

```
Input → Process → Transform → Output
```

### Key Principles

1. **Data Flows Through Edges**: Nodes connect via typed edges (image → image, text → text, etc.)
1. **Asynchronous Execution**: Nodes execute when dependencies are satisfied
1. **Streaming by Default**: Many nodes support real-time streaming output
1. **Type Safety**: Connections enforce type compatibility

### Node Types

| Type                 | Purpose           | Examples                                  |
| -------------------- | ----------------- | ----------------------------------------- |
| **Input Nodes**      | Accept parameters | `StringInput`, `ImageInput`, `AudioInput` |
| **Processing Nodes** | Transform data    | `Resize`, `Filter`, `ExtractText`         |
| **Agent Nodes**      | LLM-powered logic | `Agent`, `Summarizer`, `ListGenerator`    |
| **Output Nodes**     | Return results    | `ImageOutput`, `StringOutput`, `Preview`  |
| **Control Nodes**    | Flow control      | `Collect`, `FormatText`                   |
| **Storage Nodes**    | Persistence       | `CreateTable`, `Insert`, `Query`          |

______________________________________________________________________

## Streaming Architecture

### Why Streaming?

NodeTool workflows support **streaming execution** for:

- **Real-time feedback**: See results as they're generated
- **Lower latency**: Start processing before all data arrives
- **Better UX**: Progress indicators and incremental results
- **Efficient memory**: Process large data in chunks

### Streaming Nodes

Nodes that support streaming output:

- **`Agent`**: Streams LLM responses token by token
- **`ListGenerator`**: Streams list items as they're generated
- **`RealtimeAgent`**: Streams audio + text responses
- **`RealtimeWhisper`**: Streams transcription as audio arrives
- **`RealtimeAudioInput`**: Streams audio from an input source

### Data Flow Patterns

#### Pattern 1: Sequential Pipeline

```
Input → Process → Transform → Output
```

Each node waits for previous node to complete.

#### Pattern 2: Parallel Branches

```
        → ProcessA → OutputA
Input →
        → ProcessB → OutputB
```

Multiple branches execute in parallel.

#### Pattern 3: Streaming Pipeline

```
Input → StreamingAgent → Collect → Output
         (yields chunks)
```

Data flows in chunks, enabling real-time updates.

#### Pattern 4: Fan-In Pattern

```
SourceA →
         → Combine → Process → Output
SourceB →
```

Multiple inputs combine before processing.

______________________________________________________________________

## Workflow Patterns

To build any example:
– press Space to add nodes
– drag connections
– press Ctrl/⌘+Enter to run
– add Preview nodes to inspect intermediate results

### Pattern 1: Simple Pipeline

**Use Case**: Transform input → process → output

**Example**: Image Enhancement

{% mermaid %}
graph TD
  image_output["ImageOutput"]
  image_input["ImageInput"]
  sharpen["Sharpen"]
  auto_contrast["AutoContrast"]
  image_input --> sharpen
  sharpen --> auto_contrast
  auto_contrast --> image_output
{% endmermaid %}

**When to Use**:

- Simple data transformations
- Single input, single output
- No conditional logic needed

______________________________________________________________________

### Pattern 2: Agent-Driven Generation

**Use Case**: LLM generates content based on input

**Example**: Image to Story

{% mermaid %}
graph TD
  image_input["Image"]
  agent_story["Agent (Story Generator)"]
  preview_audio["Preview (Audio)"]
  comment_workflow["Comment"]
  text_to_speech["TextToSpeech"]
  image_input --> agent_story
  agent_story --> text_to_speech
  text_to_speech --> preview_audio
{% endmermaid %}

**When to Use**:

- Creative generation tasks
- Multimodal transformations (image→text→audio)
- Need semantic understanding

**Key Nodes**:

- `Agent`: General-purpose LLM agent with streaming
- `Summarizer`: Specialized for text summarization
- `ListGenerator`: Streams list of items

______________________________________________________________________

### Pattern 3: Streaming with Multiple Previews

**Use Case**: Show intermediate results during generation

**Example**: Movie Poster Generator

{% mermaid %}
graph TD
  strategy_llm["Agent (Strategy)"]
  strategy_template_prompt["String (Strategy Template)"]
  strategy_preview["Preview (Strategy)"]
  strategy_prompt_formatter["FormatText (Strategy)"]
  movie_title_input["StringInput (Title)"]
  genre_input["StringInput (Genre)"]
  audience_input["StringInput (Audience)"]
  image_preview["Preview (Image)"]
  prompt_list_generator["ListGenerator"]
  designer_instructions_prompt["String (Designer Instructions)"]
  preview_prompts["Preview (Prompts)"]
  mflux["MFlux"]
  strategy_llm --> strategy_preview
  strategy_template_prompt --> strategy_prompt_formatter
  strategy_prompt_formatter --> strategy_llm
  strategy_llm --> prompt_list_generator
  designer_instructions_prompt --> prompt_list_generator
  audience_input --> strategy_prompt_formatter
  movie_title_input --> strategy_prompt_formatter
  genre_input --> strategy_prompt_formatter
  prompt_list_generator --> preview_prompts
  prompt_list_generator --> mflux
  mflux --> image_preview
{% endmermaid %}

**When to Use**:

- Complex multi-stage generation
- User needs to see progress
- Agent planning + execution workflow

**Key Concepts**:

- **Strategy Phase**: Agent plans approach
- **Preview Nodes**: Show intermediate results
- **ListGenerator**: Streams generated prompts
- **Image Generation**: Final output

______________________________________________________________________

### Pattern 4: RAG (Retrieval-Augmented Generation)

**Use Case**: Answer questions using documents as context

**Example**: Chat with Docs

{% mermaid %}
graph TD
  chat_input["ChatInput"]
  string_output["StringOutput (Answer)"]
  format_text["FormatText"]
  hybrid_search["HybridSearch"]
  llm_streaming["LLMStreaming"]
  chat_input --> format_text
  chat_input --> hybrid_search
  hybrid_search --> format_text
  format_text --> llm_streaming
  llm_streaming --> string_output
{% endmermaid %}

**When to Use**:

- Question-answering over documents
- Need factual accuracy from specific sources
- Reduce LLM hallucinations

**Key Components**:

1. **Search**: Query vector database for relevant documents
1. **Format**: Inject retrieved context into prompt
1. **Generate**: Stream LLM response with context

**Related Workflow**: Index PDFs

{% mermaid %}
graph TD
  list_files["ListFiles"]
  collection["Collection"]
  load_document["LoadDocumentFile"]
  extract_text["ExtractText"]
  index_chunks["IndexTextChunks"]
  sentence_splitter["SentenceSplitter"]
  path_to_string["PathToString"]
  extract_text --> sentence_splitter
  load_document --> extract_text
  sentence_splitter --> index_chunks
  collection --> index_chunks
  list_files --> load_document
  list_files --> path_to_string
  path_to_string --> sentence_splitter
{% endmermaid %}

______________________________________________________________________

### Pattern 5: Database Persistence

**Use Case**: Store generated data for later retrieval

**Example**: AI Flashcard Generator with SQLite

{% mermaid %}
graph TD
  topic_input["StringInput (Topic)"]
  create_table["CreateTable"]
  format_prompt["FormatText"]
  generate_flashcards["DataGenerator"]
  insert_flashcard["Insert"]
  query_all["Query"]
  display_result["Preview"]
  topic_input --> format_prompt
  format_prompt --> generate_flashcards
  generate_flashcards --> insert_flashcard
  create_table --> query_all
  create_table --> insert_flashcard
  query_all --> display_result
{% endmermaid %}

**When to Use**:

- Need persistent storage
- Building apps with memory
- Agent workflows that need to recall past interactions

**Key Nodes**:

- `CreateTable`: Initialize database schema
- `Insert`: Add records
- `Query`: Retrieve records
- `Update`: Modify records
- `Delete`: Remove records

**Database Flow**:

1. Create table structure
1. Generate data with agent
1. Insert into database
1. Query and display results

______________________________________________________________________

### Pattern 6: Email & Web Integration

**Use Case**: Process emails or web content

**Example**: Summarize Newsletters

{% mermaid %}
graph TD
  gmail_search["GmailSearch"]
  email_fields["EmailFields"]
  summarizer_streaming["SummarizerStreaming"]
  preview_summary["Preview (Summary)"]
  preview_body["Preview (Body)"]
  gmail_search --> email_fields
  email_fields --> summarizer_streaming
  summarizer_streaming --> preview_summary
  email_fields --> preview_body
{% endmermaid %}

**When to Use**:

- Automate email processing
- Monitor RSS feeds
- Extract web content

**Key Nodes**:

- `GmailSearch`: Search Gmail with queries
- `EmailFields`: Extract email metadata
- `FetchRSSFeed`: Get RSS feed entries
- `GetRequest`: Fetch web content

______________________________________________________________________

### Pattern 7: Realtime Processing

**Use Case**: Process streaming audio/video in real-time

**Example**: Realtime Agent

{% mermaid %}
graph TD
  audio_input["RealtimeAudioInput"]
  preview_output["Preview"]
  realtime_agent["RealtimeAgent"]
  audio_input --> realtime_agent
  realtime_agent --> preview_output
{% endmermaid %}

**When to Use**:

- Voice interfaces
- Live transcription
- Interactive audio applications

**Key Nodes**:

- `RealtimeAudioInput`: Streaming audio input
- `RealtimeAgent`: OpenAI Realtime API with streaming
- `RealtimeWhisper`: Live transcription
- `RealtimeTranscription`: OpenAI transcription streaming

______________________________________________________________________

### Pattern 8: Multi-Modal Workflows

**Use Case**: Convert between different media types

**Example**: Audio to Image

{% mermaid %}
graph TD
  stable_diffusion["StableDiffusion"]
  whisper["Whisper"]
  audio_input["AudioInput"]
  image_output["ImageOutput"]
  whisper --> stable_diffusion
  audio_input --> whisper
  stable_diffusion --> image_output
{% endmermaid %}

**When to Use**:

- Converting between media types
- Creating rich multimedia experiences
- Accessibility applications

**Common Chains**:

- Audio → Text → Image
- Image → Text → Audio
- Video → Audio → Text → Summary

______________________________________________________________________

### Pattern 9: Advanced Image Processing

**Use Case**: AI-powered image transformations

**Example**: Style Transfer

{% mermaid %}
graph TD
  stable_diffusion_control_net_img2img["StableDiffusionControlNetImg2Img"]
  image_input_1["ImageInput"]
  image_input_2["ImageInput"]
  image_output["ImageOutput"]
  canny["Canny"]
  image_to_text["ImageToText"]
  fit_1["Fit"]
  fit_2["Fit"]
  stable_diffusion_control_net_img2img --> image_output
  canny --> stable_diffusion_control_net_img2img
  image_to_text --> stable_diffusion_control_net_img2img
  image_input_2 --> fit_1
  image_input_1 --> fit_2
  fit_2 --> canny
  fit_2 --> image_to_text
  image_input_2 --> stable_diffusion_control_net_img2img
  fit_2 --> stable_diffusion_control_net_img2img
{% endmermaid %}

**When to Use**:

- Style transfer between images
- Controlled image generation
- Preserving structure while changing style

**Key Techniques**:

- **ControlNet**: Preserve structure with edge detection
- **Image-to-Text**: Generate descriptions
- **Img2Img**: Transform while maintaining composition

______________________________________________________________________

### Pattern 10: Data Processing Pipeline

**Use Case**: Fetch, transform, and visualize data

**Example**: Data Visualization Pipeline

{% mermaid %}
graph TD
  preview_1["Preview"]
  get_request["GetRequest"]
  import_c_s_v["ImportCSV"]
  filter["Filter"]
  chart_generator["ChartGenerator"]
  preview_2["Preview"]
  get_request --> import_c_s_v
  import_c_s_v --> filter
  filter --> preview_1
  filter --> chart_generator
  chart_generator --> preview_2
{% endmermaid %}

**When to Use**:

- Fetch external data sources
- Transform and filter datasets
- Auto-generate visualizations

**Key Nodes**:

- `GetRequest`: Fetch web resources
- `ImportCSV`: Parse CSV data
- `Filter`: Transform data
- `ChartGenerator`: AI-generated charts with Plotly

______________________________________________________________________

## Quick Reference: Choose Your Pattern

### I want to...

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

______________________________________________________________________

## Conclusion

This cookbook provides patterns and examples for building production-ready NodeTool workflows. Key takeaways:

1. **Start Simple**: Begin with basic pipelines, add complexity as needed
1. **Use Streaming**: Leverage streaming for better UX and performance
1. **Preview Often**: Add Preview nodes to debug and validate
1. **Combine Patterns**: Mix patterns to create sophisticated workflows
1. **Test Incrementally**: Build workflows step by step, testing each addition

### Next Steps

1. **Explore Examples**: Try running the example workflows in this cookbook
1. **Build Your Own**: Start with a simple pattern and customize it
1. **Share Workflows**: Export and share your workflows with the community
1. **Extend NodeTool**: Create custom nodes for specific use cases

### Resources

- **MCP Server**: Use `export_workflow_digraph` to visualize workflows
- **Node Search**: Use `search_nodes` to discover available nodes
- **Documentation**: Check node descriptions with `get_node_info`

______________________________________________________________________

**Version:** 1.0 **Last Updated:** 2025-10-12 **Generated with:** NodeTool MCP Server + Claude Code
