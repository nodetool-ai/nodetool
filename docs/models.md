---
layout: page
title: "Local Models"
description: "The engines that run models on your own computer (Ollama, llama.cpp, Transformers.js, MLX, Hugging Face, Wan2GP) and the kinds of models you can run with them."
---

Local models run on your computer with no key and no per-use cost. Download them in the [Models Manager](models-manager.md). Cloud models are covered in [Models & Providers](models-and-providers.md), and the key for each cloud provider is in [Providers](providers.md).

> **Runs:** on your computer, offline once downloaded. **Needs:** no key. Disk space for each model, and ideally a GPU or an Apple Silicon Mac. The engine table below lists what each one needs.
{: .callout-note}

## Where to start

Open the logo menu, choose **Model Manager**, and use **Get Started**. It detects your hardware, lists the engines that work on it, and suggests models that fit. Downloads show under **Downloads** in the logo menu. Engines that run as a separate program (Ollama, vLLM, LM Studio, llama.cpp `llama-server`) are connected in **Settings → Integrations → Local Model Servers**, as described in [Providers](providers.md#ollama).

## Local inference engines

### Ollama

**Ollama** downloads and runs chat and embedding models by name. It is a separate program: install it from [ollama.com](https://ollama.com) and keep it running. NodeTool does not ship or start it. NodeTool connects to `http://127.0.0.1:11434` unless you set another address. Models you pull with Ollama appear in NodeTool, and the Model Manager lists them.

### llama.cpp and GGUF

**llama.cpp** runs GGUF model files on CPU or GPU. GGUF files are often quantized, which means the model's numbers are stored at lower precision so the file is smaller and needs less memory. NodeTool reaches llama.cpp two ways. The **llama.cpp** provider talks to a `llama-server` you run yourself. The **llama.cpp local** provider runs GGUF files inside NodeTool, so there is no server to manage. Install it from the Package Manager.

### Transformers.js

**Transformers.js** runs small models for embeddings, speech, classification, and text generation inside NodeTool. It works on any platform and needs no Python. Install it as a runtime from the Package Manager. See [HuggingFace Integration](huggingface.md#transformersjs-nodes-local-no-key).

### MLX Framework (Apple Silicon)

**MLX** is Apple's machine learning framework for Apple Silicon Macs. It runs through the Python worker and needs the optional MLX pack. In the desktop app, install **MLX** from **Tools → Package Manager → Python nodes**, which sets up Python first if it is missing. The Package Manager offers the pack only on Apple Silicon Macs running macOS 14 or newer.

MLX runs language models such as Llama, Qwen, and Mistral, vision-language models, FLUX image models, speech, and transcription.

### Hugging Face Transformers and Diffusers

**Transformers** and **Diffusers** are the Python libraries behind the optional `nodetool-huggingface` pack, which you install from the Package Manager. They run Hub models on a GPU, Apple Silicon, or CPU. See [HuggingFace Integration](huggingface.md) and [GPU requirements](advanced-install.md#gpu-requirements).

### Wan2GP

**Wan2GP** runs Wan, LTX-2, MiniMax H3 and other video, image, and speech models in its own server. Install it from the Package Manager, or run your own. No model loads inside NodeTool itself. See [Wan2GP](wan2gp.md).

### Comparison

| Engine | Model files | Best hardware | Use |
| --- | --- | --- | --- |
| **Ollama** | GGUF | CPU or GPU | Simplest way to run local chat models |
| **llama.cpp** | GGUF | CPU or GPU | Compressed models, older or small machines |
| **Transformers.js** | Small downloadable models | Any | Small models with no Python |
| **MLX** | MLX | Apple Silicon | Mac-native models |
| **Transformers and Diffusers** | Safetensors, PyTorch | GPU, Apple Silicon, or CPU | Widest model choice |
| **Wan2GP** | Its own downloads | GPU | Local video generation |

## What you can run locally

| Task | Examples | Engines |
| --- | --- | --- |
| Chat | Llama, Qwen, Mistral, Gemma, DeepSeek, GPT-OSS | Ollama, llama.cpp, MLX, Transformers |
| Image | FLUX (including Fill, Depth, Redux, Kontext), Stable Diffusion 1.5, SDXL and 3, Qwen Image and Image Edit, ControlNet guidance, inpainting | Transformers and Diffusers, MLX for FLUX and Qwen Image |
| Video | Text to video and image to video models, 3D asset generation | Transformers and Diffusers, Wan2GP |
| Audio and speech | Text to speech, speech recognition such as Whisper, audio classification, voice conversion | Transformers.js, Transformers, MLX |
| Search and embeddings | Text embeddings, rerankers for search results | Ollama, llama.cpp local, Transformers.js, Transformers |
| Vision | Vision-language chat, document and visual question answering, OCR, depth estimation, object detection, segmentation, image classification | Transformers, MLX |
| Text tasks | Summarization, translation, question answering, sentiment and other classification | Transformers, Transformers.js |

Image models can also load add-on files such as LoRAs (small style or subject add-ons) and upscalers such as RealESRGAN. The Models Manager lists them under their own categories.

## If it fails

- **Model not downloaded:** download it in the [Models Manager](models-manager.md) first.
- **Out of memory:** pick a smaller or more compressed model, or a cloud model from [Models & Providers](models-and-providers.md).
- **Engine not found:** start Ollama or your `llama-server`, then check the address in **Settings → Integrations → Local Model Servers**.
