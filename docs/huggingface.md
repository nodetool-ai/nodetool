---
layout: page
title: "HuggingFace Integration"
description: "How NodeTool uses Hugging Face: the hosted Inference Providers nodes, local Transformers.js nodes, Hub downloads, tokens, and gated models."
---

# <img src="assets/icons/huggingface.svg" width="28" height="28" style="vertical-align: middle; display: inline-block;" alt="HuggingFace" /> HuggingFace Integration

> **Runs:** hosted on Hugging Face, or locally, depending on the option below. **Needs:** a Hugging Face token for hosted models and gated downloads, nothing for public local models.
{: .callout-note}

NodeTool uses Hugging Face in four ways. Pick the one that matches what you want to do.

## Which one do I want?

| I want to | Use | Steps |
|---|---|---|
| Run models hosted by Hugging Face, with no download | The **HuggingFace** provider and the `huggingface.*` nodes | Paste a token into the HuggingFace card in **Settings → Models & Providers**. Then pick a HuggingFace model in any model menu |
| Run small models on my own machine with no key and no Python | The `transformers.*` nodes (Transformers.js) | Install **Transformers.js** from the Package Manager. Add a `transformers.*` node to your workflow |
| Run larger image, audio and speech models on my own GPU | The `nodetool-huggingface` Python pack | Open **Package Manager → Python nodes** and install the pack |
| Download a model file to disk | The Models Manager | Choose **Model Manager** in the logo menu, search the **Hub** source and click **Download**. See [Models Manager](models-manager.md) |

## HuggingFace provider

The HuggingFace provider sends chat, image, video, speech, transcription and embedding requests to Hugging Face's hosted service, called Inference Providers. Hugging Face runs the model and you download nothing. It appears in the model menus once a token is saved.

Tool calling is off for this provider. Each model menu lists the 100 most-liked models that Hugging Face currently has running and ready to answer, per task. The list is cached for 10 minutes. Without a token the provider does not appear as configured.

## `huggingface.*` task nodes

Nineteen nodes call the same hosted service, one per task. Each node has a `model` field that defaults to a recommended model. Enter any repo id that serves that task to use another.

| Group | Nodes |
|---|---|
| Text | Chat Completion, Text Generation, Summarization, Translation, Fill Mask, Question Answering, Table Question Answering, Feature Extraction, Text Classification, Token Classification, Zero Shot Classification |
| Image | Text to Image, Image to Image, Image Classification, Image Segmentation, Object Detection |
| Audio | Automatic Speech Recognition, Audio Classification |
| Video | Text to Video |

Text to Image takes a prompt, negative prompt, width, height, guidance scale, inference steps, and seed. Node references are in the [`huggingface` namespace](nodes/huggingface/index.md).

These nodes need a token with the **Inference Providers** permission, saved as `HF_TOKEN`. Without one the node fails with `HF_TOKEN is not configured`. A token that only has Hub read access is not enough.

## Transformers.js nodes (local, no key)

The `transformers.*` nodes run small models inside the NodeTool backend. They need no key and no Python.

- **Text:** Text Classification, Token Classification, Question Answering, Summarization, Translation, Text Generation, Fill Mask, Feature Extraction, Zero Shot Classification
- **Vision:** Image Classification, Object Detection, Image To Text, Zero Shot Image Classification
- **Audio:** Automatic Speech Recognition, Audio Classification, Text To Speech, Text To Music

Install the **Transformers.js** runtime from the Package Manager first. Without it, the first run fails and names the missing runtime. These nodes need models published in ONNX format, a portable model file type. Look for repos from the `Xenova` or `onnx-community` organizations on the Hub. Each node defaults to a recommended repo, and models download on first use. Text To Music makes instrumental music only and stops at 30 seconds. The same models also serve the `transformers_js` provider for chat, speech, music, transcription and embeddings. Node references are in the [`transformers` namespace](nodes/transformers/index.md). Where the downloads are stored is under [Hugging Face tokens and cache](server-configuration.md#cache-locations).

## Local Python pack

The optional `nodetool-huggingface` pack adds local nodes for image, audio and speech models. Install it from **Package Manager → Python nodes**, which sets up Python first if it is missing. The desktop app installs the PyTorch build that matches your graphics card. See [GPU requirements](advanced-install.md#gpu-requirements). Without the desktop app, see [Python nodes without the desktop app](advanced-install.md#python-nodes-without-the-desktop-app). NodeTool does not install the pack by default. When the Python worker runs, its local provider appears as `huggingface-local`, so it does not clash with the hosted `huggingface` provider.

The Models Manager recognizes the model types this pack uses, such as Flux (including Kontext, Canny, Depth, and Redux), Stable Diffusion 1.5, XL, and 3, Qwen Image and Qwen Image Edit, ControlNet, IP Adapter, and LoRA. MLX variants are also detected. The pack's own node reference ships with the pack.

## Authentication and gated models

Create a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) and paste it into the HuggingFace card in **Settings → Models & Providers**. That one token covers the provider, the `huggingface.*` nodes and Models Manager downloads. For a gated repo, download the model in the Models Manager before you run the workflow. A Python node that downloads on its own may not receive the Settings token. In that case set `HF_TOKEN` in the environment before starting NodeTool, or run `hf auth login`. Which feature reads the token from where, the cache folders and the Hub mirror setting are in [Hugging Face tokens and cache](server-configuration.md#hugging-face-tokens-and-cache).

### Gated models

Some repos, such as FLUX.1 dev, require you to accept a license:

1. Open the model page on huggingface.co while signed in.
2. Accept the license or choose **Request access**, and wait if approval is manual.
3. Make sure the token has read access, then retry the download.

A blocked download shows a message starting `Hugging Face blocked this download` with these steps.

## Troubleshooting

**`HF_TOKEN is not configured`.** Add the token in **Settings → Models & Providers**.

**The HuggingFace provider reports a missing client package.** A normal NodeTool install includes it. Reinstall NodeTool.

**401 or 403 on a download.** The repo is gated or private, or the token is missing. Follow [Gated models](#gated-models). The CLI and Python nodes may not read the Settings token. See [which token each feature reads](server-configuration.md#hugging-face-tokens-and-cache).

**A `transformers.*` node fails on first run.** Install the Transformers.js runtime from the Package Manager.

**A model is missing from the HuggingFace provider's picker.** The list contains only the 100 most-liked ready-to-run models per task. Use a `huggingface.*` node and enter the repo id, or download the model through the Models Manager.

Self-hosting or using the CLI? See [Hugging Face tokens and cache](server-configuration.md#hugging-face-tokens-and-cache) and the [Hugging Face provider guide](developer/providers/huggingface.md).

## Related documentation

- [`huggingface` nodes](nodes/huggingface/index.md) and [`transformers` nodes](nodes/transformers/index.md): node reference
- [Models Manager](models-manager.md): download and delete models
- [Hugging Face Hub](https://huggingface.co/models)
