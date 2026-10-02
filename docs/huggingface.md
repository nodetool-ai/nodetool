---
layout: page
title: "HuggingFace Integration"
description: "How NodeTool uses Hugging Face: the hosted Inference Providers nodes, local Transformers.js nodes, Hub downloads, tokens, and gated models."
---

# <img src="assets/icons/huggingface.svg" width="28" height="28" style="vertical-align: middle; display: inline-block;" alt="HuggingFace" /> HuggingFace Integration

NodeTool uses Hugging Face in five ways. Each has different requirements.

| Surface | Runs | Needs | Where it appears |
|---|---|---|---|
| **HuggingFace provider** | Hosted, on Hugging Face Inference Providers | `HF_TOKEN` | Generic nodes (chat, image, video, TTS, ASR, embeddings) |
| **`huggingface.*` nodes** | Hosted, on the same router | `HF_TOKEN` | One node per Inference Providers task |
| **`transformers.*` nodes** | Locally, in-process, ONNX | The Transformers.js runtime, no key | Local small models |
| **`nodetool-huggingface` pack** | Locally, Python (Diffusers, Transformers) | The pack, from the Package Manager | Local image, audio, and speech models |
| **Model Manager Hub source** | Downloads Hub repos to disk | A token for gated repos | [Models Manager](models-manager.md) |

## HuggingFace provider

The provider (id `huggingface`) routes generic nodes to Hugging Face Inference Providers through the `@huggingface/inference` client. It offers text-to-image, image-to-image, text-to-video, text-to-speech, speech recognition, and embeddings, plus chat. Tool calling is off.

Model lists come from the Hub. For each task NodeTool asks for models with warm inference, sorted by likes, limited to 100, and caches the answer for 10 minutes. A token is required. Without one the provider does not register as configured. If the `@huggingface/inference` package is missing, the provider reports it instead of failing at the first call. See [Providers](providers.md#huggingface) for how it fits with other providers.

## `huggingface.*` task nodes

Nineteen nodes call the Inference Providers router at `https://router.huggingface.co`. Chat completion uses the OpenAI-compatible `/v1/chat/completions` route. Every other task posts to `/hf-inference/models/{model}`. Each node has a `model` field that defaults to a recommended model for its task. Enter any repo id that serves that pipeline to use another.

| Group | Nodes |
|---|---|
| Text | Chat Completion, Text Generation, Summarization, Translation, Fill Mask, Question Answering, Table Question Answering, Feature Extraction, Text Classification, Token Classification, Zero Shot Classification |
| Image | Text to Image, Image to Image, Image Classification, Image Segmentation, Object Detection |
| Audio | Automatic Speech Recognition, Audio Classification |
| Video | Text to Video |

Text to Image takes a prompt, negative prompt, width, height, guidance scale, inference steps, and seed. Node references are in the [`huggingface` namespace](nodes/huggingface/index.md).

These nodes need a Hugging Face access token with the **Inference Providers** permission, stored as `HF_TOKEN`. `HUGGINGFACE_API_KEY` is also accepted. Without a token the node fails with `HF_TOKEN is not configured`.

## Transformers.js nodes (local ONNX)

The `transformers.*` nodes run ONNX models inside the NodeTool backend. They need no key and no Python.

- **Text:** Text Classification, Token Classification, Question Answering, Summarization, Translation, Text Generation, Fill Mask, Feature Extraction, Zero Shot Classification
- **Vision:** Image Classification, Object Detection, Image To Text, Zero Shot Image Classification
- **Audio:** Automatic Speech Recognition, Audio Classification, Text To Speech

Install the **Transformers.js** runtime from the Package Manager first. Without it, the first run fails and names the missing runtime. Models must be ONNX exports, usually from the `Xenova/*` or `onnx-community/*` Hub organizations. Each node defaults to a recommended repo. Models download on first use into `<data-dir>/transformers-js-cache`, or the directory in the `TRANSFORMERS_JS_CACHE_DIR` setting. This cache is separate from the Hugging Face Hub cache. The same models also serve the `transformers_js` provider for chat, TTS, ASR, and embeddings. Node references are in the [`transformers` namespace](nodes/transformers/index.md).

## Local Python pack

The optional `nodetool-huggingface` pack adds local Diffusers and Transformers nodes for image, audio, and speech models. Install it from the Package Manager. It depends on PyTorch, and the desktop Package Manager handles it as a PyTorch-dependent package. NodeTool does not install it by default. When the Python worker runs, its local Hugging Face provider appears as `huggingface-local`, so it does not clash with the hosted `huggingface` provider.

The Model Manager recognizes the model types this pack uses, such as Flux (including Kontext, Canny, Depth, and Redux), Stable Diffusion 1.5, XL, and 3, Qwen Image and Qwen Image Edit, ControlNet, IP Adapter, and LoRA. Variants such as Nunchaku 4-bit and MLX are also detected. The pack's own node reference ships with the pack.

## Authentication and gated models

Create a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens). Which token a feature reads depends on the feature.

| Feature | Token source |
|---|---|
| HuggingFace provider and `huggingface.*` nodes | The stored `HF_TOKEN` secret, then the `HF_TOKEN` environment variable. Paste it into the HuggingFace card in **Settings → Models & Providers**, or run `nodetool secrets store HF_TOKEN` |
| Local Hub downloads | The `HF_TOKEN`, `HF_API_TOKEN`, or `HUGGING_FACE_HUB_TOKEN` environment variable, then the token file from `hf auth login` (`$HF_TOKEN_PATH`, or `token` under `$HF_HOME`, default `~/.cache/huggingface/token`) |
| Hub search in the Model Manager | The `HF_TOKEN` or `HUGGING_FACE_HUB_TOKEN` environment variable, sent when set |
| Downloads to an attached worker | The stored `HF_TOKEN` secret first, then the same environment and token file. The server sends it to the worker, which has no token of its own |

A token pasted in Settings therefore does not authenticate local Hub downloads. For a gated repo on your own machine, set `HF_TOKEN` in the environment before starting NodeTool, or run `hf auth login`, and restart the server.

### Gated models

Some repos, such as FLUX.1 dev, require you to accept a license:

1. Open the model page on huggingface.co while signed in.
2. Accept the license or choose **Request access**, and wait if approval is manual.
3. Make sure the token above has read access, then retry the download.

A blocked download shows a message starting `Hugging Face blocked this download` with these steps.

## Model cache

Hub downloads use the standard Hugging Face hub cache, `~/.cache/huggingface/hub` by default. `HF_HOME` or `HF_HUB_CACHE` relocate it. The Model Manager's **Installed** source lists what is in it and can delete cached models. See [Models Manager](models-manager.md#storage-location).

## Troubleshooting

**`HF_TOKEN is not configured`.** A `huggingface.*` node ran without a token. Add `HF_TOKEN` in Settings or the environment. The token needs the Inference Providers permission.

**`@huggingface/inference is required for HuggingFaceProvider`.** The optional client package is not installed. Install it with `npm install @huggingface/inference`.

**401 or 403 on a download.** The repo is gated or private, or the token is missing. Follow [Gated models](#gated-models). Remember that local downloads read the environment or token file, not the Settings secret.

**A `transformers.*` node fails on first run.** Install the Transformers.js runtime from the Package Manager.

**A model is missing from the HuggingFace provider's picker.** The list contains only the 100 most-liked models with warm inference per task. Use a `huggingface.*` node and enter the repo id, or download the model through the Model Manager.

## Related documentation

- [Models Manager](models-manager.md): browse, download, and delete local models
- [Supported Models](models.md): local engines and model types
- [Providers](providers.md): every provider and its key
- [`huggingface` nodes](nodes/huggingface/index.md) and [`transformers` nodes](nodes/transformers/index.md): node reference
- [Hugging Face provider guide](developer/providers/huggingface.md): how the provider is built
- [Hugging Face Hub](https://huggingface.co/models)
