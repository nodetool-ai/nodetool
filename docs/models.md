---
layout: page
title: "Supported Models"
---

NodeTool provides extensive support for AI models across multiple providers, from cutting-edge proprietary models to
open-source alternatives. This comprehensive guide covers all supported models and their capabilities.

All providers are accessible through generic nodes (TextToImage, Agent, RealtimeAgent, etc.).
Switching providers does not require editing the workflow structure.

## Provider Overview

NodeTool supports both cloud-based and local AI model providers:

### Cloud Providers

#### Recommended: HuggingFace Inference Providers

**HuggingFace Inference Providers** offer the widest model support through a unified API, giving you access to hundreds
of models across 17 specialized inference providers. This is the recommended choice for cloud-based inference when you
need maximum flexibility and model access.

**Why Choose HuggingFace Inference Providers:**

- **Widest Model Selection**: Access to thousands of models across all major AI tasks
- **17 Specialized Providers**: Cerebras, Cohere, Fal AI, Featherless AI, Fireworks, Groq, HF Inference, Hyperbolic,
  Nebius, Novita, Nscale, Public AI, Replicate, SambaNova, Scaleway, Together, and Z.ai
- **Zero Vendor Lock-in**: Switch between providers seamlessly through one API
- **OpenAI-Compatible**: Drop-in replacement for OpenAI SDK
- **Automatic Failover**: Requests route to alternative providers if primary is unavailable
- **Unified Billing**: Single token for all providers, no markup on provider rates
- **Production-Ready**: Enterprise-grade reliability and performance

**Supported Tasks:**

- Chat Completion (LLM & VLM)
- Feature Extraction (Embeddings)
- Text-to-Image Generation
- Text-to-Video Generation
- Speech-to-Text

**Provider Capabilities Matrix:**

| Provider       | LLM | VLM | Embeddings | Image Gen | Video Gen | Speech |
| -------------- | --- | --- | ---------- | --------- | --------- | ------ |
| Cerebras       | ✅  |     |            |           |           |        |
| Cohere         | ✅  | ✅  |            |           |           |        |
| Fal AI         |     |     |            | ✅        | ✅        | ✅     |
| Featherless AI | ✅  | ✅  |            |           |           |        |
| Fireworks      | ✅  | ✅  |            |           |           |        |
| Groq           | ✅  | ✅  |            |           |           |        |
| HF Inference   | ✅  | ✅  | ✅         | ✅        |           | ✅     |
| Hyperbolic     | ✅  | ✅  |            |           |           |        |
| Nebius         | ✅  | ✅  | ✅         | ✅        |           |        |
| Novita         | ✅  | ✅  |            |           | ✅        |        |
| Nscale         | ✅  | ✅  |            | ✅        |           |        |
| Public AI      | ✅  |     |            |           |           |        |
| Replicate      |     |     |            | ✅        | ✅        | ✅     |
| SambaNova      | ✅  |     | ✅         |           |           |        |
| Scaleway       | ✅  |     | ✅         |           |           |        |
| Together       | ✅  | ✅  |            | ✅        |           |        |
| Z.ai           | ✅  | ✅  |            |           |           |        |

**Key Features:**

- 🎯 **All-in-One API**: Single interface for text, image, video, embeddings, and speech tasks
- 🔀 **Multi-Provider Support**: Seamlessly switch between 17 top-tier providers
- 🚀 **Scalable & Reliable**: High availability and low-latency for production
- 🔧 **Developer-Friendly**: OpenAI-compatible API with Python and JavaScript SDKs
- 💰 **Cost-Effective**: Transparent pricing with no extra markup

**Example Usage:**

```python
from huggingface_hub import InferenceClient

client = InferenceClient()
completion = client.chat.completions.create(
    model="deepseek-ai/DeepSeek-V3-0324",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

For detailed documentation, visit [HuggingFace Inference Providers](https://huggingface.co/docs/inference-providers).

#### Direct Provider APIs

- **OpenAI**: Industry-leading language models with multimodal capabilities (GPT-5, GPT-4o, O3, Sora 2)
- **Anthropic**: Advanced reasoning models with strong safety features (Claude 4.5, Claude 4)
- **Google**: Multimodal models with excellent vision and reasoning capabilities (Gemini 2.5)

### Local Inference Engines

NodeTool provides comprehensive local model support with **1,655+ models** across multiple frameworks:

- **llama.cpp**: Highly optimized C/C++ inference with GGUF format support (300+ quantized models)
- **Ollama**: User-friendly local deployment with 23+ pre-configured models
- **vLLM**: Production-grade high-throughput inference engine (PyTorch Foundation project)
- **MLX Framework**: Apple Silicon-optimized inference (977+ models)
  - MLX-LM: Language model inference
  - MLX-VLM: Vision-language models with FastVLM
  - MFLUX: FLUX image generation for Apple Silicon
- **HuggingFace Transformers**: Access to 500,000+ models with pipeline API

**Local Benefits**: Complete privacy, zero API costs, offline functionality, and full customization.

## OpenAI Models

### GPT-5 Series

- **GPT-5** (`gpt-5`): Next-generation flagship model with 400K context window
- **GPT-5 Mini** (`gpt-5-mini`): Efficient variant of GPT-5

### GPT-4o Series

- **GPT-4o** (`gpt-4o`): Advanced multimodal model with vision capabilities
- **GPT-4o Mini** (`gpt-4o-mini`): Efficient version of GPT-4o for cost-effective tasks
- **ChatGPT-4o** (`chatgpt-4o-latest`): Conversational variant optimized for chat

### GPT-4o Audio Series

- **GPT-4o Audio** (`gpt-4o-audio-preview-2024-12-17`): Enhanced with audio processing
- **GPT-4o Mini Audio** (`gpt-4o-mini-audio-preview-2024-12-17`): Compact audio model

### GPT-4.1 Series

- **GPT-4.1** (`gpt-4.1`): Advanced reasoning model with 1M context window
- **GPT-4.1 Mini** (`gpt-4.1-mini`): Efficient version of GPT-4.1

### O-Series Reasoning Models

- **O3** (`o3`, `o3-mini`): Advanced reasoning models (no tool support)
- **O4 Mini** (`o4-mini`): Specialized reasoning model with 200K context

### Image Generation

- **GPT Image 1** (`gpt-image-1`): Latest image generation model
- **DALL-E 3** (`dall-e-3`): High-quality image generation (legacy)
- **DALL-E 2** (`dall-e-2`): Previous generation (legacy)

### Video Generation

- **Sora 2** (`sora-2`): Text and image-to-video generation
- **Sora 2 Pro** (`sora-2-pro`): Premium video generation with enhanced quality

### Specialized Models

- **Codex Mini** (`codex-mini-latest`): Code-focused model for programming tasks
- **Whisper** (`whisper-1`): Speech recognition and transcription

**Best for**: General-purpose tasks, coding, multimodal applications, audio processing, video generation

## Anthropic Models

### Claude 4.5 Series

- **Claude Sonnet 4.5** (`claude-sonnet-4-5-latest`, `claude-sonnet-4-5-20250929`): Latest next-generation model with
  enhanced reasoning
- **Claude Haiku 4.5** (`claude-4-5-haiku-latest`): Fast, efficient latest-generation model

### Claude 4 Series

- **Claude Sonnet 4** (`claude-sonnet-4-latest`, `claude-sonnet-4-20250514`): Next-generation reasoning model
- **Claude Opus 4** (`claude-opus-4-latest`, `claude-opus-4-20250514`): Premium model for the most complex tasks

### Claude 3.7 Series

- **Claude 3.7 Sonnet** (`claude-3-7-sonnet-latest`): Advanced reasoning capabilities

### Claude 3.5 Series

- **Claude 3.5 Haiku** (`claude-3-5-haiku-latest`): Fast, efficient model for everyday tasks
- **Claude 3.5 Sonnet** (`claude-3-5-sonnet-latest`): Balanced model for complex reasoning

**Best for**: Complex reasoning, analysis, safety-critical applications, long-form content, extended context tasks

## Google Gemini Models

### Gemini 2.5 Series

- **Gemini 2.5 Pro Experimental** (`gemini-2.5-pro-exp-03-25`): Cutting-edge experimental model
- **Gemini 2.5 Flash** (`gemini-2.5-flash-preview-04-17`): Fast, efficient multimodal model

### Gemini 2.0 Series

- **Gemini 2.0 Flash** (`gemini-2.0-flash`): Optimized for speed and efficiency
- **Gemini 2.0 Flash Lite** (`gemini-2.0-flash-lite`): Lightweight version for basic tasks
- **Gemini 2.0 Flash Exp Image Generation** (`gemini-2.0-flash-exp-image-generation`): Specialized for image generation

**Best for**: Multimodal tasks, vision processing, image generation, speed-critical applications

## Hugging Face Models

### Advanced Reasoning Models

- **DeepSeek V3 0324** (`deepseek-ai/DeepSeek-V3-0324`): Advanced reasoning and code generation
- **DeepSeek TNG R1T2 Chimera** (`tngtech/DeepSeek-TNG-R1T2-Chimera`): Hybrid reasoning model
- **DeepSeek R1** (`deepseek-ai/DeepSeek-R1`): Latest DeepSeek reasoning model
- **DeepSeek R1 Distill Qwen 1.5B** (`deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B`): Distilled efficient version

### Instruction-Tuned Models

- **Hunyuan A13B Instruct** (`tencent/Hunyuan-A13B-Instruct`): Tencent's instruction-tuned model
- **Meta Llama 3.1 8B Instruct** (`meta-llama/Meta-Llama-3.1-8B-Instruct`): Meta's powerful instruction model
- **Qwen 2.5 7B Instruct 1M** (`Qwen/Qwen2.5-7B-Instruct-1M`): Extended context length model

### Specialized Models

- **DeepSWE Preview** (`agentica-org/DeepSWE-Preview`): Specialized for software engineering tasks
- **Qwen 2.5 Coder 32B Instruct** (`Qwen/Qwen2.5-Coder-32B-Instruct`): Code-specialized model
- **Qwen 2.5 VL 7B Instruct** (`Qwen/Qwen2.5-VL-7B-Instruct`): Vision-language model

### Compact Models

- **SmolLM3 3B** (`HuggingFaceTB/SmolLM3-3B`): Compact, efficient language model
- **Gemma 2 2B IT** (`google/gemma-2-2b-it`): Google's efficient instruction-tuned model
- **Phi 4** (`microsoft/phi-4`): Microsoft's latest compact model

**Best for**: Open-source applications, specialized tasks, cost-effective deployment, research

## Hugging Face Groq Models

High-performance models optimized for speed through Groq's inference infrastructure:

### Meta Llama Series

- **Meta Llama 3 70B Instruct** (`meta-llama/Meta-Llama-3-70B-Instruct`): Large-scale instruction model
- **Llama 3.3 70B Instruct** (`meta-llama/Llama-3.3-70B-Instruct`): Enhanced version with improved capabilities
- **Llama Guard 4 12B** (`meta-llama/Llama-Guard-4-12B`): Safety and content moderation model

### Llama 4 Preview Series

- **Llama 4 Scout 17B 16E Instruct** (`meta-llama/Llama-4-Scout-17B-16E-Instruct`): Preview of next-generation Llama
- **Llama 4 Maverick 17B 128E Instruct** (`meta-llama/Llama-4-Maverick-17B-128E-Instruct`): Extended context Llama 4
  variant

**Best for**: High-throughput applications, real-time inference, production deployments

## Hugging Face Cerebras Models

Models optimized for Cerebras' specialized hardware:

- **Cerebras GPT 2.5 12B Instruct** (`cerebras/Cerebras-GPT-2.5-12B-Instruct`): Cerebras' proprietary model
- **Llama 3.3 70B Instruct** (`meta-llama/Llama-3.3-70B-Instruct`): Optimized for Cerebras hardware
- **Llama 4 Scout 17B 16E Instruct** (`meta-llama/Llama-4-Scout-17B-16E-Instruct`): Next-gen Llama on Cerebras

**Best for**: Ultra-fast inference, specialized hardware optimization, high-performance computing

______________________________________________________________________

## HuggingFace Inference Providers (Unified Multi-Provider Access)

**HuggingFace Inference Providers** is a unified proxy service that gives you access to hundreds of models across 17
specialized inference providers through a single API. This is the **recommended cloud solution** for NodeTool when you
need maximum flexibility and model access.

### Why Use Inference Providers?

**Zero Vendor Lock-in**: Instead of committing to a single provider's model catalog, access models from Cerebras, Groq,
Together AI, Replicate, SambaNova, Fireworks, and 11 more through one consistent interface.

**Instant Access to Cutting-Edge Models**: Go beyond mainstream providers to access thousands of specialized models
across multiple AI tasks - language models, image generators, embeddings, speech processing, and more.

**Production-Ready Performance**: Built for enterprise workloads with high availability, automatic failover, and
low-latency infrastructure.

**OpenAI-Compatible API**: Drop-in replacement for OpenAI SDK - migrate existing code with minimal changes while gaining
access to hundreds more models.

### Supported Providers & Capabilities

| Provider           | Chat (LLM) | Vision (VLM) | Embeddings | Image Gen | Video Gen | Speech |
| ------------------ | ---------- | ------------ | ---------- | --------- | --------- | ------ |
| **Cerebras**       | ✅         |              |            |           |           |        |
| **Cohere**         | ✅         | ✅           |            |           |           |        |
| **Fal AI**         |            |              |            | ✅        | ✅        | ✅     |
| **Featherless AI** | ✅         | ✅           |            |           |           |        |
| **Fireworks**      | ✅         | ✅           |            |           |           |        |
| **Groq**           | ✅         | ✅           |            |           |           |        |
| **HF Inference**   | ✅         | ✅           | ✅         | ✅        |           | ✅     |
| **Hyperbolic**     | ✅         | ✅           |            |           |           |        |
| **Nebius**         | ✅         | ✅           | ✅         | ✅        |           |        |
| **Novita**         | ✅         | ✅           |            |           | ✅        |        |
| **Nscale**         | ✅         | ✅           |            | ✅        |           |        |
| **Public AI**      | ✅         |              |            |           |           |        |
| **Replicate**      |            |              |            | ✅        | ✅        | ✅     |
| **SambaNova**      | ✅         |              | ✅         |           |           |        |
| **Scaleway**       | ✅         |              | ✅         |           |           |        |
| **Together**       | ✅         | ✅           |            | ✅        |           |        |
| **Z.ai**           | ✅         | ✅           |            |           |           |        |

### Key Features

- **🎯 All-in-One API**: Single interface for text generation, image generation, embeddings, NER, summarization, speech
  recognition, and 50+ more tasks
- **🔀 Multi-Provider Support**: Seamlessly run models from 17 top-tier providers without changing your code
- **🚀 Scalable & Reliable**: Built for high availability and low-latency performance in production
- **🔧 Developer-Friendly**: Simple requests, fast responses, consistent experience across Python and JavaScript
- **💰 Cost-Effective**: Transparent pricing with no markup on provider rates
- **🔄 Automatic Failover**: Requests automatically route to alternative providers if primary is unavailable
- **🔐 Unified Authentication**: Use a single HuggingFace token for all 17 providers

### Getting Started

**Python Example:**

```python
from huggingface_hub import InferenceClient

# Initialize client
client = InferenceClient()

# Chat completion
completion = client.chat.completions.create(
    model="deepseek-ai/DeepSeek-V3-0324",
    messages=[{"role": "user", "content": "Explain quantum computing"}]
)

# Image generation
image = client.text_to_image(
    prompt="A serene lake at sunset, photorealistic",
    model="black-forest-labs/FLUX.1-dev"
)
image.save("output.png")

# Embeddings
embedding = client.feature_extraction(
    text="NodeTool is an AI workflow platform",
    model="sentence-transformers/all-MiniLM-L6-v2"
)
```

**JavaScript Example:**

```javascript
import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient(process.env.HF_TOKEN);

// Chat completion
const completion = await client.chatCompletion({
  model: "meta-llama/Llama-3.1-8B-Instruct",
  messages: [{ role: "user", content: "Hello!" }],
});

// Automatic provider selection
const result = await client.chatCompletion({
  model: "meta-llama/Llama-3.1-8B-Instruct",
  provider: "auto", // Default: chooses best available provider
  messages: [{ role: "user", content: "Hello!" }],
});

// Explicit provider selection
const specific = await client.chatCompletion({
  model: "meta-llama/Llama-3.1-8B-Instruct",
  provider: "groq", // Force specific provider
  messages: [{ role: "user", content: "Hello!" }],
});
```

**OpenAI-Compatible (Drop-in Replacement):**

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://router.huggingface.co/v1",
    api_key=os.environ["HF_TOKEN"],
)

completion = client.chat.completions.create(
    model="meta-llama/Llama-3.1-8B-Instruct",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Provider Selection

- **Automatic (`provider="auto"`)**: System selects the first available provider based on your preference order
- **Explicit (`provider="groq"`)**: Force use of a specific provider for consistency
- **Server-Side (OpenAI endpoint)**: Router automatically chooses best available provider

### Use Cases

**What You Can Build:**

- **Chatbots & Assistants**: Access to latest LLMs with tool-calling support
- **Image & Video Generation**: FLUX, Stable Diffusion, and custom style generation with LoRAs
- **Search & RAG Systems**: State-of-the-art embeddings for semantic search and recommendations
- **Speech Processing**: Transcription, speech-to-text, and audio analysis
- **Traditional ML**: Classification, NER, summarization, and 50+ specialized tasks

### Pricing & Authentication

- **Generous Free Tier**: Start with free credits for testing and development
- **PRO Users**: Additional credits included with HuggingFace PRO subscription
- **Enterprise**: Custom pricing for high-volume workloads
- **No Markup**: Direct provider pricing with transparent billing
- **Single Token**: One HuggingFace token authenticates across all 17 providers

### Best For

- **Maximum Flexibility**: Need access to models from multiple providers
- **Avoiding Lock-in**: Don't want to commit to a single provider
- **Production Workloads**: Need reliability with automatic failover
- **Cost Optimization**: Compare pricing across providers easily
- **Rapid Development**: Test multiple models without integrating 17 different APIs

For complete documentation, visit [HuggingFace Inference Providers](https://huggingface.co/docs/inference-providers).

## Local Models

NodeTool provides extensive support for running models locally with complete privacy and no external API dependencies.
Multiple inference engines are supported, each optimized for different hardware and use cases.

### llama.cpp & GGUF Format

**llama.cpp** is a highly optimized C/C++ inference library that enables efficient LLM inference on CPU and GPU
hardware. It supports the GGUF (GGML Universal File) format, a binary format designed for fast loading and
memory-efficient storage.

**Key Features:**

- **Quantization Support**: 1.5-bit through 8-bit integer quantization for reduced memory usage
- **Advanced Methods**: AWQ scaling and importance matrix techniques for quality preservation
- **Cross-Platform**: Optimized kernels for x86, ARM CPUs, and various GPU backends
- **Memory Efficient**: Significantly reduced RAM requirements through quantization

**Models Available**: 300+ GGUF quantized models including Qwen, Llama, Gemma, DeepSeek, and GPT variants in multiple
quantization levels (Q2_K, Q3_K_S, Q4_K_M, Q5_K_M, Q8_0).

### Ollama

**Ollama** is an open-source platform that simplifies running LLMs locally with a simple CLI and REST API. Powered by
llama.cpp under the hood, Ollama makes model deployment as easy as `ollama run model-name`.

**Key Features:**

- **Easy Installation**: Single-command setup with automatic model management
- **Model Library**: Access to 23+ pre-configured models including Llama, Qwen, DeepSeek, Gemma
- **Performance**: Recent updates deliver up to 12x faster inference speeds
- **Streaming Support**: Real-time response streaming with tool call integration
- **Advanced Quantization**: Pioneering INT4 and INT2 quantization for 2025

**Popular Models**: `llama3.1:8b`, `qwen3:14b`, `deepseek-r1:7b`, `gemma3:4b`, `mistral-small:latest`

**Best for**: Quick experimentation, development workflows, and easy local deployment.

### vLLM

**vLLM** is a high-throughput, memory-efficient inference and serving engine designed for production LLM workloads. Now
a PyTorch Foundation project, vLLM delivers enterprise-grade performance.

**Key Features:**

- **PagedAttention**: Revolutionary memory management for efficient KV cache
- **Continuous Batching**: Dynamic batching for optimal GPU utilization
- **V1 Engine (2025)**: 1.7x speedup with enhanced multimodal support and zero-overhead prefix caching
- **Blackwell Optimization**: Up to 4x higher throughput on latest NVIDIA GPUs
- **Throughput**: Reports of 20-24× higher requests/second vs traditional serving

**Best for**: Production deployments, high-throughput applications, batch processing, and scalable inference.

### MLX Framework (Apple Silicon)

**MLX** is Apple's open-source machine learning framework specifically optimized for Apple Silicon's unified memory
architecture. Released by Apple ML Research, MLX enables efficient on-device AI.

**Core Components:**

#### MLX-LM (Language Models)

- **Optimized Inference**: Native Apple Silicon optimization for LLMs
- **Models**: Llama, Qwen, Mistral, and 977+ models with 4-bit/8-bit quantization
- **Python API**: NumPy-like interface with lazy computation
- **Performance**: Leverages unified memory for efficient model execution

#### MLX-VLM (Vision-Language Models)

- **Vision AI**: Multimodal models combining vision and language understanding
- **FastVLM (CVPR 2025)**: Apple's latest research with 85x faster TTFT
- **Pre-quantized**: Optimized models ready for Apple Silicon
- **iOS/macOS Support**: Run VLMs directly on devices

#### MFLUX (FLUX Image Generation)

- **Image Generation**: FLUX models ported to MLX for Apple Silicon
- **Performance**: Up to 25% faster than alternative implementations on M-series chips
- **Models**: FLUX.1-dev, FLUX.1-schnell with 4-bit quantization
- **Hardware Requirements**: M1/M2/M3/M4 with 24GB+ RAM recommended

**Best for**: Mac users with M-series chips, on-device inference, iOS/macOS applications, and privacy-focused
deployments.

### HuggingFace Transformers

**Transformers** is the de facto standard library for working with state-of-the-art ML models across text, vision,
audio, and multimodal tasks.

**Key Features:**

- **Pipeline API**: High-level interface for instant inference across all modalities
- **56+ Tasks**: Text generation, image classification, speech recognition, VQA, and more
- **Device Support**: Automatic GPU/Apple Silicon/CPU detection with `device_map="auto"`
- **Optimization**: FP16/BF16 precision, batch processing, and efficient memory management
- **Model Hub**: Access to 500,000+ pre-trained models

**Example Usage:**

```python
from transformers import pipeline
pipe = pipeline("text-generation", model="Qwen/Qwen2.5-7B", device_map="auto")
result = pipe("Once upon a time...")
```

**Best for**: Research, prototyping, fine-tuning, and accessing the latest models from HuggingFace Hub.

### Comparison Matrix

| Framework        | Throughput | Memory Efficiency | Ease of Use | Best Hardware | Use Case                       |
| ---------------- | ---------- | ----------------- | ----------- | ------------- | ------------------------------ |
| **llama.cpp**    | Medium     | Excellent         | Medium      | CPU, GPU      | Quantized models, edge devices |
| **Ollama**       | Medium     | Good              | Excellent   | CPU, GPU      | Development, quick testing     |
| **vLLM**         | Excellent  | Excellent         | Medium      | NVIDIA GPU    | Production, high-scale         |
| **MLX**          | Good       | Excellent         | Good        | Apple Silicon | Mac, iOS, privacy              |
| **Transformers** | Medium     | Good              | Excellent   | Any           | Research, flexibility          |

**Overall Benefits:**

- **Privacy**: Complete data privacy with no external API calls
- **Cost Control**: Zero inference costs after initial hardware investment
- **Customization**: Full control over model selection, parameters, and fine-tuning
- **Offline**: Works without internet connectivity
- **Low Latency**: No network round-trips for faster response times

Local models are stored inside the NodeTool workspace folder under `.nodetool/models/`.

## Model Capabilities

### Multimodal Support

- **Vision Models**: GPT-4o, GPT-5, Gemini 2.0/2.5, Qwen 2.5 VL
- **Audio Models**: GPT-4o Audio, GPT-4o Mini Audio, Whisper
- **Video Models**: Sora 2, Sora 2 Pro (text-to-video, image-to-video)
- **Text-to-Image**: GPT Image 1, DALL-E 3, Gemini 2.0 Flash Exp

### Specialized Capabilities

- **Code Generation**: Codex Mini, Qwen 2.5 Coder, DeepSWE Preview
- **Advanced Reasoning**: O3, Claude 4.5, GPT-4.1, DeepSeek R1
- **Long Context**: GPT-4.1 (1M), GPT-5 (400K), O4 Mini (200K)
- **Safety**: Llama Guard 4, Claude models with constitutional AI

### Performance Characteristics

- **Speed Optimized**: Groq models, Cerebras models, Flash variants, Claude Haiku 4.5
- **Efficiency**: Mini/Lite variants (GPT-5 Mini, GPT-4o Mini, Claude Haiku 4.5)
- **Quality**: Flagship models like GPT-5, Claude Sonnet 4.5, Claude Opus 4, Gemini 2.5 Pro

## Choosing the Right Model

### For Maximum Model Access (Recommended for Cloud)

- **HuggingFace Inference Providers**: Access to thousands of models across 17 providers with unified API
  - Best for: Flexibility, avoiding vendor lock-in, production workloads
  - Features: Automatic failover, OpenAI-compatible, all modalities (LLM, VLM, image, video, speech)
  - Providers: Cerebras, Groq, Together, Replicate, SambaNova, Fireworks, and 11 more

### For General Tasks

- **GPT-5**: Next-generation flagship with 400K context
- **Claude Sonnet 4.5**: Latest reasoning model with enhanced capabilities
- **GPT-4o**: Best overall performance and multimodal capabilities
- **Claude 3.5 Sonnet**: Excellent reasoning and safety features
- **Gemini 2.5 Flash**: Fast, efficient multimodal processing
- **Via HF Inference Providers**: Access to all above models plus hundreds more

### For Specialized Applications

- **Coding**: Codex Mini, Qwen 2.5 Coder, DeepSWE Preview
- **Reasoning**: O3, Claude 4.5, GPT-4.1, DeepSeek R1 (via HF Providers)
- **Vision**: GPT-4o, Gemini 2.0/2.5, Qwen 2.5 VL
- **Audio**: GPT-4o Audio variants, Whisper
- **Video**: Sora 2, Sora 2 Pro, or via Fal AI/Replicate/Novita (HF Providers)
- **Image Generation**: FLUX, Stable Diffusion via HF Inference Providers (Replicate, Together, Fal AI)

### For Cost-Effective Solutions

- **HuggingFace Inference Providers**: No markup, transparent pricing across providers
- **Hugging Face Models**: Open-source alternatives
- **Mini Variants**: GPT-5 Mini, GPT-4o Mini, Claude Haiku 4.5
- **Local Models**: Ollama, llama.cpp for zero API costs

### For High Performance

- **Via HF Providers**: Groq (ultra-fast LLM), Cerebras (specialized hardware), Fireworks (optimized)
- **Groq Models**: Ultra-fast inference
- **Cerebras Models**: Specialized hardware optimization
- **Flash Variants**: Speed-optimized models

### For Extended Context

- **GPT-4.1**: 1M tokens context window
- **GPT-5**: 400K tokens context window
- **O4 Mini**: 200K tokens context window
- **Claude 4.5**: Extended context capabilities

### For Privacy & Offline

- **Local Inference**: llama.cpp (300+ models), Ollama (23+ models), vLLM (production), MLX (Apple Silicon)
- **Complete Privacy**: No external API calls, all data stays local
- **Zero Costs**: One-time hardware investment, unlimited inference

## Configuration and Setup

### API Requirements

- **OpenAI**: OpenAI API key
- **Anthropic**: Anthropic API key
- **Google**: Google AI API key
- **Hugging Face**: Hugging Face API token

### Local Setup

- **Ollama**: Download and install Ollama
- **Hardware**: Sufficient RAM and optional GPU for local models
- **Storage**: Adequate disk space for model files

### Usage Considerations

- **Rate Limits**: Different providers have different rate limits
- **Costs**: Pricing varies significantly between providers and models
- **Availability**: Some models may have limited availability or regions
- **Context Length**: Models have different maximum context windows

This comprehensive model support makes NodeTool one of the most flexible AI platforms available, allowing you to choose
the perfect model for your specific needs while maintaining the ability to experiment with cutting-edge options as they
become available.

______________________________________________________________________

## Complete Model Reference

NodeTool supports **1,655+ models** across multiple categories. Below is a comprehensive reference organized by model
type and capability.

### Language Models (LLMs)

#### Ollama Models (23 models)

Local models served through Ollama with full privacy and offline support:

- `all-minilm:latest` - Lightweight embedding model
- `deepseek-r1:1.5b`, `deepseek-r1:7b`, `deepseek-r1:14b` - DeepSeek reasoning models
- `gemma3:270m`, `gemma3:1b`, `gemma3:4b`, `gemma3n:latest` - Google Gemma models
- `gpt-oss:20b` - Open-source GPT variant
- `granite3.1-moe:1b`, `granite3.1-moe:3b` - IBM Granite MoE models
- `llama3.1:8b`, `llama3.2:3b` - Meta Llama models
- `mistral-small:latest` - Mistral AI model
- `nomic-embed-text:latest` - Nomic embedding model
- `phi3.5:latest` - Microsoft Phi model
- `qwen2.5-coder:3b`, `qwen2.5-coder:7b` - Qwen coding models
- `qwen3:0.6b`, `qwen3:1.7b`, `qwen3:4b`, `qwen3:8b`, `qwen3:14b` - Qwen 3 series

#### HuggingFace Text Generation (56 models)

Production-ready text generation models from HuggingFace:

**Small Efficient Models:**

- `Qwen/Qwen3-0.6B-MLX-4bit` - Ultra-compact Qwen model
- `gpt2` - Classic GPT-2 baseline
- `distilgpt2` - Distilled GPT-2
- `Qwen/Qwen2-0.5B-Instruct` - Tiny instruction model
- `bigcode/starcoder` - Code-specialized model

**Mid-Size Models:**

- `mlx-community/Llama-3.2-1B-Instruct-4bit` - Compact Llama
- `mlx-community/Llama-3.2-3B-Instruct-4bit` - Balanced Llama
- `Qwen/Qwen3-4B-MLX-4bit` - Mid-range Qwen

**Large Models:**

- `unsloth/Qwen3-14B-GGUF` - Full Qwen 14B
- `ggml-org/Qwen2.5-Coder-0.5B-Q8_0-GGUF` - Quantized coder model

#### GGUF Quantized Models (300+ models)

Efficient quantized models via llama.cpp with various quantization levels (Q2_K, Q3_K_S, Q4_K_M, Q5_K_M, Q8_0):

**Featured Models:**

- `ggml-org/gemma-3-1b-it-GGUF` - Gemma instruction-tuned
- `ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF` - Vision-language reasoning
- `unsloth/Qwen3-30B-A3B-GGUF` - Large Qwen model
- `unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF` - Large coding model
- `unsloth/gpt-oss-20b-GGUF` - 20B open GPT
- `unsloth/gpt-oss-120b-GGUF` - 120B flagship model
- `unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF` - DeepSeek R1 distill
- `unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF` - Larger DeepSeek distill
- `unsloth/Phi-4-reasoning-plus-GGUF` - Microsoft Phi-4 with reasoning
- `unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF` - Mistral 24B
- `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF` - Latest Qwen 30B
- `unsloth/gemma-3-4b-it-GGUF`, `unsloth/gemma-3-12b-it-GGUF` - Gemma variants
- `unsloth/Magistral-Small-2509-GGUF` - Magistral model
- `unsloth/GLM-4.5-Air-GGUF` - GLM model family
- `unsloth/Qwen2.5-VL-7B-Instruct-GGUF` - Vision-language Qwen

#### MLX Models (977 models)

Apple Silicon optimized models using MLX framework for M-series chips:

**Text Generation:**

- `mlx-community/Llama-3.1-8B-Instruct-4bit`
- `mlx-community/Qwen2.5-7B-Instruct-4bit`
- `mlx-community/Mistral-7B-Instruct-v0.2-4bit`

**Vision-Language:**

- `mlx-community/llava-1.5-7b-4bit`
- `mlx-community/Qwen2-VL-2B-Instruct-4bit`

**Audio:**

- `mlx-community/whisper-tiny-mlx`, `mlx-community/whisper-tiny.en-mlx`
- `mlx-community/whisper-base-mlx`, `mlx-community/whisper-base.en-mlx`
- `mlx-community/whisper-small-mlx`, `mlx-community/whisper-small.en-mlx`
- `mlx-community/whisper-medium-mlx`, `mlx-community/whisper-medium.en-mlx`
- `mlx-community/whisper-large-v3-mlx`

**Text-to-Speech:**

- `mlx-community/Kokoro-82M-bf16`, `mlx-community/Kokoro-82M-4bit`, `mlx-community/Kokoro-82M-6bit`,
  `mlx-community/Kokoro-82M-8bit`
- `mlx-community/Spark-TTS-0.5B-8bit`, `mlx-community/Spark-TTS-0.5B-bf16`
- `mlx-community/csm-1b-8bit`, `mlx-community/csm-1b`

______________________________________________________________________

### Image Generation Models

#### FLUX Models (20 models)

State-of-the-art image generation from Black Forest Labs:

**Base Models:**

- `black-forest-labs/FLUX.1-dev` - Main development model
- `black-forest-labs/FLUX.1-schnell` - Fast generation variant

**Specialized FLUX:**

- `black-forest-labs/FLUX.1-Fill-dev` - Inpainting model
- `black-forest-labs/FLUX.1-Canny-dev` - Canny edge conditioning
- `black-forest-labs/FLUX.1-Depth-dev` - Depth-based generation
- `black-forest-labs/FLUX.1-Redux-dev` - Image variation
- `black-forest-labs/FLUX.1-Kontext-dev` - Context-aware generation
- `Freepik/flux.1-lite-8B-alpha` - Lightweight variant

**Quantized FLUX (GGUF):**

- `city96/FLUX.1-dev-gguf:flux1-dev-Q2_K.gguf` through `Q5_K_S.gguf` - Various quantization levels
- `city96/FLUX.1-schnell-gguf:flux1-schnell-Q2_K.gguf` through `Q5_K_S.gguf`

**MLX-Optimized FLUX:**

- `dhairyashil/FLUX.1-dev-mflux-4bit`
- `dhairyashil/FLUX.1-schnell-mflux-v0.6.2-4bit`
- `filipstrand/FLUX.1-Krea-dev-mflux-4bit`
- `akx/FLUX.1-Kontext-dev-mflux-4bit`

**Alternative FLUX:**

- `Kwai-Kolors/Kolors-diffusers` - Kolors variant
- `lodestones/Chroma` - Chroma FLUX variant

**ControlNet FLUX:**

- `InstantX/FLUX.1-dev-Controlnet-Canny` - Canny edge control
- `jasperai/Flux.1-dev-Controlnet-Upscaler` - Upscaling control

#### Stable Diffusion 1.5 (20 models)

Classic Stable Diffusion models and fine-tunes:

**Base & Popular Models:**

- `stable-diffusion-v1-5/stable-diffusion-v1-5` - Original SD 1.5
- `SG161222/Realistic_Vision_V5.1_noVAE` - Photorealistic variant
- `Lykon/DreamShaper` - DreamShaper series
- `Lykon/dreamshaper-8` - Version 8

**Specialized SD 1.5:**

- `XpucT/Deliberate:Deliberate_v6.safetensors` - Deliberate model
- `Lykon/AbsoluteReality:AbsoluteReality_1.8.1_pruned.safetensors` - Photorealistic
- `gsdf/Counterfeit-V2.5:Counterfeit-V2.5_fp16.safetensors` - Anime style
- `philz1337x/epicrealism:epicrealism_naturalSinRC1VAE.safetensors` - Epic realism
- `digiplay/majicMIX_realistic_v7:majicmixRealistic_v7.safetensors` - MajicMIX
- `526christian/526mix-v1.5` - 526Mix
- `imagepipeline/epiC-PhotoGasm` - PhotoGasm variant

**Community Models:**

- `stablediffusionapi/realistic-vision-v51` - API-ready realistic
- `stablediffusionapi/anything-v5` - Anime variant
- `Yntec/Deliberate2` - Deliberate v2
- `guoyww/animatediff-motion-adapter-v1-5-2` - Animation adapter

#### Stable Diffusion XL (9 models)

High-resolution SDXL models:

**Base Models:**

- `stabilityai/stable-diffusion-xl-base-1.0:sd_xl_base_1.0.safetensors`
- `stabilityai/stable-diffusion-xl-refiner-1.0:sd_xl_refiner_1.0.safetensors`

**Optimized SDXL:**

- `stabilityai/sdxl-turbo:sd_xl_turbo_1.0_fp16.safetensors` - Fast generation
- `Lykon/dreamshaper-xl-turbo:DreamShaperXL_Turbo_v2_1.safetensors` - DreamShaper turbo
- `Lykon/dreamshaper-xl-lightning:DreamShaperXL_Lightning.safetensors` - Lightning fast

**Specialized SDXL:**

- `RunDiffusion/Juggernaut-XL-v9:Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors` - Photorealistic
- `playgroundai/playground-v2.5-1024px-aesthetic:playground-v2.5-1024px-aesthetic.fp16.safetensors`
- `dataautogpt3/ProteusV0.5:proteusV0.5.safetensors` - Proteus
- `Lykon/AAM_XL_AnimeMix:AAM_XL_Anime_Mix.safetensors` - Anime style

#### Qwen Image Models (9 models)

Text-to-image generation from Qwen:

**Base Model:**

- `Qwen/Qwen-Image` - Main model
- `Qwen/Qwen-Image-Edit` - Image editing variant

**GGUF Quantized (various levels):**

- `city96/Qwen-Image-gguf:qwen-image-Q2_K.gguf`
- `city96/Qwen-Image-gguf:qwen-image-Q3_K_S.gguf`
- `city96/Qwen-Image-gguf:qwen-image-Q4_K_S.gguf`
- `city96/Qwen-Image-gguf:qwen-image-Q5_K_S.gguf`
- `city96/Qwen-Image-gguf:qwen-image-Q6_K.gguf`
- `city96/Qwen-Image-gguf:qwen-image-Q8_0.gguf`
- `city96/Qwen-Image-gguf:qwen-image-BF16.gguf`

**Lightning Variant:**

- `lightx2v/Qwen-Image-Lightning:Qwen-Image-Lightning-8steps-V1.1.safetensors`

#### OmniGen

- `Shitao/OmniGen-v1-diffusers` - Unified image generation model

______________________________________________________________________

### Vision & Multimodal Models

#### Vision-Language Models (7 models)

Image understanding and captioning:

- `mlx-community/llava-1.5-7b-4bit` - LLaVA multimodal
- `mlx-community/Qwen2-VL-2B-Instruct-4bit` - Qwen vision-language
- `ucaslcl/GOT-OCR2_0` - OCR model
- `HuggingFaceTB/SmolVLM-Instruct` - Compact VLM
- `zai-org/GLM-4.5V` - GLM vision model
- `Qwen/Qwen2.5-VL-3B-Instruct` - Qwen 2.5 VL
- `llava-hf/llava-interleave-qwen-0.5b-hf` - Interleaved LLaVA

#### Image-to-Text / Captioning (7 models)

Image understanding and description:

- `Salesforce/blip-image-captioning-base` - BLIP base
- `Salesforce/blip-image-captioning-large` - BLIP large
- `Salesforce/blip2-opt-2.7b` - BLIP-2 with OPT
- `Salesforce/blip-vqa-base` - Visual question answering
- `nlpconnect/vit-gpt2-image-captioning` - ViT-GPT2
- `microsoft/git-base` - GIT base
- `microsoft/git-base-coco` - GIT COCO-trained
- `microsoft/trocr-small-printed` - OCR for printed text

#### Object Detection (7 models)

Object localization and recognition:

- `facebook/detr-resnet-50` - DETR with ResNet-50
- `facebook/detr-resnet-101` - DETR with ResNet-101
- `hustvl/yolos-tiny` - Tiny YOLO-S
- `hustvl/yolos-small` - Small YOLO-S
- `valentinafeve/yolos-fashionpedia` - Fashion-specialized

**Zero-Shot Object Detection (6 models):**

- `google/owlvit-base-patch32` - OWL-ViT base-32
- `google/owlvit-base-patch16` - OWL-ViT base-16
- `google/owlvit-large-patch14` - OWL-ViT large
- `google/owlv2-base-patch16` - OWL-ViT v2
- `google/owlv2-base-patch16-ensemble` - OWL-ViT v2 ensemble
- `IDEA-Research/grounding-dino-tiny` - Grounding DINO

#### Image Classification (9 models)

Image categorization and recognition:

- `timm/resnet50.a1_in1k` - ResNet-50 ImageNet
- `microsoft/resnet-18` - ResNet-18
- `microsoft/resnet-50` - ResNet-50
- `google/vit-base-patch16-224` - Vision Transformer
- `apple/mobilevit-small` - MobileViT small
- `apple/mobilevit-xx-small` - MobileViT xx-small
- `nateraw/vit-age-classifier` - Age classification
- `Falconsai/nsfw_image_detection` - NSFW detection
- `rizvandwiki/gender-classification-2` - Gender classification

**Zero-Shot Image Classification (4 models):**

- `openai/clip-vit-base-patch32` - CLIP base-32
- `openai/clip-vit-base-patch16` - CLIP base-16
- `laion/CLIP-ViT-H-14-laion2B-s32B-b79K` - Large CLIP
- `laion/CLIP-ViT-g-14-laion2B-s12B-b42K` - Giant CLIP

#### Image Segmentation (2 models)

Pixel-level segmentation:

- `mattmdjaga/segformer_b2_clothes` - Clothing segmentation
- `facebook/sam2-hiera-large` - Segment Anything 2
- `nvidia/segformer-b3-finetuned-ade-512-512` - ADE20K segmentation

#### Depth Estimation (5 models)

Monocular depth prediction:

- `depth-anything/Depth-Anything-V2-Small-hf`
- `depth-anything/Depth-Anything-V2-Base-hf`
- `depth-anything/Depth-Anything-V2-Large-hf`
- `LiheYoung/depth-anything-base-hf`
- `Intel/dpt-large` - Dense Prediction Transformer

______________________________________________________________________

### Audio Models

#### Text-to-Speech (7 models)

Speech synthesis:

- `suno/bark` - Bark TTS (multilingual)
- `suno/bark-small` - Compact Bark
- `hexgrad/Kokoro-82M` - Kokoro TTS
- `prince-canuma/Kokoro-82M` - Kokoro variant
- `facebook/mms-tts-eng` - English MMS
- `facebook/mms-tts-fra` - French MMS
- `facebook/mms-tts-deu` - German MMS
- `facebook/mms-tts-kor` - Korean MMS

#### Text-to-Audio / Music Generation (11 models)

Music and sound generation:

- `facebook/musicgen-small` - MusicGen small
- `facebook/musicgen-medium` - MusicGen medium
- `facebook/musicgen-large` - MusicGen large
- `facebook/musicgen-melody` - MusicGen with melody
- `facebook/musicgen-stereo-small` - Stereo small
- `facebook/musicgen-stereo-large` - Stereo large
- `cvssp/audioldm-s-full-v2` - AudioLDM
- `cvssp/audioldm2` - AudioLDM 2
- `harmonai/maestro-150k` - Maestro
- `ucsd-reach/musicldm` - MusicLDM
- `stabilityai/stable-audio-open-1.0` - Stable Audio

#### Automatic Speech Recognition (6 models)

Speech-to-text transcription:

- `openai/whisper-small` - Whisper small
- `openai/whisper-medium` - Whisper medium
- `openai/whisper-large-v2` - Whisper large v2
- `openai/whisper-large-v3` - Whisper large v3
- `openai/whisper-large-v3-turbo` - Whisper turbo
- `Systran/faster-whisper-large-v3` - Optimized Whisper
- `ggerganov/whisper.cpp` - Whisper C++ implementation

#### Audio Classification (2 models)

Audio understanding:

- `MIT/ast-finetuned-audioset-10-10-0.4593` - Audio Spectrogram Transformer
- `ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition` - Emotion recognition
- `laion/clap-htsat-unfused` - CLAP audio-text

______________________________________________________________________

### Video Models

#### Text-to-Video (9 models)

Video generation from text:

- `THUDM/CogVideoX-2b` - CogVideo 2B
- `THUDM/CogVideoX-5b` - CogVideo 5B
- `Wan-AI/Wan2.1-T2V-14B-Diffusers` - Wan 2.1 T2V
- `Wan-AI/Wan2.2-T2V-A14B-Diffusers` - Wan 2.2 T2V
- `Wan-AI/Wan2.2-TI2V-5B-Diffusers` - Wan 2.2 TI2V

#### Image-to-Video Models

- `stabilityai/stable-video-diffusion-img2vid-xt` - Stable Video Diffusion
- `Wan-AI/Wan2.1-I2V-14B-480P-Diffusers` - Wan I2V 480P
- `Wan-AI/Wan2.1-I2V-14B-720P-Diffusers` - Wan I2V 720P
- `Wan-AI/Wan2.2-I2V-A14B-Diffusers` - Wan 2.2 I2V

______________________________________________________________________

### LoRA Models (60+ models)

Style adapters for Stable Diffusion:

**Character Styles:**

- `danbrown/loras:lucy_cyberpunk.safetensors`
- `danbrown/loras:aqua_konosuba.safetensors`
- `danbrown/loras:paimon_genshinimpact.safetensors`
- `danbrown/loras:princesszelda.safetensors`
- `danbrown/loras:jacksparrow.safetensors`
- `danbrown/loras:gigachad.safetensors`
- `danbrown/loras:harold.safetensors`
- `danbrown/loras:pepefrog.safetensors`

**Art Styles:**

- `danbrown/loras:ghibli_scenery.safetensors`
- `danbrown/loras:arcane_style.safetensors`
- `danbrown/loras:persona5_style.safetensors`
- `danbrown/loras:onepiece_style.safetensors`
- `danbrown/loras:myheroacademia_style.safetensors`
- `danbrown/loras:akiratoriyama_style.safetensors`
- `danbrown/loras:jimlee_style.safetensors`
- `danbrown/loras:wlop_style.safetensors`
- `danbrown/loras:discoelysium_style.safetensors`
- `danbrown/loras:sokolov_style.safetensors`
- `danbrown/loras:peanutscomics_style.safetensors`

**Visual Effects:**

- `danbrown/loras:fire_vfx.safetensors`
- `danbrown/loras:lightning_vfx.safetensors`
- `danbrown/loras:water_vfx.safetensors`
- `danbrown/loras:flamingeye.safetensors`

**Specialized:**

- `danbrown/loras:2d_sprite.safetensors` - 2D sprites
- `danbrown/loras:pixhell.safetensors` - Pixel art
- `danbrown/loras:add_detail.safetensors` - Detail enhancement
- `danbrown/loras:animeoutlineV4.safetensors` - Anime outlines
- `danbrown/loras:thickeranimelines.safetensors` - Thick anime lines
- `danbrown/loras:cyberpunk_tarot.safetensors` - Tarot style
- `danbrown/loras:gacha_splash.safetensors` - Gacha game art
- `danbrown/loras:sxz_game_assets.safetensors` - Game assets
- `danbrown/loras:twitch_emotes.safetensors` - Twitch emotes
- `danbrown/loras:3Danaglyph.safetensors` - 3D effect

**SDXL LoRAs (7 models):**

- `CiroN2022/toy-face:toy_face_sdxl.safetensors` - Toy face style
- `nerijs/pixel-art-xl:pixel-art-xl.safetensors` - Pixel art
- `goofyai/3d_render_style_xl:3d_render_style_xl.safetensors` - 3D render
- `artificialguybr/CuteCartoonRedmond-V2:CuteCartoonRedmond-CuteCartoon-CuteCartoonAF.safetensors` - Cute cartoon
- `blink7630/graphic-novel-illustration:Graphic_Novel_Illustration-000007.safetensors` - Graphic novel
- `robert123231/coloringbookgenerator:ColoringBookRedmond-ColoringBook-ColoringBookAF.safetensors` - Coloring book
- `Linaqruf/anime-detailer-xl-lora:anime-detailer-xl-lora.safetensors` - Anime detail

______________________________________________________________________

### Specialized Components

#### ControlNet Models (7+ models)

Conditional image generation:

**SD 1.5 ControlNets:**

- `lllyasviel/control_v11p_sd15_canny:diffusion_pytorch_model.fp16.safetensors` - Canny edges
- `lllyasviel/control_v11p_sd15_inpaint:diffusion_pytorch_model.fp16.safetensors` - Inpainting
- `lllyasviel/control_v11p_sd15_mlsd:diffusion_pytorch_model.fp16.safetensors` - Line detection
- `lllyasviel/control_v11p_sd15_lineart:diffusion_pytorch_model.fp16.safetensors` - Line art
- `lllyasviel/control_v11p_sd15_scribble:diffusion_pytorch_model.fp16.safetensors` - Scribbles
- `lllyasviel/control_v11p_sd15_openpose:diffusion_pytorch_model.fp16.safetensors` - OpenPose

#### IP-Adapter Models (6 models)

Image prompt adapters:

**SD 1.5 IP-Adapters:**

- `h94/IP-Adapter:models/ip-adapter_sd15.bin`
- `h94/IP-Adapter:models/ip-adapter_sd15_light.bin`
- `h94/IP-Adapter:models/ip-adapter_sd15_vit-G.bin`

**SDXL IP-Adapters:**

- `h94/IP-Adapter:sdxl_models/ip-adapter_sdxl.bin`
- `h94/IP-Adapter:sdxl_models/ip-adapter_sdxl_vit-h.bin`
- `h94/IP-Adapter:sdxl_models/ip-adapter-plus_sdxl_vit-h.bin`

#### VAE Models (4 models)

Variational autoencoders for SD:

- `stabilityai/sd-vae-ft-mse` - SD 1.5 VAE
- `stabilityai/sd-vae-ft-ema` - SD 1.5 VAE EMA
- `stabilityai/sdxl-vae` - SDXL VAE
- `madebyollin/sdxl-vae-fp16-fix` - SDXL VAE FP16

#### Upscaler Models (5+ models)

Image super-resolution:

- `ai-forever/Real-ESRGAN:RealESRGAN_x2.pth` - 2x upscale
- `ai-forever/Real-ESRGAN:RealESRGAN_x4.pth` - 4x upscale
- `ai-forever/Real-ESRGAN:RealESRGAN_x8.pth` - 8x upscale
- `ximso/RealESRGAN_x4plus_anime_6B:RealESRGAN_x4plus_anime_6B.pth` - Anime 4x
- `stabilityai/stable-diffusion-x4-upscaler` - SD upscaler
- `stabilityai/sd-x2-latent-upscaler` - Latent upscaler
- `caidas/swin2SR-classical-sr-x2-64` - Swin2SR 2x
- `caidas/swin2SR-classical-sr-x4-64` - Swin2SR 4x
- `caidas/swin2SR-lightweight-x2-64` - Lightweight 2x
- `caidas/swin2SR-compressed-sr-x4-48` - Compressed 4x
- `caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr` - Real-world 4x

______________________________________________________________________

### NLP & Text Models

#### Text Classification (2 models)

Sentiment and classification:

- `cardiffnlp/twitter-roberta-base-sentiment-latest` - Sentiment analysis
- `michellejieli/emotion_text_classifier` - Emotion classification

#### Zero-Shot Classification (7 models)

Flexible text classification:

- `facebook/bart-large-mnli` - BART MNLI
- `MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli` - DeBERTa NLI
- `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` - Multilingual DeBERTa
- `tasksource/ModernBERT-base-nli` - ModernBERT
- `cross-encoder/nli-deberta-v3-base` - Cross-encoder
- `microsoft/deberta-v2-xlarge-mnli` - DeBERTa XL
- `roberta-large-mnli` - RoBERTa MNLI

#### Question Answering (4 models)

Extractive QA:

- `distilbert-base-cased-distilled-squad` - DistilBERT SQuAD
- `distilbert-base-uncased-distilled-squad` - DistilBERT uncased
- `bert-large-uncased-whole-word-masking-finetuned-squad` - BERT large
- `deepset/roberta-base-squad2` - RoBERTa SQuAD 2.0

#### Table Question Answering (3 models)

Structured data QA:

- `google/tapas-base-finetuned-wtq` - TAPAS base
- `google/tapas-large-finetuned-wtq` - TAPAS large
- `microsoft/tapex-large-finetuned-tabfact` - TAPEX large

#### Fill Mask / MLM (5 models)

Masked language modeling:

- `bert-base-uncased` - BERT base uncased
- `bert-base-cased` - BERT base cased
- `roberta-base` - RoBERTa base
- `distilbert-base-uncased` - DistilBERT
- `albert-base-v2` - ALBERT v2

#### Text Generation / Summarization (4 models)

Text transformation:

- `Falconsai/text_summarization` - General summarization
- `Falconsai/medical_summarization` - Medical text
- `imvladikon/het5_summarization` - HE-T5 summarization

#### Text2Text Generation (4 models)

Sequence-to-sequence:

- `google-t5/t5-small` - T5 small
- `google-t5/t5-base` - T5 base
- `google-t5/t5-large` - T5 large
- `google/flan-t5-small`, `google/flan-t5-base`, `google/flan-t5-large` - FLAN-T5 variants

#### Translation (3 models)

Language translation models

#### Sentence Similarity / Embeddings (4 models)

Semantic embeddings:

- `sentence-transformers/all-MiniLM-L6-v2` - All-MiniLM
- `sentence-transformers/all-mpnet-base-v2` - All-MPNet
- `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` - Multilingual
- `mixedbread-ai/mxbai-embed-large-v1` - MixedBread embedding
- `BAAI/bge-base-en-v1.5`, `BAAI/bge-large-en-v1.5` - BGE embeddings
- `BAAI/bge-m3` - BGE-M3

#### Reranking (3 models)

Search result reranking:

- `BAAI/bge-reranker-base` - BGE reranker base
- `BAAI/bge-reranker-large` - BGE reranker large
- `BAAI/bge-reranker-v2-m3` - BGE reranker v2

#### Feature Extraction (3 models)

Dense retrieval:

- `facebook/contriever` - Contriever
- `gokaygokay/Flux-Prompt-Enhance` - Prompt enhancement

______________________________________________________________________

## Model Type Summary

| Category             | Count | Use Cases                         |
| -------------------- | ----- | --------------------------------- |
| MLX Models           | 977   | Apple Silicon optimized inference |
| GGUF/llama.cpp       | 300+  | Quantized efficient LLMs          |
| HuggingFace Text Gen | 56    | General text generation           |
| LoRA Adapters        | 60+   | Style transfer for SD models      |
| Ollama Models        | 23    | Local privacy-first LLMs          |
| FLUX Models          | 20    | State-of-the-art image generation |
| Stable Diffusion     | 20    | Classic image generation          |
| Various Specialized  | 200+  | Audio, vision, NLP tasks          |

**Total: 1,655+ models** across all categories
