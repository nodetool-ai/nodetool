# Providers

The NodeTool provider system offers a unified interface for interacting with various AI service providers. This
abstraction allows you to seamlessly switch between different AI backends (OpenAI, Anthropic, Gemini, HuggingFace, etc.)
without changing your workflow logic.

## Overview

Providers in NodeTool act as adapters that translate between NodeTool's internal formats and the specific API
requirements of different AI services. The system supports multiple modalities:

- **Language Models (LLMs)** - Text generation and chat completions
- **Image Generation** - Text-to-image and image-to-image creation
- **Video Generation** - Text-to-video and image-to-video synthesis
- **Text-to-Speech (TTS)** - Convert text to natural speech audio
- **Automatic Speech Recognition (ASR)** - Transcribe audio to text

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

**Capabilities:** Diverse model ecosystem, Multiple hosted services

**Features:**

- Supports multiple sub-providers (FAL.ai, Together, Replicate, etc.)
- Text-to-image generation
- Image-to-image transformation

### Video Generation Providers

Providers like Gemini support video generation capabilities through the unified interface:

## Generic Nodes: Provider-Agnostic Workflows

One of the most powerful features of the NodeTool provider system is **generic nodes**. These are special nodes that let
you switch AI providers without modifying your workflow.

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

- Google Gemini (Veo)
- HuggingFace models
- Future video providers

#### nodetool.video.ImageToVideo

**Purpose:** Animate static images into videos

**Quick Switch:**

- Google Gemini (Veo)
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

Generic nodes intelligently map parameters to provider-specific formats:

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

- [Chat Providers](chat-providers.md) - Detailed chat-specific provider information
- [Chat API](chat-api.md) - WebSocket API for chat interactions
- [Agents](agents.md) - Using providers with the agent system
- [Workflow API](workflow-api.md) - Building workflows with providers
