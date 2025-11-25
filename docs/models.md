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

### Local Inference Engines

NodeTool provides comprehensive local model support with **1,655+ models** across multiple frameworks:

- **llama.cpp**: Highly optimized C/C++ inference with GGUF format support (300+ quantized models)
- **Ollama**: User-friendly local deployment with 23+ pre-configured models
- **vLLM**: Production-grade high-throughput inference engine (PyTorch Foundation project)
- **MLX Framework**: Apple Silicon-optimized inference (977+ models)
  - MLX-LM: Language model inference
  - MLX-VLM: Vision-language models with FastVLM
  - MFLUX: FLUX image generation for Apple Silicon
- **Nunchaku**: High-performance 4-bit diffusion engine for NVIDIA GPUs
- **HuggingFace Transformers**: Access to 500,000+ models with pipeline API

**Local Benefits**: Complete privacy, zero API costs, offline functionality, and full customization.

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

### Nunchaku (NVIDIA GPU)

**Nunchaku** is a high-performance inference engine specifically designed for 4-bit diffusion models. It implements SVDQuant, a post-training quantization technique that maintains visual fidelity while significantly reducing memory usage.

**Key Features:**

- **SVDQuant**: Absorbs outliers by low-rank components for accurate 4-bit quantization
- **High Performance**: 3x faster than NF4 W4A16 baselines on NVIDIA GPUs
- **Memory Efficient**: 3.6x memory reduction compared to BF16 models
- **Hardware Support**: Optimized for NVIDIA RTX 3090/4090 and data center GPUs

**Best for**: Running large diffusion models (like FLUX.1) on consumer NVIDIA GPUs with high speed and low memory footprint.

### HuggingFace Transformers

**Transformers** is the de facto standard library for working with state-of-the-art ML models across text, vision,
audio, and multimodal tasks.

**Key Features:**

- **Pipeline API**: High-level interface for instant inference across all modalities
- **56+ Tasks**: Text generation, image classification, speech recognition, VQA, and more
- **Device Support**: Automatic GPU/Apple Silicon/CPU detection with `device_map="auto"`
- **Optimization**: FP16/BF16 precision, batch processing, and efficient memory management
- **Model Hub**: Access to 500,000+ pre-trained models

**Best for**: Research, prototyping, fine-tuning, and accessing the latest models from HuggingFace Hub.

### Comparison Matrix

| Framework        | Throughput | Memory Efficiency | Ease of Use | Best Hardware | Use Case                       |
| ---------------- | ---------- | ----------------- | ----------- | ------------- | ------------------------------ |
| **llama.cpp**    | Medium     | Excellent         | Medium      | CPU, GPU      | Quantized models, edge devices |
| **Ollama**       | Medium     | Good              | Excellent   | CPU, GPU      | Development, quick testing     |
| **vLLM**         | Excellent  | Excellent         | Medium      | NVIDIA GPU    | Production, high-scale         |
| **MLX**          | Good       | Excellent         | Good        | Apple Silicon | Mac, iOS, privacy              |
| **Nunchaku**     | Excellent  | Excellent         | Medium      | NVIDIA GPU    | High-performance Diffusion     |
| **Transformers** | Medium     | Good              | Excellent   | Any           | Research, flexibility          |

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

For detailed documentation, visit [HuggingFace Inference Providers](https://huggingface.co/docs/inference-providers).

#### Direct Provider APIs

- **OpenAI**: Industry-leading language models with multimodal capabilities (GPT-5, GPT-4o, O3, Sora 2)
- **Anthropic**: Advanced reasoning models with strong safety features (Claude 4.5, Claude 4)
- **Google**: Multimodal models with excellent vision and reasoning capabilities (Gemini 2.5)

______________________________________________________________________

## Supported Model Types

NodeTool supports a wide range of model types across different domains. Below is an overview of the supported types and their available execution variants.

### Variants Key

- **Full Precision**: Standard execution using HuggingFace Transformers/Diffusers (supports CUDA, MPS, CPU).
- **MLX**: Optimized execution for Apple Silicon (M-series chips).
- **Nunchaku**: High-performance 4-bit quantization for NVIDIA GPUs.

### Image Generation

| Model Type | Description | Variants |
| :--- | :--- | :--- |
| **Flux** | State-of-the-art text-to-image generation | ✅ Full Precision<br>✅ MLX<br>✅ Nunchaku |
| **Flux Fill** | Inpainting/Outpainting for Flux | ✅ Full Precision<br>✅ MLX |
| **Flux Depth** | Depth-guided generation | ✅ Full Precision<br>✅ MLX |
| **Flux Redux** | Image variation and mixing | ✅ Full Precision<br>✅ MLX |
| **Flux Kontext** | Context-aware generation | ✅ Full Precision<br>✅ MLX |
| **Stable Diffusion XL** | SDXL base and refiner models | ✅ Full Precision<br>✅ Nunchaku |
| **Stable Diffusion 3** | Latest Stable Diffusion architecture | ✅ Full Precision |
| **Stable Diffusion** | SD 1.5, 2.1, and variants | ✅ Full Precision |
| **Qwen Image** | Qwen-based text-to-image | ✅ Full Precision<br>✅ MLX<br>✅ Nunchaku |
| **Qwen Image Edit** | Instruction-based image editing | ✅ Full Precision<br>✅ MLX |
| **ControlNet** | Structural guidance (Canny, Depth, etc.) | ✅ Full Precision<br>✅ MLX (Flux) |
| **Text to Image** | Generic text-to-image models | ✅ Full Precision |
| **Image to Image** | Image transformation models | ✅ Full Precision |
| **Inpainting** | Mask-based image editing | ✅ Full Precision |

### Vision & Video

| Model Type | Description | Variants |
| :--- | :--- | :--- |
| **Image Text to Text** | Vision-Language Models (VLM) | ✅ Full Precision<br>✅ MLX (Qwen2-VL) |
| **Visual QA** | Visual Question Answering | ✅ Full Precision |
| **Document QA** | Document understanding and QA | ✅ Full Precision |
| **OCR** | Optical Character Recognition (GOT-OCR, etc.) | ✅ Full Precision |
| **Depth Estimation** | Monocular depth estimation | ✅ Full Precision |
| **Image Classification** | Categorize images | ✅ Full Precision |
| **Object Detection** | Detect objects in images | ✅ Full Precision |
| **Image Segmentation** | Pixel-level segmentation | ✅ Full Precision |
| **Zero-Shot Detection** | Open-vocabulary detection | ✅ Full Precision |
| **Mask Generation** | Segment Anything (SAM) variants | ✅ Full Precision |
| **Video Classification** | Categorize video content | ✅ Full Precision |
| **Text to Video** | Generate video from text | ✅ Full Precision |
| **Image to Video** | Animate images | ✅ Full Precision |
| **Text to 3D** | Generate 3D assets from text | ✅ Full Precision |
| **Image to 3D** | Generate 3D assets from images | ✅ Full Precision |

### Natural Language Processing

| Model Type | Description | Variants |
| :--- | :--- | :--- |
| **Text Generation** | LLMs (Llama, Qwen, Mistral, etc.) | ✅ Full Precision<br>✅ MLX |
| **Text to Text** | T5, BART, and seq2seq models | ✅ Full Precision |
| **Summarization** | Text summarization | ✅ Full Precision |
| **Translation** | Machine translation | ✅ Full Precision |
| **Question Answering** | Extractive QA | ✅ Full Precision |
| **Text Classification** | Sentiment analysis, etc. | ✅ Full Precision |
| **Token Classification** | NER, POS tagging | ✅ Full Precision |
| **Zero-Shot Class.** | Open-vocabulary classification | ✅ Full Precision |
| **Sentence Similarity** | Semantic similarity / Embeddings | ✅ Full Precision |
| **Reranker** | Search result reranking | ✅ Full Precision |
| **Feature Extraction** | General embeddings | ✅ Full Precision |
| **Fill Mask** | BERT-style masked modeling | ✅ Full Precision |

### Audio

| Model Type | Description | Variants |
| :--- | :--- | :--- |
| **Text to Speech** | Generate speech from text | ✅ Full Precision<br>✅ MLX |
| **Speech Recognition** | ASR (Whisper, etc.) | ✅ Full Precision<br>✅ MLX |
| **Audio Classification** | Categorize audio events | ✅ Full Precision |
| **Voice Activity** | VAD (Silero, etc.) | ✅ Full Precision |
| **Audio to Audio** | Voice conversion, enhancement | ✅ Full Precision |

### Components & Adapters

| Model Type | Description | Variants |
| :--- | :--- | :--- |
| **LoRA** | Low-Rank Adaptation weights | ✅ Full Precision (SD, SDXL, Qwen) |
| **IP Adapter** | Image Prompt Adapters | ✅ Full Precision |
| **VAE** | Variational Autoencoders | ✅ Full Precision |
| **CLIP** | Text/Image Encoders | ✅ Full Precision |
| **T5 Encoder** | Text Encoders for diffusion | ✅ Full Precision |
| **RealESRGAN** | Image Upscaling | ✅ Full Precision |
