---
layout: page
title: "Supported Models"
---

NodeTool provides extensive support for AI models across multiple providers, from cutting-edge proprietary models to
open-source alternatives. This comprehensive guide covers all supported models and their capabilities.

All providers are accessible through generic nodes (TextToImage, Agent, RealtimeAgent, etc.).
Switching providers does not require editing the workflow structure.

## Local Inference Engines

NodeTool provides comprehensive local model support with **1,655+ models** across multiple frameworks.

For provider-based local inference (Ollama, vLLM), please refer to the [Providers documentation](providers.md).

### llama.cpp & GGUF Format

**llama.cpp** is a highly optimized C/C++ inference library that enables efficient LLM inference on CPU and GPU hardware using the GGUF format. It supports 1.5-bit through 8-bit integer quantization for significantly reduced memory usage.

**Models**: Supports 300+ GGUF quantized models including Qwen, Llama, Gemma, DeepSeek, and GPT variants.

### MLX Framework (Apple Silicon)

**MLX** is Apple's open-source machine learning framework specifically optimized for Apple Silicon's unified memory architecture. It enables efficient on-device AI for Mac users.

**Capabilities**:

- **LLMs**: Native optimization for Llama, Qwen, Mistral, and others.
- **Vision**: Multimodal models and FastVLM support.
- **Image Gen**: FLUX models ported to MLX for faster generation.

### Nunchaku (NVIDIA GPU)

**Nunchaku** is a high-performance inference engine specifically designed for 4-bit diffusion models on NVIDIA GPUs. It implements SVDQuant to maintain visual fidelity while reducing memory usage by 3.6x compared to BF16 models. It is ideal for running large diffusion models (like FLUX.1) on consumer NVIDIA GPUs.

### HuggingFace Transformers

**Transformers** is the standard library for working with state-of-the-art ML models across text, vision, audio, and multimodal tasks. It provides access to the HuggingFace Hub with over 500,000 pre-trained models and supports automatic device detection (GPU/Apple Silicon/CPU).

### Comparison Matrix

| Framework        | Throughput | Memory Efficiency | Ease of Use | Best Hardware | Use Case                       |
| ---------------- | ---------- | ----------------- | ----------- | ------------- | ------------------------------ |
| **llama.cpp**    | Medium     | Excellent         | Medium      | CPU, GPU      | Quantized models, edge devices |
| **MLX**          | Good       | Excellent         | Good        | Apple Silicon | Mac, iOS, privacy              |
| **Nunchaku**     | Excellent  | Excellent         | Medium      | NVIDIA GPU    | High-performance Diffusion     |
| **Transformers** | Medium     | Good              | Excellent   | Any           | Research, flexibility          |

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
