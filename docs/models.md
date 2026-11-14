---
layout: page
title: "Supported Models"
description: "Local inference engines (Ollama, llama.cpp, Transformers.js, MLX, Transformers, Wan2GP), supported model types, and cloud video, image, and audio models."
---

Provider setup is in [Providers](providers.md), the download panel is in [Models Manager](models-manager.md), and the local-versus-cloud overview is in [Models & Providers](models-and-providers.md).

> **Runs:** local engines need no key. Cloud models need the provider key listed in [Providers](providers.md). **Hardware:** per engine, see the comparison matrix below.
{: .callout-note}

## Local inference engines

The engines below run on your machine. The Model Manager's **Get Started** tab lists them with the formats each one loads and matches model suggestions to your hardware. For engines that run as a separate server (Ollama, vLLM, LM Studio, llama.cpp `llama-server`), see the [Providers documentation](providers.md).

### Ollama

**Ollama** pulls and runs GGUF chat and embedding models by name. It is a separate program: download it from [ollama.com](https://ollama.com) and keep it running. NodeTool does not ship or start it. NodeTool connects to `http://127.0.0.1:11434`, or to the `OLLAMA_API_URL` setting. Pulled models appear in NodeTool, and the Model Manager lists them under the `llama_model` type.

### llama.cpp & GGUF Format

**llama.cpp** is a C/C++ inference library for LLMs on CPU and GPU using the GGUF format. It supports 1.5-bit through 8-bit integer quantization for lower memory use. NodeTool reaches it two ways. The `llama.cpp` provider talks to a `llama-server` you run. The `llama.cpp local` provider (`node-llama-cpp`) runs GGUF files inside the NodeTool backend, with no server. Install it as a runtime from the Package Manager.

### Transformers.js

**Transformers.js** runs small ONNX models (embeddings, speech, classification, text generation) in-process through ONNX Runtime. It works on any platform with no Python. Install it as a runtime from the Package Manager. See [HuggingFace Integration](huggingface.md#transformersjs-nodes-local-onnx).

### MLX Framework (Apple Silicon)

**MLX** is Apple's machine learning framework for Apple Silicon. It runs through the Python worker and needs the optional MLX pack: in the desktop app, install **MLX** from **Tools → Package Manager → Python nodes**, which sets up Python first if it is missing. The Package Manager offers the pack only on Apple Silicon Macs, and it needs macOS 14 or newer.

**Capabilities**:

- **LLMs**: Native optimization for Llama, Qwen, Mistral, and others.
- **Vision**: Multimodal models and FastVLM support.
- **Image Gen**: FLUX models ported to MLX for faster generation.

### HuggingFace Transformers

**Transformers** and **Diffusers** are the Python libraries behind the optional `nodetool-huggingface` node pack, which you install from the Package Manager. They run Hub models locally on GPU, Apple Silicon, or CPU on PyTorch 2.14. See [HuggingFace Integration](huggingface.md) and [GPU requirements](installation.md#gpu-requirements).

### Wan2GP

**Wan2GP** runs Wan, LTX-2, MiniMax H3 and other models in its own server. Install it from the Package Manager, or run your own. The built-in `lib.wan2gp` nodes and the `wangp` provider call it over MCP, so no model loads inside NodeTool. See [Wan2GP](wan2gp.md).

### Comparison Matrix

| Framework        | Formats                  | Best Hardware | Use Case                       |
| ---------------- | ------------------------ | ------------- | ------------------------------ |
| **Ollama**       | GGUF                     | CPU, GPU      | Simplest local chat models     |
| **llama.cpp**    | GGUF                     | CPU, GPU      | Quantized models, edge devices |
| **Transformers.js** | ONNX                  | Any           | Small models, no Python        |
| **MLX**          | MLX                      | Apple Silicon | Mac on-device models           |
| **Transformers / Diffusers** | Safetensors, PyTorch | Any   | Research, flexibility          |

______________________________________________________________________

## Supported Model Types

### Variants Key

- **Full Precision**: Standard execution using HuggingFace Transformers/Diffusers (supports CUDA, MPS, CPU).
- **MLX**: Optimized execution for Apple Silicon (M-series chips).

### Image Generation

| Model Type | Description | Variants |
| :--- | :--- | :--- |
| **Flux** | Text-to-image generation | ✅ Full Precision<br>✅ MLX |
| **Flux Fill** | Inpainting/Outpainting for Flux | ✅ Full Precision<br>✅ MLX |
| **Flux Depth** | Depth-guided generation | ✅ Full Precision<br>✅ MLX |
| **Flux Redux** | Image variation and mixing | ✅ Full Precision<br>✅ MLX |
| **Flux Kontext** | Context-aware generation | ✅ Full Precision<br>✅ MLX |
| **Stable Diffusion XL** | SDXL base and refiner models | ✅ Full Precision |
| **Stable Diffusion 3** | Latest Stable Diffusion architecture | ✅ Full Precision |
| **Stable Diffusion** | SD 1.5, 2.1, and variants | ✅ Full Precision |
| **Qwen Image** | Qwen-based text-to-image | ✅ Full Precision<br>✅ MLX |
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

______________________________________________________________________

## Cloud Models

Cloud models run through provider integrations and need that provider's key.

### Video Generation (Cloud)

| Model | Provider | Key Features | Resolution | Max Duration |
| :--- | :--- | :--- | :--- | :--- |
| **Sora 2 Pro** | OpenAI | Native audio | 1080p | 15s |
| **Veo 3.1** | Google | Multi-image refs, synced audio | 1080p | Extended |
| **Seedance 2.0** | ByteDance | Stable characters | 1080p | Variable |
| **Runway Gen-3 Alpha** | Runway | Motion control | 1080p | Variable |
| **Runway Aleph** | Runway | | 1080p | Variable |
| **Luma** | Luma AI | Video editing | 1080p | Variable |
| **Grok Imagine** | xAI | T2V/I2V | 1080p | Short clips |
| **Wan 2.6** | Alibaba | Multi-shot, stable characters | 1080p | Variable |
| **Hailuo 2.3** | MiniMax | Expressive characters | 1080p+ | Variable |
| **Kling 3.0** | Kling | Synced speech and effects | 1080p | Variable |

**Access via**: `nodetool.video.TextToVideo`, `nodetool.video.ImageToVideo` nodes

### Image Generation (Cloud)

| Model | Provider | Key Features |
| :--- | :--- | :--- |
| **FLUX.2 Pro** | Black Forest Labs | Multi-reference consistency, accurate text |
| **Nano Banana 2.0** | Google | 2K native, 4K scaling |
| **GPT Image 2** | OpenAI | Generation and instruction-based editing |
| **Ideogram V3** | Ideogram | Typography, style control |
| **Z-Image Turbo** | Z-AI | Fast generation |
| **Seedream 4.5** | ByteDance | Generation and instruction-based editing |

**Access via**: `nodetool.image.TextToImage` node

### Music & Audio Generation (Cloud)

| Model | Provider | Key Features |
| :--- | :--- | :--- |
| **Suno** | Suno | Songs from text, extend/cover/remix, instrumental |
| **ElevenLabs V3 Dialogue** | ElevenLabs | Multi-speaker dialogue |
| **ElevenLabs TTS Turbo 2.5** | ElevenLabs | Text-to-speech |
| **ElevenLabs Sound Effect** | ElevenLabs | Sound effects and ambient audio from text |

**Access via**: `nodetool.audio.TextToSpeech` for speech. ElevenLabs has its own provider and `elevenlabs.*` nodes. Suno runs through the kie.ai nodes.

### Cloud limits

Cloud models bill per generation at the provider's price, need internet, process content on the provider's servers, and are subject to the provider's rate limits. A 429 surfaces as failure kind `rate_limit`. See [If it fails](providers.md#if-it-fails).

### Where the cloud models come from

Most models above are offered by more than one provider. The generic nodes list what your configured providers serve, so open the node's model dropdown to see your options. The aggregators ([kie.ai](https://kie.ai/), FAL, Replicate, AtlasCloud, Evolink, OpenRouter) carry many of these families under one key, at prices that differ from the upstream provider.

For provider configuration and the capability matrix, see the [Providers Guide](providers.md).
