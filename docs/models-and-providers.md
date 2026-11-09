---
layout: page
title: "Models & Providers"
description: "Model catalog by modality (text, image, video, audio, 3D, embeddings) with the provider that serves each, local or cloud."
---

Every model runs locally, through a cloud API with your own key, or both in the same graph. Model lists per provider are below. Provider setup is in [Providers](providers.md), local weights are in [Supported Models](models.md), and the download panel is in [Models Manager](models-manager.md).

> **Runs:** locally or cloud, chosen per node. **Needs:** a provider key for cloud models (secret names in [Providers](providers.md)), nothing for local engines. **Hardware:** local models need disk space and a GPU or Apple Silicon. Sizes depend on the model, so check the download size in the Model Manager.
{: .callout-note}

## Local vs. cloud

| | Local | Cloud (bring your own key) |
|---|---|---|
| Data | Stays on your disk | Sent to the provider |
| Cost | Free after download | Billed by the provider at its price, no NodeTool markup |
| Network | Works offline | Needs internet |
| Models | What you downloaded | Latest provider releases |

Mix per node. Run Whisper locally for sensitive audio, FLUX locally for control and FAL or kie.ai for speed, and local document processing for confidential files.

## If it fails

- **Missing key:** the provider throws at the call, for example `OPENAI_API_KEY is required` (the message names the secret). The node fails and the run reports the error. Add the key in **Settings → Models & Providers**.
- **Rejected key (401/403):** reported as failure kind `auth`. Use the **Test** button on the provider to check the key.
- **Rate limit (429):** reported as kind `rate_limit` with the provider's own message. Replicate calls wait and retry before failing. For other providers the error reaches the node as is.
- **Insufficient balance (402):** reported as kind `payment`.
- **Local model not downloaded:** download it in the [Models Manager](models-manager.md) before running.

---

## Cloud models

Add a key in **Settings → Models & Providers** and that provider's models appear in the node's model dropdown. Most chat providers fetch their list live from the provider's API. A few use fixed lists, such as kie.ai's chat gateway and Meta AI's offline fallback. Image, video, audio, and 3D models come from manifests or static lists in `packages/runtime/src/providers/` and the `packages/*-nodes/` packages. The model names below are examples and drift as providers release.

### Text & chat models (LLMs)

`nodetool.agents.Agent` and the chat nodes route to the provider that owns the selected model. Swapping `claude-opus-5` for `gpt-5.6` needs no other change in the graph.

| Provider | Model families |
|---|---|
| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | GPT-5.6 (plus the Sol, Terra, and Luna variants), GPT-5.5, GPT-5.5 Pro, GPT-5.4 with its Pro/mini/nano tiers, GPT-5, GPT-5 mini, GPT-5 nano |
| <img src="assets/icons/anthropic.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Anthropic | Claude Fable 5, Claude Opus 5, Claude Sonnet 5, Claude Opus 4.8/4.7/4.6, Claude Sonnet 4.6, Claude Haiku 4.5 |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google Gemini | Gemini 3.5 Flash, Gemini 3.1 Pro, Gemini 3.1 Flash-Lite, Gemini 2.5 Pro |
| <img src="assets/icons/xai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> xAI | Grok 4, Grok 3, Grok Code |
| DeepSeek | DeepSeek-V3, DeepSeek-R1 (reasoning) |
| Groq | Llama, Qwen, GPT-OSS, Kimi K2 on LPU inference |
| Mistral | Mistral Large, Mistral Medium, Mistral Small, Mixtral, Codestral, Magistral |
| Cerebras | Llama, Qwen, GPT-OSS on wafer-scale inference |
| Alibaba Cloud | Qwen3-Max, Qwen-Plus, Qwen-Flash, Qwen-Turbo, Qwen3-VL |
| GMI Cloud | Llama, DeepSeek, Qwen (open-weight) |
| Moonshot | Kimi K2, Kimi latest |
| Meta AI | Muse Spark |
| <img src="assets/icons/minimax.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> MiniMax | MiniMax M2.7, M2.5, M2.1, M2 (plus high-speed variants) |
| OpenRouter | 300+ models proxied through one key (Claude, GPT, Gemini, Llama, Qwen, DeepSeek, …) |
| Requesty | Claude, GPT, Gemini, DeepSeek, Grok and more through one OpenAI-compatible router |
| API Route | Hosted Claude, GPT, Gemini and DeepSeek chat models through an OpenAI-compatible API |
| Opper | Claude, GPT, Gemini, DeepSeek, Kimi and more through one EU-hosted OpenAI-compatible gateway |
| Cheaper Inference | Claude, GPT, Gemini, DeepSeek and more through one OpenAI-compatible gateway |
| Runcrate | DeepSeek, Qwen, GLM, Kimi, gpt-oss and more open-weight models through one OpenAI-compatible API |
| Standard Compute | Open and frontier chat models through one OpenAI-compatible gateway, with a routed `StandardCompute` model |
| Together AI | Llama, Qwen, DeepSeek, Mixtral, GLM, Kimi, and more open models |
| Evolink | GPT, Claude, Gemini, DeepSeek through one gateway key |
| kie.ai | GPT, Claude, Grok, Kimi, DeepSeek, and Gemini models through its chat gateway |
| Codex (OpenAI OAuth) | GPT chat models via your ChatGPT/Codex login |
| Claude Agent SDK | Claude via your local `claude` CLI subscription |
| Ollama · vLLM · LM Studio · llama.cpp · llama.cpp local | Any local open-weight model served by your own engine (Llama, Qwen, Gemma, DeepSeek, Mistral, Phi, GPT-OSS) |
| HuggingFace | The most-liked warm inference models on the Hub, through Inference Providers |
| FAL | Chat through fal's OpenAI-compatible route (OpenRouter's catalog) |

Reasoning, tool calling, and vision input are exposed where the provider supports them. For local text generation without an API key, see [Supported Models](models.md#local-inference-engines) (Ollama, llama.cpp, MLX, Transformers.js).

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

**Full catalog by provider**

| Provider | Image models |
|---|---|
| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | GPT Image 2, GPT Image 1.5, GPT Image 1, GPT Image 1 mini |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | Gemini 3.1 Flash Image (Nano Banana 2), Gemini 3 Pro Image (Nano Banana Pro) |
| <img src="assets/icons/bfl.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Black Forest Labs | FLUX.1 [schnell], FLUX.1 [dev], FLUX.1 Pro, FLUX 1.1 Pro, FLUX 1.1 Pro Ultra, FLUX.2 [dev/flex/pro/max], FLUX.2 Klein, FLUX Kontext [pro/max], FLUX Fill, FLUX Canny, FLUX Depth, FLUX Redux, FLUX PuLID |
| Stability AI | Stable Diffusion 1.5, SD 2.1, SDXL, SDXL Lightning, Stable Diffusion 3 Medium, SD 3.5 [medium/large/large turbo], Stable Cascade |
| Qwen | Qwen Image, Qwen Image Edit (2509/2511/Plus), Qwen Image Max, Qwen Image Layered |
| ByteDance | Seedream 3.0, Seedream 4.0, Seedream 4.5, Seedream 5 Lite |
| Ideogram | Ideogram V2, V2 Turbo, V2a, V3 [balanced/quality/turbo], Ideogram Character |
| Recraft | Recraft V3, Recraft 20B, Recraft V4, Recraft V4 Pro (raster + SVG) |
| Others | Kolors, HiDream, Hunyuan Image 3, OmniGen v1/v2, Sana, PixArt-Σ, Aura Flow, CogView4, Luma Photon, GLM Image, Reve, Bria, ERNIE Image, Emu 3.5, Lumina, F-Lite, Fibo, Playground v2.5, Juggernaut, DreamShaper, Proteus, Recraft, Chroma, Janus, MiniMax Image-01, xAI Grok Imagine |
| Upscale & restore | Topaz, Real-ESRGAN, ESRGAN, SUPIR, Clarity Upscaler, SeedVR, GFPGAN, CodeFormer, AuraSR, SwinIR, DDColor |

Access aggregators ([FAL](https://fal.ai/), [Replicate](https://replicate.com/), [kie.ai](https://kie.ai/), and AtlasCloud) carry most of these families, plus community fine-tunes, LoRAs, and control variants.

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
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | Veo 3.1, Veo 3.1 Fast, Veo 3.1 Lite, Gemini Omni Flash |
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
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | Lyria 3.5, Lyria 3 Clip |
| Open models | MusicGen, Stable Audio 2.5, ACE-Step, DiffRhythm, YuE, Riffusion, Flux Music, MMAudio, ThinkSound |

### 3D generation models

Generate 3D assets through `nodetool.model3d.TextTo3D` and `nodetool.model3d.ImageTo3D`.

| Model | Provider | Capabilities | Key features |
|-------|----------|-------------|--------------|
| **Meshy AI** | Meshy (`MESHY_API_KEY`) | T2M/I2M | Textured mesh generation |
| **Rodin AI** | Rodin (`RODIN_API_KEY`) | T2M/I2M | High-fidelity 3D creation |

AtlasCloud also lists 3D models. Open 3D families such as Hunyuan3D and Trellis run through provider-specific FAL and Replicate nodes, not the generic nodes. See [Providers](providers.md) for details.

### Embedding models

Embedding nodes feed RAG and semantic search.

| Provider | Embedding models |
|---|---|
| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | text-embedding-3-small, text-embedding-3-large, ada-002 |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | gemini-embedding-2, gemini-embedding-001 |
| Mistral | mistral-embed |
| Cohere | embed-v4.0, embed-english-v3.0, embed-multilingual-v3.0 |
| Voyage AI | voyage-3.5 and the Voyage line |
| Jina AI | jina-embeddings-v3 |
| Together AI | m2-bert, BGE, and other open embedding models |
| Ollama · llama.cpp local · Transformers.js | Embedding models that run on your machine with no key (Transformers.js downloads ONNX models on first use) |
| vLLM · OpenRouter · Replicate · HuggingFace | Any embedding model the server or provider lists |

### Using these models

| Output | Node |
|---|---|
| Video | `nodetool.video.TextToVideo`, `nodetool.video.ImageToVideo` |
| Images | `nodetool.image.TextToImage` |
| 3D | `nodetool.model3d.TextTo3D`, `nodetool.model3d.ImageTo3D` |
| Music | kie.ai Suno nodes (Generate Music, Extend Music, Upload And Cover Audio, Add Vocals, and others) |

Pick the model in the node's model dropdown. kie.ai (`KIE_API_KEY`) and fal.ai (`FAL_API_KEY`) carry many of these models, often at lower prices than upstream. Cloud models charge per generation, so check the provider's pricing before large runs.

---

## Getting Started

**Local:** open the logo menu, choose **Model Manager**, and on an empty install use **Get Started**. It detects your hardware and lists models that fit. Download a chat model and an image model (progress shows under **Downloads** in the logo menu), then run templates that use them offline.

**Cloud:** get a key from [OpenAI](https://platform.openai.com), [Anthropic](https://www.anthropic.com), or [Google](https://ai.google.dev), paste it in **Settings → Models & Providers**, and select that provider in the AI node.

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
- **[ComfyUI](comfyui.md)** – Run an exported ComfyUI workflow as a node, locally, on a GPU worker, or on Comfy Cloud
- **[Self-Hosted Deployment](self-hosted-deployment.md)** – Secure deployments
- **[Deployment Guide](deployment.md)** – Cloud infrastructure
