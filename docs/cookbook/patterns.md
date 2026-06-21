---
layout: page
title: Workflow Patterns
parent: NodeTool Workflow Cookbook
nav_order: 2
---

To build any example:
– press Space to add nodes
– drag connections
– press Ctrl/⌘+Enter to run
– add Preview nodes to inspect intermediate results

<span id="pattern-1-simple-pipeline"></span>

### Pattern 1: Simple Pipeline

**Use Case**: Transform input → process → output

**Example**: Image Enhancement

{% mermaid %}
graph TD
  output["Output"]
  image_input["ImageInput"]
  sharpen["UnsharpMask"]
  auto_contrast["AutoContrast"]
  image_input --> sharpen
  sharpen --> auto_contrast
  auto_contrast --> output
{% endmermaid %}

**When to Use**:

- Simple data transformations
- Single input, single output
- No conditional logic needed

______________________________________________________________________

<span id="pattern-2-agent-driven-generation"></span>

### Pattern 2: Agent-Driven Generation

**Use Case**: LLM generates content based on input

**Example**: Image to Story

{% mermaid %}
graph TD
  image_input["Image"]
  agent_story["Agent (Story Generator)"]
  preview_audio["Preview (Audio)"]
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

<span id="pattern-3-streaming-with-multiple-previews"></span>

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
  text_to_image["TextToImage"]
  strategy_llm --> strategy_preview
  strategy_template_prompt --> strategy_prompt_formatter
  strategy_prompt_formatter --> strategy_llm
  strategy_llm --> prompt_list_generator
  designer_instructions_prompt --> prompt_list_generator
  audience_input --> strategy_prompt_formatter
  movie_title_input --> strategy_prompt_formatter
  genre_input --> strategy_prompt_formatter
  prompt_list_generator --> preview_prompts
  prompt_list_generator --> text_to_image
  text_to_image --> image_preview
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

<span id="pattern-4-rag-retrieval-augmented-generation"></span>

### Pattern 4: RAG (Retrieval-Augmented Generation)

**Use Case**: Answer questions using documents as context

**Example**: Chat with Docs

{% mermaid %}
graph TD
  chat_input["StringInput"]
  output["Output (Answer)"]
  format_text["FormatText"]
  hybrid_search["HybridSearch"]
  agent["Agent"]
  chat_input --> format_text
  chat_input --> hybrid_search
  hybrid_search --> format_text
  format_text --> agent
  agent --> output
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
  index_chunks["IndexTextChunk"]
  sentence_splitter["SplitRecursively"]
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

<span id="pattern-5-database-persistence"></span>

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

<span id="pattern-6-email--web-integration"></span>

### Pattern 6: Email & Web Integration

**Use Case**: Process emails or web content

**Example**: Summarize Newsletters

{% mermaid %}
graph TD
  gmail_search["GmailSearch"]
  email_fields["Template"]
  summarizer_streaming["Summarizer"]
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

- `GmailSearch` (`lib.mail.GmailSearch`): Search Gmail with queries
- `Template`: Format email fields into text (lib.mail also provides `AddLabel`, `MoveToArchive`, `SendEmail`)
- `FetchRSSFeed`: Get RSS feed entries
- `GetRequest`: Fetch web content

______________________________________________________________________

<span id="pattern-7-realtime-processing"></span>

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
- `RealtimeAgent` (`openai.agents.RealtimeAgent`): OpenAI Realtime API with streaming
- `RealtimeTranscription` (`openai.agents.RealtimeTranscription`): OpenAI transcription streaming

______________________________________________________________________

<span id="pattern-8-multi-modal-workflows"></span>

### Pattern 8: Multi-Modal Workflows

**Use Case**: Convert between different media types

**Example**: Audio to Image

{% mermaid %}
graph TD
  stable_diffusion["StableDiffusion"]
  whisper["Whisper"]
  audio_input["AudioInput"]
  output["Output"]
  whisper --> stable_diffusion
  audio_input --> whisper
  stable_diffusion --> output
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

<span id="pattern-9-advanced-image-processing"></span>

### Pattern 9: Advanced Image Processing

**Use Case**: AI-powered image transformations

**Example**: Style Transfer

{% mermaid %}
graph TD
  sd_img2img["StableDiffusionV3MediumImageToImage"]
  image_input_1["ImageInput"]
  image_input_2["ImageInput"]
  output["Output"]
  image_to_text["ImageToText"]
  fit_1["Fit"]
  fit_2["Fit"]
  sd_img2img --> output
  image_to_text --> sd_img2img
  image_input_2 --> fit_1
  image_input_1 --> fit_2
  fit_2 --> image_to_text
  image_input_2 --> sd_img2img
  fit_2 --> sd_img2img
{% endmermaid %}

**When to Use**:

- Style transfer between images
- Controlled image generation
- Preserving structure while changing style

**Key Techniques**:

- **Img2Img**: Transform while maintaining composition (`StableDiffusionV3MediumImageToImage`, or `StableDiffusion` / `StableDiffusionXL` for text-to-image)
- **Image-to-Text**: Generate descriptions (`ImageToText`)
- **Canny**: Edge detection preprocessing

______________________________________________________________________

<span id="pattern-10-data-processing-pipeline"></span>

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

<span id="pattern-11-text-to-video"></span>

### Pattern 11: Text-to-Video Generation

**Use Case**: Generate videos from text descriptions

**Example**: Cinematic Video from Prompt

{% mermaid %}
graph TD
  string_input["StringInput (Prompt)"]
  output["Output"]
  kling_text_to_video["KlingVideoV16ProTextToVideo"]
  string_input --> kling_text_to_video
  kling_text_to_video --> output
{% endmermaid %}

**When to Use**:

- Create videos from text descriptions
- Generate concept videos and storyboards
- Produce cinematic content from prompts
- Rapid video prototyping

**Key Nodes**:

- `KlingVideoV16ProTextToVideo`: High-quality text-to-video (Kling 1.6 Pro)
- `MinimaxHailuo23ProTextToVideo`: Professional quality (Hailuo 2.3)
- `Sora2TextToVideo`: OpenAI Sora 2 model
- `WanProTextToVideo`: Alibaba Wan

**Configuration Tips**:

- Duration: 5-10 seconds for most models
- Resolution: 768P for faster generation, 1080P for quality
- Aspect ratios: 16:9 (landscape), 9:16 (portrait), 1:1 (square)

______________________________________________________________________

<span id="pattern-12-image-to-video"></span>

### Pattern 12: Image-to-Video Generation

**Use Case**: Animate images into videos

**Example**: Bring Images to Life

{% mermaid %}
graph TD
  image_input["ImageInput"]
  string_input["StringInput (Motion Guide)"]
  output["Output"]
  kling_image_to_video["KlingVideoV16StandardImageToVideo"]
  image_input --> kling_image_to_video
  string_input --> kling_image_to_video
  kling_image_to_video --> output
{% endmermaid %}

**When to Use**:

- Animate static images
- Create motion from photographs
- Multi-image video generation
- Product showcases from images

**Key Nodes**:

- `KlingVideoV16StandardImageToVideo`: Kling 1.6 Standard image-to-video
- `MinimaxHailuo02ProImageToVideo`: High-quality animation (Hailuo 02 Pro)
- `SeeDanceV15ProImageToVideo`: ByteDance SeeDance 1.5 Pro
- `WanV225bImageToVideo`: Alibaba Wan 2.2

**Advanced Pattern**: Multi-Image Animation

{% mermaid %}
graph TD
  image1["ImageInput (Frame 1)"]
  image2["ImageInput (Frame 2)"]
  image3["ImageInput (Frame 3)"]
  motion_prompt["StringInput (Motion)"]
  output["Output"]
  kling_i2v["KlingVideoV16StandardImageToVideo"]
  kling_i2v --> output
  image1 --> kling_i2v
  image2 --> kling_i2v
  image3 --> kling_i2v
  motion_prompt --> kling_i2v
{% endmermaid %}

______________________________________________________________________

<span id="pattern-13-talking-avatar"></span>

### Pattern 13: Talking Avatar Generation

**Use Case**: Create lip-synced avatar videos

**Example**: Virtual Presenter

{% mermaid %}
graph TD
  image_input["ImageInput (Face Photo)"]
  audio_input["AudioInput (Speech)"]
  output["Output"]
  kling_avatar["KlingVideoAiAvatarV2Pro"]
  image_input --> kling_avatar
  audio_input --> kling_avatar
  kling_avatar --> output
{% endmermaid %}

**When to Use**:

- Create virtual presenters
- Generate lip-synced avatar videos
- Educational content with AI speakers
- Virtual influencers and spokespersons

**Key Nodes**:

- `KlingVideoAiAvatarV2Pro`: Pro-quality avatar generation
- `KlingVideoAiAvatarV2Standard`: Standard mode for faster generation
- `Infinitalk`: Audio-driven video generation

**Workflow**: Audio + Image → Talking Avatar

1. **Photo Input**: Front-facing portrait image
2. **Audio Track**: Speech recording or TTS output
3. **Optional Prompt**: Guide emotions and expressions
4. **Mode Selection**: Standard (faster) or Pro (higher quality)

______________________________________________________________________

<span id="pattern-14-video-enhancement"></span>

### Pattern 14: Image Enhancement & Upscaling

**Use Case**: Improve image quality and resolution

**Example**: HD Image Upscaling

{% mermaid %}
graph TD
  image_input["ImageInput (Low Res)"]
  output["Output (High Res)"]
  topaz_upscale["TopazUpscaleImage"]
  image_input --> topaz_upscale
  topaz_upscale --> output
{% endmermaid %}

**When to Use**:

- Upscale low-resolution images
- Remove noise and artifacts
- Enhance image quality
- Prepare images for high-resolution displays

**Key Nodes**:

- `TopazUpscaleImage`: AI-powered upscaling to higher resolutions
- Denoise option: Reduces artifacts during upscaling

**Configuration**:

- Higher target resolutions for crisp output
- Denoise: Enable for noisy input images
- Best for: Enhancing old photos, smartphone images, web graphics

______________________________________________________________________

<span id="pattern-15-storyboard-to-video"></span>

### Pattern 15: Storyboard to Video

**Use Case**: Convert image sequences to coherent videos

**Example**: Visual Story Generation

{% mermaid %}
graph TD
  story_prompt["StringInput (Story)"]
  image1["ImageInput (Scene 1)"]
  image2["ImageInput (Scene 2)"]
  image3["ImageInput (Scene 3)"]
  output["Output"]
  sora_storyboard["Sora2ImageToVideoPro"]
  sora_storyboard --> output
  story_prompt --> sora_storyboard
  image1 --> sora_storyboard
  image2 --> sora_storyboard
  image3 --> sora_storyboard
{% endmermaid %}

**When to Use**:

- Create narrative videos from storyboards
- Combine multiple scenes into one video
- Professional video pre-visualization
- Animated story creation

**Key Nodes**:

- `Sora2ImageToVideoPro`: OpenAI Sora 2 Pro keyframe-driven generation
- Supports: 1-3 keyframe images
- Output: Smooth transitions between scenes

**Workflow**:

1. **Story Prompt**: Describe the narrative arc
2. **Keyframes**: Provide 1-3 scene images
3. **Generation**: Sora creates smooth transitions
4. **Duration**: 1-60 frames configurable
