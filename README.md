![Logo](logo.png)

![Release](https://github.com/nodetool-ai/nodetool/actions/workflows/release.yaml/badge.svg)
[![Lint and Test](https://github.com/nodetool-ai/nodetool/actions/workflows/test.yml/badge.svg)](https://github.com/nodetool-ai/nodetool/actions/workflows/test.yml)
![CodeQL](https://github.com/nodetool-ai/nodetool/actions/workflows/github-code-scanning/codeql/badge.svg)

[![Stars](https://img.shields.io/github/stars/nodetool-ai/nodetool?style=social)](https://github.com/nodetool-ai/nodetool/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nodetool-ai/nodetool/total?color=3fb950)](https://github.com/nodetool-ai/nodetool/releases)
[![Latest Release](https://img.shields.io/github/v/release/nodetool-ai/nodetool?display_name=tag&sort=semver)](https://github.com/nodetool-ai/nodetool/releases/latest)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fnodetool.ai)](https://nodetool.ai)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/WmQTWZRcYE)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.txt)

# The Local‑First Agent Workbench

![Screenshot](screenshot.png)

Visual workflow builder for local and cloud ML models. Build chatbots, automate tasks, generate content—your data stays local by default.

## Table of Contents

- [How It Works](#how-it-works)
- [What You Get](#what-you-get)
- [Quick Start](#quick-start)
- [Bring Your Own Providers](#bring-your-own-providers)
- [Supported Models](#supported-models)
- [Install Node Packs in the App](#install-node-packs-in-the-app)
- [Community](#community)
- [🛠️ Development Setup](#development-setup)
- [Run Backend & Web UI](#4-run-nodetool-backend--web-ui)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Get in Touch](#get-in-touch)

## How It Works

1. **Build** — Connect nodes in a visual editor. 1000+ nodes for text, audio, video, image processing.
2. **Run** — Execute workflows locally or via API. Your data stays on your machine.
3. **Deploy** — Same workflow file runs on RunPod, Google Cloud, or your own infrastructure.

## What You Get

**Your tools, your data, your way:**

- **Local first** — Runs on your machine without vendor cloud infrastructure
- **Open source** — Inspect, modify, self-host the entire stack
- **Data stays yours** — Processes locally, never phones home or sends telemetry
- **No lock-in** — One portable workflow format from laptop to deployment

**Fast local inference:**

- **MLX** — Apple Silicon optimized (M1-M4) for LLMs, audio, speech, image generation
- **llama.cpp + whisper.cpp** — Fast LLM inference and speech recognition on any platform
- **vLLM** — Production-grade high-throughput inference engine
- **HuggingFace** — Transformers & Diffusers running locally, 24+ model types

**Use any provider:**

- Bring your own API keys for OpenAI, Anthropic, Gemini, Fal AI, Replicate, HuggingFace
- No markup, no middleman—direct API calls
- Or skip APIs entirely and use local models

**Features:**

- Visual canvas with drag-and-drop node editing
- Multimodal support (text, image, audio, video)
- Built-in vector database (ChromaDB) for RAG
- Real-time execution preview—inspect every step
- Chat interface to run workflows conversationally
- Asset manager for organizing files
- Model manager for downloading HuggingFace weights

## Quick Start

| Platform    | Download                                  | Requirements                            |
| ----------- | ----------------------------------------- | --------------------------------------- |
| **Windows** | [Download Installer](https://nodetool.ai) | Nvidia GPU recommended, 20GB free space |
| **macOS**   | [Download Installer](https://nodetool.ai) | M1+ Apple Silicon                       |
| **Linux**   | [Download AppImage](https://nodetool.ai)  | Nvidia GPU recommended                  |

### Hardware Requirements

**Local Model Inference:**

| Setup             | Hardware              | Notes                                                     |
| ----------------- | --------------------- | --------------------------------------------------------- |
| **Apple Silicon** | M1/M2/M3/M4 Mac       | 16GB+ RAM for LLM/TTS, 24GB+ for image generation        |
| **Windows/Linux** | NVIDIA GPU with CUDA  | 4GB+ VRAM for LLM/TTS, 8GB+ for image, 12GB+ for video   |
| **Cloud Only**    | No GPU required       | Use API providers (OpenAI, Anthropic, Replicate, FAL)    |

**After Install:**

1. Launch the app
2. Download models from the Model Manager
3. Connect nodes in the visual editor
4. Run workflows locally or deploy

## Bring Your Own Providers

Bring your own API keys. Direct API calls, no markup, no tracking.

**Supported providers:** OpenAI, Anthropic, Gemini, HuggingFace, Groq, Together, Replicate, Fal AI, Cohere, ElevenLabs, and more.

Set API keys in Settings → Providers.

## Supported Models

<details>
<summary>Text Generation</summary>

- **Ollama**
- **Huggingface** Llama.cpp and GGUF
- **HuggingFace Hub** Inference providers
- **OpenAI**
- **Gemini**
- **Anthropic**
- and many others

</details>

<details>
<summary>Text-to-Image</summary>

**FLUX Models:**

- **Flux Dev**, **Flux Schnell** (HuggingFace, FAL, Replicate, MLX)
- **Flux V 1 Pro** (FAL, Replicate)
- **Flux Fill Dev** (inpainting, HuggingFace, MLX)
- **Flux Depth Dev** (depth-guided, HuggingFace, MLX)
- **Flux Canny Dev** (edge-guided, HuggingFace, MLX)
- **Flux Kontext Dev** (reference fusion, HuggingFace, MLX)
- **Flux Redux Dev** (reference guidance, HuggingFace, MLX)
- **Flux Krea Dev** (enhanced photorealism, MLX)
- **Flux Lite 8B** (lightweight variant, MLX)
- **Chroma** (advanced color control, HuggingFace)
- **Flux Subject** (FAL)
- **Flux Lora**, **Flux Lora TTI**, **Flux Lora Inpainting** (FAL)
- **Flux 360** (Replicate)
- **Flux Black Light** (Replicate)
- **Flux Canny Dev/Pro** (Replicate)
- **Flux Cinestill** (Replicate)
- **Flux Dev Lora** (Replicate)

**Other Models:**

- **Stable Diffusion XL** (HuggingFace, Replicate, FAL)
- **Stable Diffusion XL Turbo** (Replicate, FAL)
- **Stable Diffusion Upscaler** (HuggingFace)
- **AuraFlow v0.3**, **Bria V1/V1 Fast/V1 HD**, **Fast SDXL** (FAL)
- **Fast LCMDiffusion**, **Fast Lightning SDXL**, **Fast Turbo Diffusion** (FAL)
- **Hyper SDXL** (FAL)
- **Ideogram V 2**, **Ideogram V 2 Turbo** (FAL)
- **Illusion Diffusion** (FAL)
- **Kandinsky, Kandinsky 2.2** (Replicate)
- **Zeroscope V 2 XL** (HuggingFace, Replicate)
- **Ad Inpaint** (Replicate)
- **Consistent Character** (Replicate)

**MLX (Apple Silicon):**

- **MFlux** - Local FLUX inference with 4/6/8-bit quantization
- **MFlux ControlNet** - Edge-guided generation with Canny models
- **MFlux ImageToImage** - Image transformation with FLUX
- **MFlux Inpaint** - Masked region editing
- **MFlux Outpaint** - Canvas extension
- **MFlux Depth** - Depth-guided generation
- **MFlux Kontext** - Reference image fusion
- **MFlux Redux** - Multi-reference blending

**Gemini (Google):**

- **Gemini 2.0 Flash Preview**, **Gemini 2.5 Flash** - Image generation with multimodal models
- **Imagen 3.0** (001, 002) - High-quality text-to-image
- **Imagen 4.0 Preview**, **Imagen 4.0 Ultra Preview** - Latest generation models

**OpenAI:**

- **GPT Image 1** - Unified image generation model
- **DALL-E 3**, **DALL-E 2** - Legacy image generation models

</details>

<details>
<summary>Image Processing</summary>

**Classification & Segmentation:**

- **google/vit-base-patch16-224** (image classification, HuggingFace Hub)
- **openmmlab/upernet-convnext-small** (image segmentation, HuggingFace Hub)
- **facebook/sam2-hiera-large** (SAM2 segmentation, HuggingFace)
- **nvidia/segformer-b3-finetuned-ade-512-512** (scene segmentation, HuggingFace)
- **mattmdjaga/segformer_b2_clothes** (clothing segmentation, HuggingFace)

**Image Editing:**

- **Diffusion Edge** (edge detection, FAL)
- **Bria Background Remove/Replace/Eraser/Expand/GenFill/ProductShot** (FAL)
- **Robust Video Matting** (video background removal, Replicate)

**Captioning & Understanding:**

- **nlpconnect/vit-gpt2-image-captioning** (image captioning, HuggingFace)

</details>

<details>
<summary>Audio Generation</summary>

**Text-to-Speech:**

- **microsoft/speecht5_tts** (TTS, HuggingFace Hub)
- **Kokoro TTS** (multilingual TTS with 50+ voices, MLX)
- **F5-TTS, E2-TTS** (TTS, FAL)
- **PlayAI Dialog TTS** (dialog TTS, FAL)
- **ElevenLabs TTS models** (ElevenLabs)

**Music & Audio:**

- **Stable Audio** (text-to-audio, FAL & HuggingFace)
- **AudioLDM** (text-to-audio, HuggingFace)
- **AudioLDM2** (enhanced text-to-audio, HuggingFace)
- **MusicLDM** (music generation, HuggingFace)
- **DanceDiffusion** (music generation, HuggingFace)
- **MusicGen** (music generation, Replicate)
- **Music 01** (music generation with vocals, Replicate)
- **MMAudio V2** (music and audio generation, FAL)
- **facebook/musicgen-small/medium/large/melody** (music generation, HuggingFace)
- **facebook/musicgen-stereo-small/large** (stereo music generation, HuggingFace)

</details>

<details>
<summary>Audio Processing</summary>

- **Audio To Waveform** (audio visualization, Replicate)

</details>

<details>
<summary>Video Generation</summary>

**HuggingFace Inference Providers:**

- **Hotshot-XL** (text-to-GIF, Replicate)
- **HunyuanVideo, LTX-Video** (text-to-video, Replicate)
- **Kling Text To Video V 2**, **Kling Video V 2** (FAL)
- **Pixverse Image To Video**, **Pixverse Text To Video**, **Pixverse Text To Video Fast** (FAL)
- **Wan Pro Image To Video**, **Wan Pro Text To Video** (FAL)
- **Wan V 2 1 13 BText To Video** (FAL)
- **Cog Video X** (FAL)
- **Haiper Image To Video** (FAL)
- **Wan 2 1 1 3 B** (text-to-video, Replicate)
- **Wan 2 1 I 2 V 480 p** (image-to-video, Replicate)
- **Video 01**, **Video 01 Live** (video generation, Replicate)
- **Ray** (video interpolation, Replicate)
- **Wan-AI/Wan2.2-I2V-A14B-Diffusers** (image-to-video, HuggingFace)
- **Wan-AI/Wan2.1-I2V-14B-480P-Diffusers** (image-to-video, HuggingFace)
- **Wan-AI/Wan2.1-I2V-14B-720P-Diffusers** (image-to-video, HuggingFace)
- **Wan-AI/Wan2.2-T2V-A14B-Diffusers** (text-to-video, HuggingFace)
- **Wan-AI/Wan2.1-T2V-14B-Diffusers** (text-to-video, HuggingFace)
- **Wan-AI/Wan2.2-TI2V-5B-Diffusers** (text+image-to-video, HuggingFace)

**Gemini (Google):**

- **Veo 3.0**, **Veo 3.0 Fast** - Latest generation video models
- **Veo 2.0** - Text-to-video and image-to-video generation

**OpenAI:**

- **Sora 2**, **Sora 2 Pro** - Advanced text-to-video and image-to-video (1280x720, 720x1280)

</details>

<details>
<summary>Text Processing</summary>

**Summarization & Classification:**

- **facebook/bart-large-cnn** (summarization, HuggingFace Hub)
- **distilbert/distilbert-base-uncased-finetuned-sst-2-english** (text classification, HuggingFace Hub)
- **facebook/bart-large-mnli** (zero-shot classification, HuggingFace)

**Question Answering:**

- **distilbert-base-cased-distilled-squad** (extractive QA, HuggingFace)
- **distilbert-base-uncased-distilled-squad** (extractive QA, HuggingFace)
- **bert-large-uncased-whole-word-masking-finetuned-squad** (advanced QA, HuggingFace)
- **deepset/roberta-base-squad2** (QA with no-answer detection, HuggingFace)

**Table QA:**

- **google/tapas-base-finetuned-wtq** (table question answering, HuggingFace)
- **google/tapas-large-finetuned-wtq** (large table QA, HuggingFace)
- **microsoft/tapex-large-finetuned-tabfact** (table fact verification, HuggingFace)

**Translation:**

- **google-t5/t5-base** (translation & text processing, HuggingFace Hub)

</details>

<details>
<summary>Speech Recognition</summary>

**Audio Classification:**

- **superb/hubert-base-superb-er** (audio classification, HuggingFace Hub)

**Speech-to-Text:**

- **openai/whisper-large-v3** (speech recognition, HuggingFace Hub)
- **openai/whisper-large-v3-turbo** (fast ASR, HuggingFace)
- **openai/whisper-large-v2** (ASR, HuggingFace)
- **openai/whisper-medium** (ASR, HuggingFace)
- **openai/whisper-small** (lightweight ASR, HuggingFace)

**Gemini:**

- **Gemini 1.5 Flash**, **Gemini 1.5 Pro** - Native audio understanding
- **Gemini 2.0 Flash Exp** - Experimental audio processing

**OpenAI:**

- **Whisper-1** - General-purpose speech recognition

</details>

<details>
<summary>Provider Multimodal Capabilities</summary>

NodeTool supports multiple AI providers with comprehensive image, video, text-to-speech, and speech recognition
capabilities:

| Provider        | Text-to-Image | Image-to-Image       | Text-to-Video | Image-to-Video | TTS                   | ASR        |
| --------------- | ------------- | -------------------- | ------------- | -------------- | --------------------- | ---------- |
| **Gemini**      | ✓ 6 models    | ✓ Gemini models only | ✓ 3 models    | ✓ 2 models     | ✓ 2 models, 30 voices | ✓ 3 models |
| **HuggingFace** | ✓ dynamic     | ✓ dynamic            | ✓ dynamic     | -              | ✓ dynamic             | -          |
| **OpenAI**      | ✓ 3 models    | ✓ 3 models           | ✓ 2 models    | ✓ 2 models     | ✓ 2 models, 6 voices  | ✓ 1 model  |

**Key Features:**

- **Gemini** offers the most comprehensive suite with Imagen for images and Veo for video
- **HuggingFace** provides access to 17+ inference providers with dynamically available models
- **OpenAI** features DALL-E for images and Sora for high-quality video generation
- **MLX** enables local, Apple Silicon-optimized inference for FLUX models and Kokoro TTS

</details>

## Install Node Packs in the App

Install and manage packs directly from the desktop app.

- Open Package Manager: Launch the Electron desktop app, then open the Package Manager from the Tools menu.
- Browse and search packages: Use the top search box to filter by package name, description, or repo id.
- Search nodes across packs: Use the “Search nodes” field to find nodes by title, description, or type. You can install
  the required pack directly from node results.

## Community

- **[Discord](https://discord.gg/WmQTWZRcYE)** — Get help, share workflows
- **[GitHub](https://github.com/nodetool-ai/nodetool)** — Report bugs, request features
- **Contribute** — Pull requests welcome

______________________________________________________________________

## 🛠️ Development Setup

Set up a local development environment for the entire NodeTool platform.

For core library development, see [nodetool-core repository](https://github.com/nodetool-ai/nodetool-core).

### Prerequisites

- Python 3.11
- Conda ([miniconda.org](https://docs.conda.io/en/latest/miniconda.html))
- Node.js LTS ([nodejs.org](https://nodejs.org/en))

### 1. Set Up Conda Environment

```bash
# Create or update the Conda environment from environment.yml
conda env update -f environment.yml --prune
conda activate nodetool
```

### 2. Install Core Python Dependencies

```bash
# Install core packages
uv pip install git+https://github.com/nodetool-ai/nodetool-core
uv pip install git+https://github.com/nodetool-ai/nodetool-base
```

**For development:**

```bash
git clone https://github.com/nodetool-ai/nodetool-core
cd nodetool-core
uv pip install -e .
cd ..

git clone https://github.com/nodetool-ai/nodetool-base
cd nodetool-base
uv pip install -e .
cd ..
```

### 3. Install Optional Node Packs

Extend functionality with packs. Install only what you need.

**Recommended: Use the in-app Package Manager** (Tools → Package Manager)

**Command line installation:**

```bash
# List available packs
nodetool package list -a

# Install specific packs
uv pip install git+https://github.com/nodetool-ai/nodetool-fal
uv pip install git+https://github.com/nodetool-ai/nodetool-replicate
uv pip install git+https://github.com/nodetool-ai/nodetool-elevenlabs

# Apple Silicon: MLX pack for local FLUX inference
uv pip install git+https://github.com/nodetool-ai/nodetool-mlx
```

**Windows & Linux (NVIDIA GPUs):**

```bash
# Check CUDA version
nvidia-smi

# Install PyTorch with CUDA support (adjust cu126 to match your CUDA version)
uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126

# Install GPU-dependent packs
uv pip install --extra-index-url https://download.pytorch.org/whl/cu126 git+https://github.com/nodetool-ai/nodetool-huggingface

# Verify GPU support
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```


### 4. Run NodeTool Backend & Web UI

Activate the conda environment first.

**Option A: Development (Backend + Web UI)**

```bash
# Terminal 1: Start backend
nodetool serve --reload

# Terminal 2: Start frontend
cd web
npm install
npm start
```

Access at `http://localhost:3000`

**Option B: Desktop App (Electron)**

Configure conda path in `settings.yaml`:
- macOS/Linux: `~/.config/nodetool/settings.yaml`
- Windows: `%APPDATA%/nodetool/settings.yaml`

```yaml
CONDA_ENV: /path/to/your/conda/envs/nodetool
```

Build frontends (once or when code changes):

```bash
cd web && npm install && npm run build && cd ..
cd apps && npm install && npm run build && cd ..
cd electron && npm install && npm run build && cd ..
```

Start Electron:

```bash
cd electron
npm start
```

## Testing

### Python (core, packs)

```bash
pytest -q
```

### Web UI

```bash
cd web
npm test
npm run lint
npm run typecheck
```

### Electron

```bash
cd electron
npm run lint
npm run typecheck
```

## Code Quality

Pre-commit hooks check and format code before commits.

```bash
# Install pre-commit
conda activate nodetool
pip install pre-commit
pre-commit install

# Run manually
pre-commit run --all-files

# Skip if necessary (not recommended)
git commit --no-verify -m "Your message"
```

**Checks:**
- Python: Ruff linting/formatting
- TypeScript/JavaScript: ESLint, type checking
- General: trailing whitespace, YAML/JSON validation

## Troubleshooting

- **Node/npm versions**: Use Node.js LTS (≥18). Reset with `rm -rf node_modules && npm install`
- **Port in use**: Stop other processes on port 3000/8000 or change ports
- **CLI not found**: Activate conda environment and restart shell
- **GPU/PyTorch issues**: Use `--extra-index-url` when installing GPU-dependent packs

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/name`)
5. Open a Pull Request

## License

AGPL-3.0

## Get in Touch

- **Email:** hello@nodetool.ai
- **Developers:** Matthias Georgi (matti@nodetool.ai), David Bührer (david@nodetool.ai)
- **Docs:** [docs.nodetool.ai](https://docs.nodetool.ai)
- **Issues:** [GitHub Issues](https://github.com/nodetool-ai/nodetool/issues)
