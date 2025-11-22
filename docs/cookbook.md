---
layout: page
title: "NodeTool Workflow Cookbook"
---

*A comprehensive guide for building AI workflows with NodeTool*

**Version:** 1.0 **Target Audience:** AI Agents, Developers, and Workflow Designers **Purpose:** Learn workflow
patterns, understand streaming architecture, and build production-ready AI workflows

______________________________________________________________________

## Table of Contents

1. [Core Concepts](#core-concepts)
1. [Streaming Architecture](#streaming-architecture)
1. [Workflow Patterns](#workflow-patterns)
1. [Examples by Category](#examples-by-category)
1. [Best Practices](#best-practices)
1. [Node Reference](#node-reference)

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

## Examples by Category

### Audio Processing

#### 1. Transcribe Audio

{% mermaid %}
graph TD
  whisper["Whisper"]
  audio_input["AudioInput"]
  string_output["StringOutput"]
  audio_input --> whisper
  whisper --> string_output
{% endmermaid %}

**Use**: Convert speech to text with timestamps

#### 2. Summarize Audio

{% mermaid %}
graph TD
  whisper["Whisper"]
  audio_input["AudioInput"]
  string_output["StringOutput (Summary)"]
  llm["LLM"]
  audio_input --> whisper
  llm --> string_output
  whisper --> llm
{% endmermaid %}

**Use**: Transcribe + summarize in one workflow

#### 3. Remove Silence

{% mermaid %}
graph TD
  remove_silence["RemoveSilence"]
  preview["Preview"]
  audio["Audio"]
  remove_silence --> preview
  audio --> remove_silence
{% endmermaid %}

**Use**: Clean audio by removing silent segments

______________________________________________________________________

### Video Processing

#### 1. Add Subtitles to Video

{% mermaid %}
graph TD
  extract_audio["ExtractAudio"]
  whisper["Whisper"]
  add_subtitles["AddSubtitles"]
  preview_1["Preview"]
  preview_2["Preview"]
  video["Video"]
  extract_audio --> whisper
  video --> extract_audio
  add_subtitles --> preview_1
  whisper --> add_subtitles
  video --> add_subtitles
  whisper --> preview_2
{% endmermaid %}

**Use**: Auto-generate and burn subtitles into video

#### 2. Audio to Spectrogram

{% mermaid %}
graph TD
  img2img["StableDiffusionImg2Img"]
  mel_spectrogram["MelSpectrogram"]
  audio_input["AudioInput"]
  resize["Resize"]
  image_output["ImageOutput"]
  convert_to_image["ConvertToImage"]
  audio_input --> mel_spectrogram
  resize --> img2img
  img2img --> image_output
  mel_spectrogram --> convert_to_image
  convert_to_image --> resize
{% endmermaid %}

**Use**: Convert audio to visual spectrogram, then enhance with AI

______________________________________________________________________

### Image Processing

#### 1. Upscaling

{% mermaid %}
graph TD
  real_esrgan["RealESRGAN"]
  image_input["ImageInput"]
  image_output["ImageOutput"]
  image_input --> real_esrgan
  real_esrgan --> image_output
{% endmermaid %}

**Use**: AI-powered image upscaling

#### 2. Object Detection

{% mermaid %}
graph TD
  preview["Preview"]
  image["Image"]
  object_detection["ObjectDetection"]
  visualize_object_detection["VisualizeObjectDetection"]
  image --> object_detection
  object_detection --> visualize_object_detection
  image --> visualize_object_detection
  visualize_object_detection --> preview
{% endmermaid %}

**Use**: Detect and visualize objects in images

#### 3. Depth Estimation

{% mermaid %}
graph TD
  depth_estimation["DepthEstimation"]
  image["Image"]
  preview["Preview"]
  image --> depth_estimation
  depth_estimation --> preview
{% endmermaid %}

**Use**: Estimate depth map from 2D image

#### 4. Segmentation

{% mermaid %}
graph TD
  image["Image"]
  segmentation["Segmentation"]
  visualize_segmentation["VisualizeSegmentation"]
  preview_1["Preview"]
  preview_2["Preview"]
  image --> segmentation
  visualize_segmentation --> preview_1
  segmentation --> preview_2
  image --> visualize_segmentation
  segmentation --> visualize_segmentation
{% endmermaid %}

**Use**: Segment image into regions

#### 5. Controlnet

{% mermaid %}
graph TD
  stable_diffusion_control_net["StableDiffusionControlNet"]
  preview["Preview"]
  image["Image"]
  canny["Canny"]
  image_to_text["ImageToText"]
  fit["Fit"]
  comment["Comment"]
  stable_diffusion_control_net --> preview
  canny --> stable_diffusion_control_net
  image_to_text --> stable_diffusion_control_net
  image --> fit
  fit --> canny
  fit --> image_to_text
{% endmermaid %}

**Use**: Generate images with edge-based guidance

______________________________________________________________________

### Document & Email Processing

#### 1. Categorize Mails

{% mermaid %}
graph TD
  gmail_search["GmailSearch"]
  email_fields["EmailFields"]
  classifier["Classifier"]
  preview["Preview"]
  comment_workflow["Comment"]
  gmail_search --> email_fields
  email_fields --> classifier
  classifier --> preview
{% endmermaid %}

**Use**: Automatically categorize emails with AI

#### 2. Summarize Paper

{% mermaid %}
graph TD
  load_document_file["LoadDocumentFile"]
  extract_text["ExtractText"]
  preview_summary["Preview (Summary)"]
  summarizer["Summarizer"]
  preview_text["Preview (Text)"]
  comment_workflow["Comment"]
  load_document_file --> extract_text
  extract_text --> summarizer
  extract_text --> preview_text
  summarizer --> preview_summary
{% endmermaid %}

**Use**: Extract and summarize research papers

#### 3. Fetch Papers

{% mermaid %}
graph TD
  get_request["GetRequest"]
  markdown_splitter["MarkdownSplitter"]
  filter["Filter"]
  extract_links["ExtractLinks"]
  download_file["DownloadFile"]
  preview["Preview"]
  comment_workflow["Comment"]
  get_request --> markdown_splitter
  markdown_splitter --> extract_links
  extract_links --> filter
  filter --> download_file
  filter --> preview
{% endmermaid %}

**Use**: Auto-download papers from web resources

#### 4. Summarize RSS

{% mermaid %}
graph TD
  fetch_r_s_s_feed["FetchRSSFeed"]
  collect["Collect"]
  summarizer["Summarizer"]
  preview["Preview"]
  string_output["StringOutput"]
  fetch_r_s_s_feed --> collect
  collect --> summarizer
  summarizer --> preview
  summarizer --> string_output
{% endmermaid %}

**Use**: Monitor and summarize RSS feeds

______________________________________________________________________

### Creative Generation

#### 1. Pokemon Maker

{% mermaid %}
graph TD
  animals_input["StringInput (Animals)"]
  format_text["FormatText (Pokemon Prompt)"]
  list_generator["ListGenerator"]
  stable_diffusion["StableDiffusion"]
  image_output["ImageOutput"]
  preview_description["Preview (Description)"]
  preview_image["Preview (Image)"]
  format_text --> list_generator
  list_generator --> stable_diffusion
  stable_diffusion --> image_output
  animals_input --> format_text
  list_generator --> preview_description
  stable_diffusion --> preview_image
{% endmermaid %}

**Use**: Generate Pokemon-style creatures from descriptions

#### 2. Re-Imagine

{% mermaid %}
graph TD
  comment_workflow["Comment"]
  image_input["Image"]
  fit["Fit"]
  image_to_text["ImageToText"]
  img2img["StableDiffusionImg2Img"]
  image_preview["Preview"]
  image_input --> fit
  fit --> image_to_text
  image_to_text --> img2img
  fit --> img2img
  img2img --> image_preview
{% endmermaid %}

**Use**: Reimagine an image with AI

#### 3. Img2Img

{% mermaid %}
graph TD
  comment_workflow["Comment"]
  image_input["Image"]
  img2img["StableDiffusionImg2Img"]
  image_preview["Preview"]
  image_input --> img2img
  img2img --> image_preview
{% endmermaid %}

**Use**: Simple image-to-image transformation

______________________________________________________________________

### Data Generation

#### 1. Data Generator

{% mermaid %}
graph TD
  preview["Preview"]
  data_generator["DataGenerator"]
  comment["Comment"]
  data_generator --> preview
{% endmermaid %}

**Use**: Generate structured datasets from natural language

______________________________________________________________________

## Best Practices

### 1. Workflow Design

**DO:**

- ✅ Use descriptive node names
- ✅ Add Comment nodes to document workflow sections
- ✅ Use Preview nodes to inspect intermediate results
- ✅ Keep workflows focused on a single goal
- ✅ Test with small inputs first

**DON'T:**

- ❌ Create circular dependencies (must be DAG)
- ❌ Overload a single workflow with too many tasks
- ❌ Skip error handling
- ❌ Forget to set output nodes

### 2. Streaming Workflows

**DO:**

- ✅ Use streaming nodes for real-time feedback
- ✅ Add Preview nodes to show progress
- ✅ Use `LLMStreaming` for chat-like experiences
- ✅ Use `Collect` to gather streaming results

**DON'T:**

- ❌ Block on streaming data when not needed
- ❌ Ignore progress updates in long-running workflows

### 3. Agent Workflows

**DO:**

- ✅ Provide clear, specific prompts
- ✅ Use FormatText to structure prompts
- ✅ Set appropriate model parameters
- ✅ Use Preview to validate agent output

**DON'T:**

- ❌ Use overly vague instructions
- ❌ Skip output validation
- ❌ Ignore model limitations

### 4. RAG Workflows

**DO:**

- ✅ Index documents before querying
- ✅ Use HybridSearch for better retrieval
- ✅ Format context properly in prompts
- ✅ Keep chunk sizes reasonable (256-512 tokens)

**DON'T:**

- ❌ Query without proper indexing
- ❌ Overload LLM with too much context
- ❌ Skip metadata in document chunks

### 5. Database Workflows

**DO:**

- ✅ Create tables before inserting
- ✅ Use proper data types
- ✅ Query before assuming data exists
- ✅ Handle empty results gracefully

**DON'T:**

- ❌ Assume table schema
- ❌ Forget to handle query failures

### 6. Multi-Modal Workflows

**DO:**

- ✅ Validate input types match expected formats
- ✅ Use appropriate conversion nodes
- ✅ Preview intermediate transformations
- ✅ Handle format-specific errors

**DON'T:**

- ❌ Chain incompatible types
- ❌ Skip validation steps

______________________________________________________________________

## Node Reference

### Input Nodes

| Node                 | Type          | Purpose                    |
| -------------------- | ------------- | -------------------------- |
| `StringInput`        | string        | Text input parameter       |
| `IntegerInput`       | int           | Whole number input         |
| `FloatInput`         | float         | Decimal number input       |
| `BooleanInput`       | bool          | True/false toggle          |
| `ImageInput`         | ImageRef      | Image asset reference      |
| `AudioInput`         | AudioRef      | Audio asset reference      |
| `VideoInput`         | VideoRef      | Video asset reference      |
| `DocumentInput`      | DocumentRef   | Document asset reference   |
| `CollectionInput`    | Collection    | Vector database collection |
| `RealtimeAudioInput` | Stream[Audio] | Streaming audio input      |

### Output Nodes

| Node           | Type     | Purpose                   |
| -------------- | -------- | ------------------------- |
| `StringOutput` | string   | Text output               |
| `ImageOutput`  | ImageRef | Image output              |
| `AudioOutput`  | AudioRef | Audio output              |
| `VideoOutput`  | VideoRef | Video output              |
| `Preview`      | any      | Show intermediate results |

### Agent Nodes

| Node                        | Streaming | Purpose                       |
| --------------------------- | --------- | ----------------------------- |
| `Agent`                     | ✅        | General LLM agent             |
| `Summarizer`                | ✅        | Text summarization            |
| `SummarizerStreaming`       | ✅        | Streaming summarization       |
| `ListGenerator`             | ✅        | Generate lists of items       |
| `DataGenerator`             | ✅        | Generate structured data      |
| `ChartGenerator`            | ✅        | Generate Plotly charts        |
| `StructuredOutputGenerator` | ❌        | Generate JSON objects         |
| `Classifier`                | ❌        | Classify text into categories |
| `Extractor`                 | ❌        | Extract structured data       |
| `RealtimeAgent`             | ✅        | OpenAI Realtime API           |
| `ResearchAgent`             | ❌        | Web research agent            |

### Control Nodes

| Node         | Purpose                           |
| ------------ | --------------------------------- |
| `FormatText` | String formatting with templates  |
| `Collect`    | Gather streaming items into list  |
| `Filter`     | Filter data based on conditions   |
| `Comment`    | Documentation node (no operation) |

### Storage Nodes

| Node          | Purpose             |
| ------------- | ------------------- |
| `CreateTable` | Create SQLite table |
| `Insert`      | Insert record       |
| `Query`       | Query records       |
| `Update`      | Update records      |
| `Delete`      | Delete records      |

### Vector Database Nodes

| Node               | Purpose                    |
| ------------------ | -------------------------- |
| `IndexTextChunks`  | Add text to vector DB      |
| `HybridSearch`     | Semantic + keyword search  |
| `LoadDocumentFile` | Load document from path    |
| `ExtractText`      | Extract text from document |
| `SentenceSplitter` | Split text into chunks     |

### Email Nodes

| Node           | Purpose                |
| -------------- | ---------------------- |
| `GmailSearch`  | Search Gmail           |
| `EmailFields`  | Extract email metadata |
| `FetchRSSFeed` | Fetch RSS feed         |

### Web Nodes

| Node           | Purpose                 |
| -------------- | ----------------------- |
| `GetRequest`   | HTTP GET request        |
| `ImportCSV`    | Parse CSV data          |
| `DownloadFile` | Download file from URL  |
| `ExtractLinks` | Extract links from text |

### Audio Nodes

| Node              | Purpose                      |
| ----------------- | ---------------------------- |
| `Whisper`         | Speech-to-text transcription |
| `RealtimeWhisper` | Streaming transcription      |
| `TextToSpeech`    | Text-to-speech generation    |
| `RemoveSilence`   | Remove silent segments       |
| `MelSpectrogram`  | Generate mel spectrogram     |
| `ExtractAudio`    | Extract audio from video     |

### Image Nodes

| Node                        | Purpose                  |
| --------------------------- | ------------------------ |
| `StableDiffusion`           | Text-to-image generation |
| `StableDiffusionImg2Img`    | Image transformation     |
| `StableDiffusionControlNet` | Guided image generation  |
| `RealESRGAN`                | AI upscaling             |
| `ObjectDetection`           | Detect objects           |
| `Segmentation`              | Segment image            |
| `DepthEstimation`           | Estimate depth           |
| `ImageToText`               | Generate image captions  |
| `Canny`                     | Edge detection           |
| `Fit`                       | Resize/fit image         |
| `Resize`                    | Resize image             |
| `Sharpen`                   | Sharpen image            |
| `AutoContrast`              | Auto-adjust contrast     |
| `ConvertToImage`            | Convert data to image    |
| `VisualizeObjectDetection`  | Draw bounding boxes      |
| `VisualizeSegmentation`     | Visualize segments       |

### Video Nodes

| Node           | Purpose                   |
| -------------- | ------------------------- |
| `AddSubtitles` | Burn subtitles into video |
| `ExtractAudio` | Extract audio track       |

### File System Nodes

| Node           | Purpose                 |
| -------------- | ----------------------- |
| `ListFiles`    | List files in directory |
| `PathToString` | Convert path to string  |

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
