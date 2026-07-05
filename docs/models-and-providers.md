---
layout: page
title: "Models & Providers"
description: "Every AI model NodeTool runs — GPT-5, Claude, Gemini, Grok, DeepSeek, Llama; FLUX, Nano Banana, Seedream, Ideogram; Sora 2, Veo 3.1, Kling, Wan, Seedance; ElevenLabs, Suno, Whisper — across 30+ providers, local or cloud, bring-your-own-key."
---

> **Overview / start here.** For the full catalog of model families see [Supported Models](models.md); for connecting and configuring each provider see [Providers](providers.md); for the desktop download panel see [Models Manager](models-manager.md).

Run models locally, through cloud APIs with your own keys, or both in the same graph.

## Local vs. cloud

### Local

- Data stays on your disk
- Free after download
- Works offline
- 4–20 GB per model; needs a capable GPU or Apple Silicon

### Cloud (BYOK)

- No download
- Runs on the provider's hardware
- Latest model releases
- Billed by the provider, at the provider's price — no NodeTool markup
- Requires internet; data goes to the provider

### Mixed

Pick the best provider per node:
- ASR (Whisper) — local for sensitive audio
- Image generation — Flux locally for control, FAL/KIE cloud for speed
- Document processing — local for confidential files

---

## Cloud models

NodeTool reaches thousands of cloud models across 30+ providers, all through the same generic nodes. The catalog below is grouped by what you're generating — text, images, video, speech and music, 3D, embeddings. Every model runs on your own API key (BYOK): you're billed by the provider at the provider's price, with no NodeTool markup. Add a key in **Settings → Providers** and the models show up in the node's model dropdown.

Chat models are fetched live from each provider's API, so a provider's list always reflects its newest releases; the families below are the ones you'll find there. Image, video, audio, and 3D models are drawn from the manifests each provider node package ships (`packages/*-nodes/`), so they track what NodeTool actually exposes.

### Text & chat models (LLMs)

The generic `nodetool.agents.Agent` and chat nodes route to whichever provider owns the model you pick — swap `claude-opus` for `gpt-5` for `gemini-3-pro` without touching the rest of the graph.

| Provider | Model families |
|---|---|
| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | GPT-5, GPT-5 mini, GPT-5 nano, GPT-4.1, GPT-4o, o-series reasoning models |
| <img src="assets/icons/anthropic.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Anthropic | Claude Opus 4.x, Claude Sonnet 4.x, Claude Haiku 4.x, Claude 3.5/3.7 Sonnet |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google Gemini | Gemini 3 Pro, Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash |
| <img src="assets/icons/xai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> xAI | Grok 4, Grok 3, Grok Code |
| DeepSeek | DeepSeek-V3, DeepSeek-R1 (reasoning) |
| Groq | Llama, Qwen, GPT-OSS, Kimi K2 on LPU inference |
| Mistral | Mistral Large, Mistral Medium, Mistral Small, Mixtral, Codestral, Magistral |
| Cerebras | Llama, Qwen, GPT-OSS on wafer-scale inference |
| GMI Cloud | Llama, DeepSeek, Qwen (open-weight) |
| Moonshot | Kimi K2, Kimi latest |
| <img src="assets/icons/minimax.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> MiniMax | MiniMax-Text, MiniMax M2 |
| OpenRouter | 300+ models proxied through one key (Claude, GPT, Gemini, Llama, Qwen, DeepSeek, …) |
| Together AI | Llama, Qwen, DeepSeek, Mixtral, GLM, Kimi, and more open models |
| Evolink | GPT, Claude, Gemini, DeepSeek through one gateway key |
| kie.ai | GPT-5.5, Claude Opus/Sonnet/Haiku 4.x, Gemini 3.1 Pro (chat gateway) |
| Codex (OpenAI OAuth) | GPT chat models via your ChatGPT/Codex login |
| Claude Agent SDK | Claude via your local `claude` CLI subscription |
| Ollama · vLLM · LM Studio · llama.cpp | Any local open-weight model — Llama, Qwen, Gemma, DeepSeek, Mistral, Phi, GPT-OSS |
| HuggingFace | Chat inference over Hub models (500,000+) |

Reasoning, tool calling, and vision input are exposed where the provider supports them. For local text generation without an API key, see [Supported Models](models.md#local-inference-engines) (llama.cpp, MLX, Transformers).

### Image generation models

Generate and edit images through `nodetool.image.TextToImage` and `nodetool.image.ImageToImage`.

**Flagship models**

| Model | Provider | Capabilities | Key features |
|-------|----------|-------------|--------------|
| **Black Forest Labs FLUX.2** | <img src="assets/icons/bfl.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> BFL | T2I with control | Photoreal images, multi-reference consistency, accurate text, flexible control |
| **Google Nano Banana 2.0 / Pro** | <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | High-res T2I/Edit | 2K output, 4K upscaling, better text and character consistency |
| **GPT Image 2** | <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | T2I/Edit | Photorealistic generation and instruction-based editing |
| **Ideogram V3** | Ideogram | T2I/Edit | Typography rendering and artistic style control |
| **Seedream 4.5** | ByteDance | T2I/Edit | High-fidelity generation and instruction-based editing |
| **Z-Image Turbo** | Z-AI | T2I | Fast generation with strong prompt adherence |
| **Imagen 4** | <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | T2I | Ultra-detailed photorealistic images |

**Full catalog by provider**

| Provider | Image models |
|---|---|
| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | GPT Image 2, GPT Image 1.5, GPT Image 1, GPT Image 1 mini |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | Nano Banana (Gemini 2.5 Flash Image), Nano Banana 2, Nano Banana Pro, Imagen 3, Imagen 4, Imagen 4 Ultra, Gemini 3 Pro Image |
| <img src="assets/icons/bfl.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Black Forest Labs | FLUX.1 [schnell], FLUX.1 [dev], FLUX.1 Pro, FLUX 1.1 Pro, FLUX 1.1 Pro Ultra, FLUX.2 [dev/flex/pro/max], FLUX.2 Klein, FLUX Kontext [pro/max], FLUX Fill, FLUX Canny, FLUX Depth, FLUX Redux, FLUX PuLID |
| Stability AI | Stable Diffusion 1.5, SD 2.1, SDXL, SDXL Lightning, Stable Diffusion 3 Medium, SD 3.5 [medium/large/large turbo], Stable Cascade |
| Qwen | Qwen Image, Qwen Image Edit (2509/2511/Plus), Qwen Image Max, Qwen Image Layered |
| ByteDance | Seedream 3.0, Seedream 4.0, Seedream 4.5, Seedream 5 Lite |
| Ideogram | Ideogram V2, V2 Turbo, V2a, V3 [balanced/quality/turbo], Ideogram Character |
| Recraft | Recraft V3, Recraft 20B, Recraft V4, Recraft V4 Pro (raster + SVG) |
| Others | Kolors, HiDream, Hunyuan Image 3, OmniGen v1/v2, Sana, PixArt-Σ, Aura Flow, CogView4, Luma Photon, GLM Image, Reve, Bria, ERNIE Image, Emu 3.5, Lumina, F-Lite, Fibo, Playground v2.5, Juggernaut, DreamShaper, Proteus, Recraft, Chroma, Janus, MiniMax Image-01, xAI Grok Imagine |
| Upscale & restore | Topaz, Real-ESRGAN, ESRGAN, SUPIR, Clarity Upscaler, SeedVR, GFPGAN, CodeFormer, AuraSR, SwinIR, DDColor |

Access aggregators — <img src="assets/icons/fal.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [FAL](https://fal.ai/) (450+ image endpoints), [Replicate](https://replicate.com/) (170+), and [kie.ai](https://kie.ai/) — carry most of these families plus hundreds of community fine-tunes, LoRAs, and control variants.

### Video generation models

Generate video through `nodetool.video.TextToVideo` and `nodetool.video.ImageToVideo`.

**Flagship models**

| Model | Provider | Capabilities | Key features |
|-------|----------|-------------|--------------|
| **OpenAI Sora 2 Pro** | <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | T2V/I2V up to 15s | Realistic motion, refined physics, synchronized native audio, 1080p |
| **Google Veo 3.1** | <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | T2V/I2V with references | Multi-image references, extended length, native 1080p with synced audio |
| **ByteDance Seedance 2.0** | ByteDance | T2V/I2V | Cinematic video with stable characters and smooth motion |
| **Runway Gen-4 / Aleph** | Runway | T2V/I2V/Extend | Precise motion control and high fidelity |
| **Luma Ray 2** | Luma AI | T2V/I2V/edit | Fast generation and creative editing |
| **xAI Grok Imagine** | <img src="assets/icons/xai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> xAI | T2V/I2V/T2I | Coherent motion with synchronized audio |
| **Alibaba Wan 2.6** | <img src="assets/icons/alibaba.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Alibaba | Multi-shot T2V/I2V | Affordable 1080p, stable characters, native audio |
| **MiniMax Hailuo 2.3** | <img src="assets/icons/minimax.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> MiniMax | High-fidelity T2V/I2V | Expressive characters, complex motion and lighting |
| **Kling 3.0** | <img src="assets/icons/kling.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Kling | T2V/I2V with audio | Synchronized speech, ambient sound, and effects |

**Full catalog by provider**

| Provider | Video models |
|---|---|
| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | Sora 2, Sora 2 Pro |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | Veo 2, Veo 3, Veo 3.1, Veo 3.1 Lite |
| <img src="assets/icons/kling.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Kling | Kling 2.1 [standard/pro/master], Kling 2.5 Turbo Pro, Kling 2.6, Kling 3.0, Kling Avatar, Kling Lip Sync |
| ByteDance | Seedance 1.0 [lite/pro], Seedance 1.5 Pro, Seedance 2.0 |
| <img src="assets/icons/alibaba.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Alibaba | Wan 2.1, Wan 2.2, Wan 2.5, Wan 2.6, Wan VACE |
| <img src="assets/icons/minimax.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> MiniMax | Hailuo 02, Hailuo 2.3, Video-01 [director/live] |
| Runway | Gen-3 Alpha, Gen-4, Gen-4 Turbo, Gen-4.5, Aleph |
| Luma AI | Dream Machine, Ray 2 [540p/720p], Ray Flash 2 |
| PixVerse | PixVerse v4, v4.5, v5, v5.6, v6 |
| Vidu | Vidu 2.0, Vidu Q1 |
| Others | LTX Video, LTX-2, Hunyuan Video (+ v1.5, Avatar, Foley), Mochi v1, CogVideoX-5B, Marey, Lucy, Magi, Kandinsky 5, Sana Video, SkyReels, Stable Video Diffusion, Zeroscope, Pika, xAI Grok Imagine |
| Lip sync & avatars | LatentSync, Lipsync 2 [pro], MultiTalk, OmniHuman, SadTalker, Live Portrait, Stable Avatar, DreamActor, InfiniteTalk |
| Upscale | Topaz Video, SeedVR, Crystal Video Upscaler |

### Speech, audio & music models

Generate speech through `nodetool.audio.TextToSpeech`, transcribe with `nodetool.text.AutomaticSpeechRecognition`, and create music through provider music nodes.

**Text-to-speech (TTS)**

| Provider | TTS models |
|---|---|
| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | TTS 1, TTS 1 HD, gpt-4o-mini-tts |
| <img src="assets/icons/elevenlabs.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> ElevenLabs | Eleven v3, Turbo v2.5, Flash v2.5, Multilingual v2 |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | Gemini TTS, Gemini 3.1 Flash TTS |
| <img src="assets/icons/minimax.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> MiniMax | Speech 02 [hd/turbo], Speech 2.6, Speech 2.8 |
| Open models | Kokoro, Orpheus, Chatterbox [HD/Pro/Turbo/Multilingual], Dia, F5-TTS, XTTS v2, VibeVoice, Zonos, CSM-1B, Index-TTS 2, Qwen 3 TTS, Maya, StyleTTS2, Parler-TTS, Tortoise, VoiceCraft, OpenVoice, Cartesia Sonic |

**Speech recognition (ASR)**

| Provider | ASR models |
|---|---|
| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | Whisper |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | Gemini audio transcription |
| <img src="assets/icons/elevenlabs.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> ElevenLabs | Scribe (speech-to-text) |
| Together AI | Whisper Large v3, Voxtral, Parakeet |
| HuggingFace | Whisper and other ASR models, plus MLX Whisper locally |

**Music & sound**

| Provider | Music & sound models |
|---|---|
| Suno (via kie.ai) | Suno — song generation, extend, cover, remix |
| <img src="assets/icons/elevenlabs.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> ElevenLabs | V3 Dialogue, Sound Effects |
| <img src="assets/icons/minimax.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> MiniMax | Music 01, Music 1.5, Music 2.6 |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | Lyria 2 |
| Open models | MusicGen, Stable Audio 2.5, ACE-Step, DiffRhythm, YuE, Riffusion, Flux Music, MMAudio, ThinkSound |

### 3D generation models

Generate 3D assets through `nodetool.3d.TextTo3D` and `nodetool.3d.ImageTo3D`.

| Model | Provider | Capabilities | Key features |
|-------|----------|-------------|--------------|
| **Meshy AI** | Meshy (`MESHY_API_KEY`) | T2M/I2M | Textured mesh generation |
| **Rodin AI** | Rodin (`RODIN_API_KEY`) | T2M/I2M | High-fidelity 3D creation |

Open 3D families — Hunyuan3D (v2.1/v3), Trellis / Trellis 2, TripoSR / Tripo, Shap-E, Point-E, OmniPart, Era3D — run through HuggingFace / base-node 3D nodes (`HFTextTo3D`, `HFImageTo3D`) and FAL/Replicate rather than dedicated runtime providers. See [Providers](providers.md) for details.

### Embedding models

Power RAG and semantic search through embedding nodes.

| Provider | Embedding models |
|---|---|
| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | text-embedding-3-small, text-embedding-3-large, ada-002 |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | gemini-embedding-001 |
| Mistral | mistral-embed |
| Cohere | embed-v4.0, embed-english-v3.0, embed-multilingual-v3.0 |
| Voyage AI | voyage-3.5 and the Voyage line |
| Jina AI | jina-embeddings-v3 |
| Together AI | m2-bert, BGE, and other open embedding models |
| Ollama · HuggingFace | nomic-embed, mxbai-embed, sentence-transformers (local, no key) |

### Using these models

Access these models through NodeTool's **generic nodes**:

1. **For Video**: Use `nodetool.video.TextToVideo` or `nodetool.video.ImageToVideo`
2. **For Images**: Use `nodetool.image.TextToImage`
3. **For 3D**: Use `nodetool.3d.TextTo3D` or `nodetool.3d.ImageTo3D`
4. **For Music**: Use kie.ai-backed Suno nodes (Suno Generate, Extend, Cover)
5. **Select Provider**: Click the model dropdown in the node properties
6. **Configure API**: Add provider API keys in `Settings → Providers`

**Access via kie.ai (recommended for broad model support):**
Many of these models are available through [kie.ai](https://kie.ai/), an AI provider aggregator that often offers competitive or lower pricing compared to upstream providers.
- Configure using `KIE_API_KEY` in `Settings → Providers`

**Access via fal.ai:**
- Configure using `FAL_API_KEY` in `Settings → Providers`


> **Cost Considerations**: Cloud models typically charge per generation. Check each provider's pricing before extensive use. Local models are free after download but require capable hardware.


---

## Getting Started

### Option 1: Start with Local Models (Recommended)

1. Open **Models → Model Manager** in NodeTool
2. Install these starter models:
   - **GPT-OSS** (~4 GB) – Text generation and chat
   - **Flux** (~12 GB) – High-quality image generation
3. Wait for downloads to complete
4. Run templates – they'll work offline!

### Option 2: Start with Cloud Providers

1. Get an API key from a provider:
   - <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [OpenAI](https://platform.openai.com) – GPT, Whisper, Sora
   - <img src="assets/icons/anthropic.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [Anthropic](https://www.anthropic.com) – Claude models
   - <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [Google](https://ai.google.dev) – Gemini models
2. In NodeTool, go to **Settings → Providers**
3. Paste your API key
4. Select the provider when using AI nodes

---
## Detailed Guides

### General
- **[Models Manager](models-manager.md)** – Download and manage AI models
- **[Getting Started](getting-started.md)** – First workflow

### Local AI
- **[Supported Models](models.md)** – List of local models (llama.cpp, MLX, Whisper, Flux)

### Cloud AI
- **[Providers Guide](providers.md)** – Set up OpenAI, Anthropic, Google
- **[HuggingFace Integration](huggingface.md)** – Access 500,000+ models

### Advanced
- **[Self-Hosted Deployment](self-hosted-deployment.md)** – Secure deployments
- **[Deployment Guide](deployment.md)** – Cloud infrastructure