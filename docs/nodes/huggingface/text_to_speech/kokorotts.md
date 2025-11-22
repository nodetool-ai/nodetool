---
layout: page
title: "Kokoro TTS"
node_type: "huggingface.text_to_speech.KokoroTTS"
namespace: "huggingface.text_to_speech"
---

**Type:** `huggingface.text_to_speech.KokoroTTS`

**Namespace:** `huggingface.text_to_speech`

## Description

Kokoro is an open-weight, fast, and lightweight TTS model (~82M params) with Apache-2.0 weights.
    It supports multiple languages via `misaki` and provides high-quality speech with selectable voices.
    tts, audio, speech, huggingface, kokoro

    Reference: https://huggingface.co/hexgrad/Kokoro-82M

    Use cases:
    - Natural-sounding speech synthesis for apps, assistants, and narration
    - Low-latency TTS in production or local projects
    - Multi-language TTS with configurable voices and speed

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The Kokoro repo to use (e.g., hexgrad/Kokoro-82M) | `{'type': 'hf.text_to_speech', 'repo_id': 'hexgrad/Kokoro-82M', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| text | `any` | Input text to synthesize | `Hello from Kokoro.` |
| lang_code | `any` | Language code for G2P. Examples: 'a' (American English), 'b' (British English), 'e' (es), 'f' (fr-fr), 'h' (hi), 'i' (it), 'p' (pt-br), 'j' (ja), 'z' (zh). | `a` |
| voice | `any` | Voice name (see VOICES.md on the model page). Examples: af_heart, af_bella, af_jessica. | `af_heart` |
| speed | `any` | Speech speed multiplier (0.5–2.0) | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `any` |  |
| chunk | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_speech](../) namespace.

