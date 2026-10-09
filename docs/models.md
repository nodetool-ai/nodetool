---
layout: page
title: "Supported Models"
description: "Every model NodeTool runs — local engines (llama.cpp, MLX, GGUF) and cloud providers. Generic nodes work across all of them, so swapping a model never changes the graph."
---

> **The model catalog.** For how to connect a provider, see [Providers](providers.md). For the desktop app's download panel, see [Models Manager](models-manager.md). New here? Start with [Models & Providers](models-and-providers.md).

NodeTool runs models from many providers, proprietary and open. Generic nodes (TextToImage, Agent, and others) work across providers, so swapping a model doesn't change the graph.

## Local inference engines

The engines below run on your machine. The Model Manager's **Get Started** tab lists them with the formats each one loads and matches model suggestions to your hardware. For engines that run as a separate server (Ollama, vLLM, LM Studio, llama.cpp `llama-server`), see the [Providers documentation](providers.md).

### Ollama

**Ollama** pulls and runs GGUF chat and embedding models by name. It is a separate program: download it from [ollama.com](https://ollama.com) and keep it running. NodeTool does not ship or start it. NodeTool connects to `http://127.0.0.1:11434`, or to the `OLLAMA_API_URL` setting. Models you pull appear in NodeTool automatically, and the Model Manager lists them under the `llama_model` type.

### llama.cpp & GGUF Format

**llama.cpp** is a C/C++ inference library for LLMs on CPU and GPU using the GGUF format. It supports 1.5-bit through 8-bit integer quantization for lower memory use. NodeTool reaches it two ways. The `llama.cpp` provider talks to a `llama-server` you run. The `llama.cpp local` provider (`node-llama-cpp`) runs GGUF files inside the NodeTool backend, with no server. Install it as a runtime from the Package Manager.

### Transformers.js

**Transformers.js** runs small ONNX models (embeddings, speech, classification, text generation) in-process through ONNX Runtime. It works on any platform with no Python. Install it as a runtime from the Package Manager. See [HuggingFace Integration](huggingface.md#transformersjs-nodes-local-onnx).

### MLX Framework (Apple Silicon)

**MLX** is Apple's open-source machine learning framework, optimized for Apple Silicon's unified memory. It runs through the Python worker and needs the optional MLX pack: in the desktop app, install **MLX** from **Tools → Package Manager → Python packs**, which sets up Python first if it is missing. The Package Manager offers the pack only on Apple Silicon Macs, and it needs macOS 14 or newer.

**Capabilities**:

- **LLMs**: Native optimization for Llama, Qwen, Mistral, and others.
- **Vision**: Multimodal models and FastVLM support.
- **Image Gen**: FLUX models ported to MLX for faster generation.

### Nunchaku (NVIDIA GPU)

**Nunchaku** is an inference engine for 4-bit diffusion models on NVIDIA GPUs. It implements SVDQuant to keep visual fidelity while cutting memory use compared to BF16 models, which makes large diffusion models such as FLUX.1 practical on consumer NVIDIA GPUs. The HuggingFace pack's Nunchaku variants of Flux, SDXL, and Qwen Image use it.

Nothing installs Nunchaku for you, and the Package Manager does not list it. Install it by hand into NodeTool's Python environment:

1. Find the torch version in that environment: `python -c "import torch; print(torch.__version__)"`. The suffix, such as `+cu130`, is the CUDA build.
2. From [the Nunchaku releases](https://github.com/nunchaku-ai/nunchaku/releases), pick the wheel whose name matches that torch version, CUDA build, Python version (`cp311` for 3.11), and platform.
3. Run `pip install <wheel URL>` with that environment's Python.

The PyPI package named `nunchaku` is an unrelated project. Do not install it. Each Nunchaku wheel is built against one torch release, so a torch update needs a matching wheel. Until the releases include one for the installed torch, Nunchaku variants fail with `The SVDQuant nunchaku runtime is required`, and the full-precision variants still work.

### HuggingFace Transformers

**Transformers** and **Diffusers** are the Python libraries behind the optional `nodetool-huggingface` node pack, which you install from the Package Manager. They run Hub models locally on GPU, Apple Silicon, or CPU on PyTorch 2.14. See [HuggingFace Integration](huggingface.md) and [GPU requirements](installation.md#gpu-requirements).

### Wan2GP

**Wan2GP** runs Wan video models in a server you start yourself. The optional Wan2GP pack calls it over MCP, so no model loads inside NodeTool. See [Wan2GP](wan2gp.md).

### Comparison Matrix

| Framework        | Formats                  | Best Hardware | Use Case                       |
| ---------------- | ------------------------ | ------------- | ------------------------------ |
| **Ollama**       | GGUF                     | CPU, GPU      | Simplest local chat models     |
| **llama.cpp**    | GGUF                     | CPU, GPU      | Quantized models, edge devices |
| **Transformers.js** | ONNX                  | Any           | Small models, no Python        |
| **MLX**          | MLX                      | Apple Silicon | Mac on-device models           |
| **Nunchaku**     | 4-bit diffusion weights  | NVIDIA GPU    | Large diffusion models (manual install) |
| **Transformers / Diffusers** | Safetensors, PyTorch | Any   | Research, flexibility          |

______________________________________________________________________

## Supported Model Types

NodeTool supports a wide range of model types across different domains. Below is an overview of the supported types and their available execution variants.

### Variants Key

- **Full Precision**: Standard execution using HuggingFace Transformers/Diffusers (supports CUDA, MPS, CPU).
- **MLX**: Optimized execution for Apple Silicon (M-series chips).
- **Nunchaku**: 4-bit quantized weights for NVIDIA GPUs. Needs the [manual install](#nunchaku-nvidia-gpu).

### Image Generation

| Model Type | Description | Variants |
| :--- | :--- | :--- |
| **Flux** | Text-to-image generation | ✅ Full Precision<br>✅ MLX<br>✅ Nunchaku |
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

______________________________________________________________________

## Cloud Models

In addition to local models, NodeTool provides access to cloud-based models through provider integrations. These models offer the latest capabilities in video, image, and audio generation.

### Video Generation (Cloud)

| Model | Provider | Key Features | Resolution | Max Duration |
| :--- | :--- | :--- | :--- | :--- |
| **Sora 2 Pro** | OpenAI | Realistic motion, refined physics, native audio | 1080p | 15s |
| **Veo 3.1** | Google | Realistic motion, multi-image refs, synced audio | 1080p | Extended |
| **Seedance 2.0** | ByteDance | High-quality cinematic video, stable characters | 1080p | Variable |
| **Runway Gen-3 Alpha** | Runway | Precise motion control, professional fidelity | 1080p | Variable |
| **Runway Aleph** | Runway | Next-gen Runway video generation | 1080p | Variable |
| **Luma** | Luma AI | AI-powered video modification and editing | 1080p | Variable |
| **Grok Imagine** | xAI | Multimodal T2V/I2V with coherent motion | 1080p | Short clips |
| **Wan 2.6** | Alibaba | Multi-shot, stable characters, affordable | 1080p | Variable |
| **Hailuo 2.3** | MiniMax | Expressive characters, complex lighting | 1080p+ | Variable |
| **Kling 3.0** | Kling | Synced speech & effects, audio-visual coherence | 1080p | Variable |

**Access via**: `nodetool.video.TextToVideo`, `nodetool.video.ImageToVideo` nodes

### Image Generation (Cloud)

| Model | Provider | Key Features | Output Quality |
| :--- | :--- | :--- | :--- |
| **FLUX.2 Pro** | Black Forest Labs | Photoreal, multi-reference consistency, accurate text | High |
| **Nano Banana 2.0** | Google | 2K native, 4K scaling, enhanced text & characters | Very High |
| **GPT Image 2** | OpenAI | Photorealistic generation and instruction-based editing | High |
| **Ideogram V3** | Ideogram | Exceptional typography, artistic style control | High |
| **Z-Image Turbo** | Z-AI | Fast generation with strong prompt adherence | High |
| **Seedream 4.5** | ByteDance | High-fidelity generation and instruction-based editing | High |

**Access via**: `nodetool.image.TextToImage` node

### Music & Audio Generation (Cloud)

| Model | Provider | Key Features |
| :--- | :--- | :--- |
| **Suno** | Suno | Full song creation from text, extend/cover/remix, instrumental support |
| **ElevenLabs V3 Dialogue** | ElevenLabs | Multi-speaker dialogue with emotional control |
| **ElevenLabs TTS Turbo 2.5** | ElevenLabs | Ultra-fast, natural text-to-speech |
| **ElevenLabs Sound Effect** | ElevenLabs | Generate sound effects and ambient audio from text |

**Access via**: `nodetool.audio.TextToSpeech` for speech. ElevenLabs has its own provider and `elevenlabs.*` nodes. Suno runs through the kie.ai nodes.

### Advantages of Cloud Models

- **Latest Technology**: Access to newest architectures and training data
- **No Local Resources**: Run on any hardware without GPU requirements
- **Instant Availability**: No download or installation needed
- **Continuous Updates**: Models improve without local updates

### Considerations

- **API Costs**: Per-generation pricing varies by provider
- **Internet Required**: Cannot run offline
- **Data Privacy**: Content is processed on provider servers
- **Rate Limits**: Subject to provider API quotas

### Where the cloud models come from

Most models above are offered by more than one provider, and the set changes as providers add models. The generic nodes list what your configured providers serve, so open the node's model dropdown to see your options. The aggregators ([kie.ai](https://kie.ai/), FAL, Replicate, AtlasCloud, Evolink, OpenRouter) carry many of these families under one key. Prices differ between an aggregator and the upstream provider, so compare them before committing to a large run.

For provider configuration and the capability matrix, see the [Providers Guide](providers.md).
