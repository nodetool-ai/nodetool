---
layout: page
title: "Models Manager"
description: "Browse, download, and manage AI models for your NodeTool workflows."
---

The **Models Manager** helps you browse, download, and manage AI models available on your system.

---

## Opening the Manager

Click the **Models** icon in the app header to open the Models Manager dialog. It shows all downloaded models, recommended models, and available models from configured providers.

![Models Manager — Full View](assets/screenshots/models-list.png)

---

## Browsing Models

![Model Type Filters](assets/screenshots/screenshot-placeholder.svg)

### Filter by Type

Use the type filters on the left to narrow the list:

| Filter | Model Type | Example Use |
|--------|-----------|-------------|
| **LLM** | Large Language Models | Text generation, chat, reasoning |
| **VLM** | Vision-Language Models | Image understanding, visual Q&A |
| **Embedding** | Embedding Models | Vector search, similarity matching |
| **Image Gen** | Image Generation | Text-to-image, image-to-image |
| **Video Gen** | Video Generation | Text-to-video, image-to-video |
| **Audio Gen** | Audio Generation | Music, sound effects |
| **TTS** | Text-to-Speech | Voice synthesis, narration |
| **ASR** | Automatic Speech Recognition | Transcription, dictation |
| **Reranker** | Reranking Models | Search result refinement |

### Search and Sort

- **Search by name** or repository to quickly find specific models
- Toggle between **grid** and **list** layouts
- **Favorites** -- Star frequently used models for quick access
- **Recent** -- See models you've used recently

---

## Downloading Models

![Download Progress](assets/screenshots/screenshot-placeholder.svg)

1. Find the model you want in the browser
2. Click **Download** to start fetching it to your local cache
3. Track progress in the **Downloads** bar at the bottom of the screen

### Download Details

- Downloads continue in the background while you navigate the app
- The bottom bar shows total progress, speed, and estimated time remaining
- Click the Downloads bar to expand and see individual file progress
- Downloads automatically retry on network failures (up to 5 attempts with exponential backoff)

### Storage Location

Downloaded models are stored in your local HuggingFace cache (`~/.cache/huggingface/`) or provider-specific locations (e.g., `~/.ollama/` for Ollama models).

---

## Managing Models

### Per-Model Actions

![Model Card Actions](assets/screenshots/screenshot-placeholder.svg)

- **Download** -- Fetch a model to your local cache
- **Delete** -- Remove a model you no longer need to free disk space
- **Show in Explorer** -- Open the model folder on your computer
- **README** -- Read the model's documentation on Hugging Face

![Model README](assets/screenshots/screenshot-placeholder.svg)

### Recommended Models

![Recommended Models Dialog](assets/screenshots/screenshot-placeholder.svg)

Many workflow nodes specify recommended or required models. The Models Manager highlights these under a **Recommended** section with direct install links, so you can quickly get the models your workflows need.

### Model Selection Dialogs

Each property role has a type-aware picker:

- **Language Model** — LLM selector with provider grouping
- **Image Model** — image-generation models only
- **Video Model** — video-generation models only
- **TTS / ASR Model** — speech models only
- **Embedding Model** — vector embedding models only
- **HuggingFace Model** — search any HF repo

![Language Model Selector](assets/screenshots/screenshot-placeholder.svg)

### Cloud Provider Models

Models from cloud providers (OpenAI, Anthropic, Google, etc.) appear in the manager based on your configured API keys. These don't require downloading -- they run remotely when you use them in workflows.

Configure API keys in **Settings > Providers**. See [Models & Providers](models-and-providers.md) for setup details.

---

## Next Steps

- [Models & Providers](models-and-providers.md) -- Configure providers and API keys
- [Installation](installation.md#hardware-requirements-by-task) -- Hardware requirements for local models
- [HuggingFace Integration](huggingface.md) -- Browse and use HuggingFace models
