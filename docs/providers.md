---
layout: page
title: "Providers"
---

The NodeTool provider system offers a unified interface for interacting with various AI service providers. This
abstraction allows you to switch between different AI backends (OpenAI, Anthropic, Gemini, HuggingFace, etc.)
without changing your workflow logic.

## Overview

Providers in NodeTool act as adapters that translate between NodeTool's internal formats and the specific API
requirements of different AI services. The system supports multiple modalities:

- **Language Models (LLMs)** - Text generation and chat completions
- **Image Generation** - Text-to-image and image-to-image creation
- **Video Generation** - Text-to-video and image-to-video synthesis
- **Text-to-Speech (TTS)** - Convert text to natural speech audio
- **Automatic Speech Recognition (ASR)** - Transcribe audio to text

To select a provider, pick a model in the node property panel. Providers are grouped under model families: OpenAI,
Anthropic, Gemini, Hugging Face, Ollama, vLLM.

## Architecture

### Provider Capabilities

The capability system uses introspection to automatically detect which features a provider supports:

| Capability                     | Description                  | Method                           |
| ------------------------------ | ---------------------------- | -------------------------------- |
| `GENERATE_MESSAGE`             | Single message generation    | `generate_message()`             |
| `GENERATE_MESSAGES`            | Streaming message generation | `generate_messages()`            |
| `TEXT_TO_IMAGE`                | Generate images from text    | `text_to_image()`                |
| `IMAGE_TO_IMAGE`               | Transform images with text   | `image_to_image()`               |
| `TEXT_TO_VIDEO`                | Generate videos from text    | `text_to_video()`                |
| `IMAGE_TO_VIDEO`               | Animate images into videos   | `image_to_video()`               |
| `TEXT_TO_SPEECH`               | Convert text to speech       | `text_to_speech()`               |
| `AUTOMATIC_SPEECH_RECOGNITION` | Transcribe audio to text     | `automatic_speech_recognition()` |

## Available Providers

### Language Model Providers

#### OpenAI (`openai_provider.py`)

**Capabilities:** Language models (GPT-4, GPT-3.5), Image generation (DALL-E), Speech services

**Configuration:**

**Features:**

- ✅ Streaming responses
- ✅ Native tool/function calling
- ✅ System prompts
- ✅ Multimodal inputs (vision)
- ✅ JSON mode
- ✅ Image generation (DALL-E 2 & 3)
- ✅ Text-to-speech (TTS)
- ✅ Speech-to-text (Whisper)

#### Anthropic (`anthropic_provider.py`)

**Capabilities:** Claude language models, Advanced reasoning

**Configuration:**

**Features:**

- ✅ Streaming responses
- ✅ Native tool/function calling
- ✅ System prompts
- ✅ Multimodal inputs (vision)
- ✅ JSON mode (via tool use)

#### Google Gemini (`gemini_provider.py`)

**Capabilities:** Gemini language models, Multimodal AI, Video generation

**Features:**

- ✅ Streaming responses
- ✅ Native tool/function calling
- ✅ System prompts
- ✅ File input (via Blobs)
- ✅ JSON mode
- ✅ Video generation (Veo 2, Veo 3)

#### Ollama (`ollama_provider.py`)

**Capabilities:** Local/self-hosted models, Open-source models

**Configuration:**

**Features:**

- ✅ Streaming responses
- ✅ Tool calling (model dependent)
- ✅ System prompts
- ✅ Multimodal inputs (Base64 images)
- ✅ JSON mode (model dependent)
- ✅ No API key required
- ✅ Privacy-focused (runs locally)

**Notes:**

- Tool use and JSON mode support depends on the specific model
- Textual fallback mechanism available for incompatible models
- Models must be pulled via `ollama pull` before use

#### vLLM (`vllm_provider.py`)

**Capabilities:** Self-hosted inference, OpenAI-compatible API

**Features:**

- ✅ Streaming responses
- ✅ Tool calling (model dependent)
- ✅ System prompts
- ✅ Multimodal inputs (OpenAI format)
- ✅ JSON mode (model dependent)
- ✅ High throughput inference

### Image Generation Providers

#### HuggingFace (`huggingface_provider.py`)

**Capabilities:** Diverse model ecosystem, Multiple hosted services, 500,000+ models

**Features:**

- 27+ node categories for AI workflows
- Supports multiple sub-providers (FAL.ai, Together, Replicate, etc.)
- Text generation with streaming support
- Text-to-image and image-to-image generation
- Speech recognition and text-to-speech
- Audio and video generation
- Image classification and object detection
- Zero-shot learning capabilities
- LoRA model support for Stable Diffusion
- Quantization support (FP16, FP4, INT4)
- CPU offload for memory-constrained environments

**Configuration:**

Set `HF_TOKEN` environment variable for authentication. Some models require accepting terms on HuggingFace Hub.

For detailed information on all HuggingFace nodes, model recommendations, and usage examples, see the [HuggingFace Integration Guide](huggingface.md).

### Video Generation Providers

Multiple providers now support advanced video generation capabilities through the unified interface. NodeTool supports text-to-video and image-to-video generation:

#### OpenAI Sora 2 Pro

**Capabilities:** Text-to-video, Image-to-video

**Features:**
- ✅ Realistic motion with refined physics simulation
- ✅ Synchronized native audio generation
- ✅ Up to 15 seconds of video generation
- ✅ 1080p output resolution
- ✅ Advanced scene understanding

**Configuration:** Set `OPENAI_API_KEY` environment variable or configure in Settings → Providers

#### Google Veo 3.1 (via Gemini)

**Capabilities:** Text-to-video, Image-to-video, Multi-image reference

**Features:**
- ✅ Upgraded realistic motion synthesis
- ✅ Extended clip length support
- ✅ Multi-image reference inputs for consistent generation
- ✅ Native 1080p with synchronized audio
- ✅ Advanced camera control

**Configuration:** Set `GEMINI_API_KEY` environment variable or configure in Settings → Providers

#### xAI Grok Imagine

**Capabilities:** Multimodal text/image-to-video, Text-to-image

**Features:**
- ✅ Coherent motion synthesis from text or image inputs
- ✅ Synchronized audio generation
- ✅ Short video generation with strong coherence
- ✅ Also supports high-quality text-to-image

**Configuration:** Access via kie.ai or other API aggregators (direct API key not currently registered in NodeTool)

#### Alibaba Wan 2.6

**Capabilities:** Multi-shot video generation, Reference-guided generation

**Features:**
- ✅ Affordable 1080p video generation
- ✅ Stable character consistency across shots
- ✅ Native audio synthesis
- ✅ T2V/I2V with reference-guided modes
- ✅ Cost-effective for high-volume workflows

**Configuration:** Access via kie.ai or other API aggregators (direct API key not currently registered in NodeTool)

#### MiniMax Hailuo 2.3

**Capabilities:** High-fidelity text-to-video and image-to-video

**Features:**
- ✅ Expressive character animation
- ✅ Complex motion and lighting effects
- ✅ High visual fidelity
- ✅ Natural movement patterns

**Configuration:** Set `MINIMAX_API_KEY` environment variable or configure in Settings → Providers

#### Kling 2.6

**Capabilities:** Video generation with audio

**Features:**
- ✅ Text/image to synchronized video
- ✅ Integrated speech synthesis
- ✅ Ambient sound generation
- ✅ Sound effects generation
- ✅ Strong audio-visual coherence

**Configuration:** Access via kie.ai or other API aggregators (direct API key not currently registered in NodeTool)

### Image Generation Providers

#### Black Forest Labs FLUX.2

**Capabilities:** Advanced text-to-image generation

**Features:**
- ✅ Photorealistic image generation
- ✅ Multi-reference consistency
- ✅ Accurate text rendering in images
- ✅ Flexible control parameters
- ✅ High-quality output across diverse styles

**Configuration:** Available through HuggingFace provider or direct API access

#### Google Nano Banana Pro

**Capabilities:** High-resolution text-to-image

**Features:**
- ✅ Sharper 2K native output
- ✅ 4K upscaling
- ✅ Improved text rendering accuracy
- ✅ Better character consistency
- ✅ Detail preservation

**Configuration:** Access via Google's Gemini API using `GEMINI_API_KEY`, or through kie.ai

### Multi-Provider Aggregators

#### kie.ai

**Capabilities:** Unified access to multiple AI providers and models

**Features:**
- ✅ Access to all the SOTA models listed above through a single API
- ✅ Often offers competitive or lower pricing than upstream providers
- ✅ Simplified API management with one key for multiple models
- ✅ Cost optimization through provider selection
- ✅ Aggregated billing across multiple AI services

**Configuration:** Set `KIE_API_KEY` environment variable or configure in Settings → Providers

**Direct NodeTool Support:**
- OpenAI Sora 2 Pro (via `OPENAI_API_KEY`)
- Google Veo 3.1 (via `GEMINI_API_KEY`)
- MiniMax Hailuo 2.3 (via `MINIMAX_API_KEY`)

**Available via kie.ai (no direct NodeTool API key):**
- xAI Grok Imagine
- Alibaba Wan 2.6
- Kling 2.6
- Black Forest Labs FLUX.2
- Google Nano Banana Pro

kie.ai provides access to multiple models through a unified interface. This is useful for workflows that use models from different providers, as it reduces API key management complexity and can offer better pricing. **For models without direct NodeTool API key support, kie.ai is the recommended access method.**

## Generic Nodes: Provider-Agnostic Workflows

A useful feature of the NodeTool provider system is **generic nodes**. These are nodes that let
you switch AI providers without modifying your workflow.

Generic nodes support provider switching without altering the graph. This is the recommended way to design
multi-provider workflows.

### What Are Generic Nodes?

Generic nodes are workflow nodes in the `nodetool.*` namespace that accept a `model` parameter containing provider
information. Instead of being tied to a specific provider (like `openai.image.Dalle` or `gemini.video.Veo`), these nodes
dynamically route requests to the appropriate provider based on the selected model.

### Available Generic Nodes

The following generic nodes are available in the NodeTool interface (visible in the left panel quick actions):

#### nodetool.agents.Agent

**Purpose:** Execute complex tasks using any language model provider

**Quick Switch:**

- OpenAI GPT-4
- Anthropic Claude
- Google Gemini
- Ollama (local models)
- Any other LLM provider

#### nodetool.image.TextToImage

**Purpose:** Generate images from text prompts

**Quick Switch:**

- Black Forest Labs FLUX.2
- Google Nano Banana Pro
- HuggingFace (via FAL, Replicate, etc.)
- OpenAI DALL-E
- Local models (ComfyUI, MLX)

#### nodetool.image.ImageToImage

**Purpose:** Transform images with text guidance

**Quick Switch:**

- HuggingFace providers
- Local inference servers
- Cloud-based services

#### nodetool.video.TextToVideo

**Purpose:** Create videos from text descriptions

**Quick Switch:**

- OpenAI Sora 2 Pro
- Google Veo 3.1 (Gemini)
- xAI Grok Imagine
- Alibaba Wan 2.6
- MiniMax Hailuo 2.3
- Kling 2.6
- HuggingFace models
- Future video providers

#### nodetool.video.ImageToVideo

**Purpose:** Animate static images into videos

**Quick Switch:**

- OpenAI Sora 2 Pro
- Google Veo 3.1 (Gemini)
- xAI Grok Imagine
- Alibaba Wan 2.6
- MiniMax Hailuo 2.3
- Kling 2.6
- Stability AI
- Other video generation services

#### nodetool.audio.TextToSpeech

**Purpose:** Convert text to natural speech

**Quick Switch:**

- OpenAI TTS
- ElevenLabs
- Local TTS models

#### nodetool.text.AutomaticSpeechRecognition

**Purpose:** Transcribe audio to text

**Quick Switch:**

- OpenAI Whisper
- HuggingFace models
- Local ASR engines

### How to Use Generic Nodes

#### In the Web UI

1. **Quick Actions Panel (Left Side)**

   - Click any of the colorful quick action buttons
   - Or Shift-click to auto-add to canvas center
   - Or drag to specific position on canvas

1. **Switch Providers**

   - Select the node
   - In the properties panel, click the `model` dropdown
   - Choose from available models grouped by provider
   - The node automatically routes to the new provider

1. **Benefits**

   - Build workflows once, test with multiple providers
   - Compare quality/cost across providers
   - Fall back to different providers if one is unavailable
   - Optimize costs by mixing providers in one workflow

### Provider Parameter Mapping

Generic nodes map parameters to provider-specific formats:

**TextToImage mapping:**

```python
TextToImageParams(
    prompt="...",           # → All providers
    negative_prompt="...",  # → HuggingFace, Gemini (ignored by DALL-E)
    width=1024,            # → HuggingFace (mapped to size for DALL-E)
    height=1024,           # → HuggingFace (mapped to size for DALL-E)
    guidance_scale=7.5,    # → HuggingFace (not used by DALL-E)
    num_inference_steps=30,# → HuggingFace (not used by DALL-E)
    seed=42,               # → HuggingFace (not supported by DALL-E)
    scheduler="...",       # → HuggingFace-specific
)
```

If a provider does not support a parameter (e.g., negative prompt for DALL-E), NodeTool automatically ignores or
remaps it.

**TextToVideo mapping:**

```python
TextToVideoParams(
    prompt="...",          # → All providers
    aspect_ratio="16:9",   # → Provider-specific interpretation
    resolution="720p",     # → Provider-specific interpretation
    num_frames=60,         # → Provider-specific (duration mapping)
    guidance_scale=7.5,    # → Provider-specific
)
```

### Best Practices

1. **Start with Generic Nodes**

   - Use generic nodes for production workflows
   - Easier to migrate between providers
   - Better cost optimization options

1. **Provider-Specific Nodes for Special Features**

   - Use provider-specific nodes when you need unique features
   - Example: Anthropic Claude's thinking mode
   - Example: OpenAI's vision with detail parameter

1. **Fallback Strategies**

   - Build workflows that try multiple providers
   - Handle provider-specific errors gracefully
   - Use cheaper providers for dev/testing

1. **Model Selection**

   - Balance quality, speed, and cost
   - Fast models for prototyping (e.g., FLUX Schnell)
   - High-quality models for production (e.g., DALL-E 3, Veo 3)

1. **Parameter Optimization**

   - Learn which parameters each provider respects
   - Test with different settings per provider
   - Document optimal settings for your use case

## Provider Configuration Reference

### Environment Variables by Provider

| Provider        | Required Variables    | Optional Variables              |
| --------------- | --------------------- | ------------------------------- |
| **OpenAI**      | `OPENAI_API_KEY`      | -                               |
| **Anthropic**   | `ANTHROPIC_API_KEY`   | -                               |
| **Gemini**      | `GEMINI_API_KEY`      | -                               |
| **HuggingFace** | `HF_TOKEN`            | -                               |
| **Ollama**      | -                     | `OLLAMA_API_URL`                |
| **vLLM**        | -                     | `VLLM_BASE_URL`, `VLLM_API_KEY` |
| **Replicate**   | `REPLICATE_API_TOKEN` | -                               |
| **FAL**         | `FAL_API_KEY`         | -                               |
| **ElevenLabs**  | `ELEVENLABS_API_KEY`  | -                               |

### Getting API Keys

- **OpenAI:** https://platform.openai.com/api-keys
- **Anthropic:** https://console.anthropic.com/settings/keys
- **Google Gemini:** https://ai.google.dev/
- **HuggingFace:** https://huggingface.co/settings/tokens
- **Replicate:** https://replicate.com/account/api-tokens
- **FAL:** https://fal.ai/dashboard/keys
- **ElevenLabs:** https://elevenlabs.io/app/settings/api-keys

## Provider Development

To add a new provider:

1. **Create provider class** in `src/nodetool/providers/`

```python
from nodetool.providers.base import BaseProvider, register_provider
from nodetool.metadata.types import Provider as ProviderEnum

@register_provider(ProviderEnum.YourProvider)
class YourProvider(BaseProvider):
    def __init__(self, api_key: str = None):
        super().__init__()
        self.api_key = api_key or get_env_variable("YOUR_PROVIDER_API_KEY")

    async def generate_message(self, messages, model, **kwargs):
        # Implement message generation
        pass

    async def get_available_language_models(self):
        # Return list of available models
        return []
```

2. **Register in `__init__.py`**

```python
def import_providers():
    # ... existing imports
    from nodetool.providers import your_provider
```

3. **Add to Provider enum** in `nodetool/metadata/types.py`

1. **Add configuration** to `.env.example`

1. **Document** in this file

## Testing Providers

Test your provider implementation:

```bash
pytest tests/providers/test_your_provider.py -v
```

Example test structure:

```python
import pytest
from nodetool.providers import get_provider
from nodetool.metadata.types import Provider, Message

@pytest.mark.asyncio
async def test_generate_message():
    provider = get_provider(Provider.YourProvider)
    messages = [Message(role="user", content="Hello")]

    response = await provider.generate_message(
        messages=messages,
        model="your-model-id"
    )

    assert response.content
    assert response.role == "assistant"
```

## See Also

- [Chat API](chat-api.md) - WebSocket API for chat interactions and provider routing
- [Global Chat](global-chat.md) - UI reference for multi-turn chat threads
- [Agents](global-chat.md#agent-mode) - Using providers with the agent system
- [Workflow API](workflow-api.md) - Building workflows with providers
