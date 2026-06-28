---
layout: page
title: "Provider Guides: Add Models & Nodes"
description: "Per-provider runbooks for adding new models and nodes to NodeTool — written for coding agents and contributors."
---

One runbook per provider for adding new models and nodes. Each guide names the exact files, the command to run, a copy-pasteable snippet, and how the same change looked in past PRs.

> **Audience:** coding agents and contributors keeping NodeTool current — a new image model shipped, a new endpoint went live, a new provider needs wiring. Start with the provider you're updating; each guide is self-contained.

NodeTool spans many providers but only a few distinct mechanisms. Find your provider's mechanism first — it tells you whether a new model needs zero code, a manifest entry, or a codegen run.

## How adding a model works, by mechanism

| Mechanism | What "add a model" means | Providers |
| :-------- | :----------------------- | :-------- |
| **Dynamic fetch** | Nothing — models appear from the provider's live `/models` (or local daemon) endpoint. Code only for capability/cost overrides. | [OpenAI](openai.md) (chat), [Anthropic](anthropic.md), [Gemini](gemini.md) (text), [xAI](xai.md), [OpenAI-compatible](openai-compatible.md) (Groq, Mistral, DeepSeek, Moonshot, Cerebras, Cohere, OpenRouter), [Ollama](ollama.md), [Local inference](local-inference.md) (LM Studio, llama.cpp, vLLM) |
| **Static model list** | A code edit to a hardcoded array in the provider (plus cost entry). | [OpenAI](openai.md) (image), [Gemini](gemini.md) (Imagen/Veo) |
| **Codegen from upstream schemas** | Add an endpoint id to a config, run the generator — the manifest is regenerated, never hand-edited. | [FAL](fal.md), [Replicate](replicate.md), [KIE](kie.md) |
| **Hand-maintained manifest** | Add a JSON entry to the package manifest. | [AtlasCloud](atlascloud.md), [Topaz](topaz.md), [Together](together.md) |
| **Static node package** | Add a model id to the provider/base arrays, or a new `BaseNode` subclass. | [MiniMax](minimax.md), [Reve](reve.md), [ElevenLabs](elevenlabs.md), [HuggingFace](huggingface.md) |

## All guides

- **[OpenAI](openai.md)** — chat models auto-fetch; image models (`gpt-image-*`) are a static list.
- **[Anthropic (Claude)](anthropic.md)** — models fetched live from the Anthropic API.
- **[Google Gemini](gemini.md)** — text auto-fetches; Imagen/Veo are static lists.
- **[xAI (Grok)](xai.md)** — chat, image, and video classified from `/v1/models`.
- **[OpenAI-compatible providers](openai-compatible.md)** — Groq, Mistral, DeepSeek, Moonshot, Cerebras, Cohere, OpenRouter, and how to add a new one.
- **[FAL](fal.md)** — nodes generated from FAL OpenAPI schemas via codegen.
- **[Replicate](replicate.md)** — nodes generated from Replicate model schemas via codegen.
- **[KIE](kie.md)** — nodes generated from per-model configs into a manifest.
- **[AtlasCloud](atlascloud.md)** — hand-maintained manifest drives nodes and the model picker.
- **[Topaz](topaz.md)** — manifest-driven image/video enhancement nodes.
- **[Together AI](together.md)** — generated image/video manifest plus live-fetched chat models.
- **[MiniMax](minimax.md)** — chat, image, video, and audio via provider arrays and a node pack.
- **[Reve](reve.md)** — image create/edit/remix nodes.
- **[ElevenLabs](elevenlabs.md)** — TTS models and voices as static arrays (decorator package).
- **[HuggingFace](huggingface.md)** — Hub-backed model discovery plus a hand-written node pack.
- **[Ollama](ollama.md)** — local models discovered from the running daemon (`ollama pull`).
- **[Local inference](local-inference.md)** — LM Studio, llama.cpp, vLLM over OpenAI-compatible localhost.

## Before you open a PR

Whatever the mechanism, run the full check from the repo root:

```bash
npm run check   # typecheck + lint + test across web, electron, mobile
```

For decorator/codegen packages (FAL, Replicate, KIE, ElevenLabs, and other `dist/`-loaded packs), run `npm run build:packages` after regenerating so the runtime picks up the change. Each guide lists its exact verify commands.

Contributions are welcome — open a PR on [GitHub](https://github.com/nodetool-ai/nodetool) or say hi on [Discord](https://discord.gg/WmQTWZRcYE).
